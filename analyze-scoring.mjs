#!/usr/bin/env node
/**
 * analyze-scoring.mjs — Is the scoring calibrated?
 *
 * Answers one question: does a score assigned BEFORE applying predict whether
 * the company starts a real conversation? Joins the applied cohort in
 * data/applications.md against the recorded contacts in data/outcomes.tsv.
 *
 * This is deliberately separate from analyze-patterns.mjs. That script asks
 * "which kinds of role reject me"; this one asks "are my own numbers any good".
 *
 * The denominator is every application actually sent. The numerator is every
 * one with a row in outcomes.tsv — absence there means no contact, which is
 * why the file only records what happened.
 *
 * Run: node analyze-scoring.mjs              (human-readable)
 *      node analyze-scoring.mjs --json       (machine-readable)
 *      node analyze-scoring.mjs --min-age 14 (only applications older than N days)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStatus } from './states-core.mjs';
import { parseTracker, parseTrackerAll, resolveTrackerPath, effectiveAppliedDate } from './tracker-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = resolveTrackerPath(CAREER_OPS);
const OUTCOMES_FILE = join(CAREER_OPS, 'data/outcomes.tsv');

// Statuses that mean an application actually went out. 'evaluated' and 'skip'
// never left the building, and 'discarded' covers reqs that closed or that he
// withdrew from, which is not a company decision about him.
const APPLIED_STATUSES = new Set([
  'applied', 'responded', 'interview', 'offer', 'rejected', 'ignored',
]);

// Bands are wider than the scores' own precision on purpose. With a couple of
// dozen positive events, 0.1-wide buckets would report noise as structure.
const BANDS = [
  { label: '<3.0',    lo: 0,   hi: 3   },
  { label: '3.0-3.4', lo: 3,   hi: 3.5 },
  { label: '3.5-3.9', lo: 3.5, hi: 4   },
  { label: '4.0-4.4', lo: 4,   hi: 4.5 },
  { label: '4.5+',    lo: 4.5, hi: 99  },
];

const SCORES = ['priority', 'fit', 'odds'];

// --- CLI ---
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const minAgeIdx = args.indexOf('--min-age');
const MIN_AGE = minAgeIdx !== -1 ? parseInt(args[minAgeIdx + 1], 10) || 0 : 0;

// --- outcomes.tsv ---

/**
 * Parse data/outcomes.tsv into a lookup.
 *
 * Keyed on company + evaluation date, NOT on the report number. Report numbers
 * are not unique in practice — concurrent sessions have handed the same number
 * to different companies (26 covers three rows, 48 covers three more), so a
 * report-number join silently attaches a contact to the wrong application and
 * inflates every rate downstream. The report column is kept for humans and is
 * cross-checked below.
 */
export function parseOutcomes(file) {
  if (!existsSync(file)) return { byCompanyDate: new Map(), rows: [] };

  const byCompanyDate = new Map();
  const rows = [];

  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cells = line.split('\t').map(c => c.trim());
    if (cells[0] === 'report') continue; // header

    const [report, company, date, firstContact, stagesPassed, furthestStage, outcome, reason] = cells;
    if (!company) continue;

    const row = {
      report: parseInt(report, 10) || null,
      company, date,
      firstContact: firstContact || null,
      stagesPassed: parseInt(stagesPassed, 10) || 0,
      furthestStage: furthestStage || null,
      outcome: outcome || null,
      reason: reason || null,
    };
    rows.push(row);
    byCompanyDate.set(`${company}|${date}`, row);
  }
  return { byCompanyDate, rows };
}

const matchOutcome = (entry, outcomes) =>
  outcomes.byCompanyDate.get(`${entry.company}|${entry.date}`) || null;

// --- statistics ---

const pearson = (xs, ys) => {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
};

/**
 * Wilson score interval — the right one for a proportion built from a handful
 * of events. The normal approximation returns negative lower bounds at these
 * counts, which would read as a real number and isn't one.
 */
const wilson = (k, n) => {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - margin) / d), Math.min(1, (centre + margin) / d)];
};

const rate = (rows) => {
  const k = rows.filter(r => r.contact).length;
  const [lo, hi] = wilson(k, rows.length);
  return { n: rows.length, k, rate: rows.length ? k / rows.length : 0, lo, hi };
};

// --- cohort ---

export function buildCohort({ appsFile = null, outcomesFile = OUTCOMES_FILE, today = new Date() } = {}) {
  const outcomes = parseOutcomes(outcomesFile);
  const cohort = [];

  // The cohort is every application that was SENT, and a sent application ends
  // up archived the moment it is rejected or retired. Read both files, or the
  // calibration runs on the few rows still open and reports noise as structure.
  // `appsFile` overrides that for tests, which supply one fixture file.
  const rows = appsFile ? parseTracker(appsFile) : parseTrackerAll(CAREER_OPS);
  for (const entry of rows) {
    const status = normalizeStatus(entry.status) || 'evaluated';
    if (!APPLIED_STATUSES.has(status)) continue;

    const sent = effectiveAppliedDate(entry.notes, entry.date);
    const outcome = matchOutcome(entry, outcomes);

    cohort.push({
      num: entry.num,
      company: entry.company,
      role: entry.role,
      priority: entry.priority,
      fit: entry.fit,
      odds: entry.odds,
      status,
      date: entry.date,
      sent,
      age: Math.round((today - new Date(sent)) / 86400000),
      contact: outcome ? 1 : 0,
      stagesPassed: outcome ? outcome.stagesPassed : 0,
      furthestStage: outcome ? outcome.furthestStage : null,
    });
  }

  // An outcome row that matches no application means the tracker and the
  // outcomes file have drifted apart. Report it rather than dropping it: a
  // silently unmatched contact deflates every rate in the output.
  const matchedKeys = new Set(cohort.filter(c => c.contact).map(c => `${c.company}|${c.date}`));
  const orphans = outcomes.rows.filter(r => !matchedKeys.has(`${r.company}|${r.date}`));

  // The report column is documentation, not a key. When it disagrees with the
  // row it landed on, say so — that is the duplicate-report-number bug showing
  // itself, and it is worth seeing rather than routing around.
  const reportMismatches = [];
  for (const c of cohort.filter(x => x.contact)) {
    const o = outcomes.byCompanyDate.get(`${c.company}|${c.date}`);
    if (o && o.report !== null && c.num !== null && o.report !== c.num) {
      reportMismatches.push({ company: c.company, date: c.date, outcomes: o.report, tracker: c.num });
    }
  }

  return { cohort, orphans, reportMismatches, outcomes };
}

export function analyse(cohort) {
  const contacts = cohort.filter(c => c.contact);
  const result = {
    n: cohort.length,
    contacts: contacts.length,
    baseRate: cohort.length ? contacts.length / cohort.length : 0,
    scores: {},
    gates: {},
    stages: {},
  };

  for (const key of SCORES) {
    result.scores[key] = {
      r: pearson(cohort.map(c => c[key]), cohort.map(c => c.contact)),
      bands: BANDS.map(b => ({
        label: b.label,
        ...rate(cohort.filter(c => c[key] >= b.lo && c[key] < b.hi)),
      })),
    };
  }

  // Candidate cut points for the apply gate, so the threshold is a reading of
  // the data rather than a habit.
  for (const cut of [3.0, 3.5, 4.0, 4.5]) {
    result.gates[cut.toFixed(1)] = {
      above: rate(cohort.filter(c => c.priority >= cut)),
      below: rate(cohort.filter(c => c.priority < cut)),
    };
  }

  // How deep the conversations went, which separates "got a screen" from
  // "nearly got hired".
  for (const c of contacts) {
    const key = c.furthestStage || 'unknown';
    result.stages[key] = (result.stages[key] || 0) + 1;
  }
  result.medianStages = median(contacts.map(c => c.stagesPassed));

  return result;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- output ---

const pct = v => (v * 100).toFixed(1) + '%';
const oneIn = (k, n) => (k ? `1 in ${Math.round(n / k)}` : 'none');

function printReport(result, orphans, reportMismatches, minAge) {
  const scope = minAge ? ` (applications at least ${minAge} days old)` : '';
  console.log(`\nScoring calibration${scope}`);
  console.log(`${result.n} applications sent, ${result.contacts} produced a real conversation ` +
    `(${pct(result.baseRate)}, ${oneIn(result.contacts, result.n)})\n`);

  for (const key of SCORES) {
    const s = result.scores[key];
    console.log(`  ${key.toUpperCase().padEnd(9)} r = ${s.r.toFixed(3)}`);
    for (const b of s.bands) {
      const bar = '█'.repeat(Math.round(b.rate * 40));
      console.log(`    ${b.label.padEnd(9)} ${String(b.k).padStart(2)}/${String(b.n).padEnd(3)} ` +
        `${pct(b.rate).padStart(6)}  ${bar}`);
    }
    console.log('');
  }

  console.log('  Gate options (priority):');
  for (const [cut, g] of Object.entries(result.gates)) {
    console.log(`    >= ${cut}   above: ${String(g.above.k).padStart(2)}/${String(g.above.n).padEnd(3)} ` +
      `${pct(g.above.rate).padStart(6)}   below: ${String(g.below.k).padStart(2)}/${String(g.below.n).padEnd(3)} ` +
      `${pct(g.below.rate).padStart(6)}`);
  }

  console.log('\n  Furthest stage reached:');
  const order = ['screen', 'hiring_manager', 'technical', 'case_study', 'final', 'offer', 'unknown'];
  for (const stage of order) {
    if (result.stages[stage]) console.log(`    ${stage.padEnd(16)} ${result.stages[stage]}`);
  }
  console.log(`    median stages passed: ${result.medianStages}`);

  if (orphans.length) {
    console.log(`\n  ⚠️  ${orphans.length} outcome row(s) match no sent application:`);
    for (const o of orphans) console.log(`     ${o.company} (${o.date})`);
  }
  if (reportMismatches.length) {
    console.log(`\n  ⚠️  ${reportMismatches.length} outcome row(s) name a report number the tracker disagrees with:`);
    for (const m of reportMismatches) {
      console.log(`     ${m.company} (${m.date}): outcomes says ${m.outcomes}, tracker says ${m.tracker}`);
    }
  }
  console.log('');
}

// --- CLI ---

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const { cohort, orphans, reportMismatches } = buildCohort();
  const scoped = MIN_AGE ? cohort.filter(c => c.age >= MIN_AGE) : cohort;
  const result = analyse(scoped);

  if (jsonMode) {
    console.log(JSON.stringify({ ...result, minAge: MIN_AGE, orphans, reportMismatches }, null, 2));
  } else {
    printReport(result, orphans, reportMismatches, MIN_AGE);
  }
}
