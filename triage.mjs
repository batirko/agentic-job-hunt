#!/usr/bin/env node

/**
 * triage.mjs — Cheap screening layer between the scan inbox and full evaluation
 *
 * pipeline.md is a queue: raw URLs in scan order, no judgment. applications.md
 * is the tracker: one row per role that earned a full A-G evaluation. Nothing
 * sat in between, so the only way to learn a role was irrelevant was to spend
 * real effort on it.
 *
 * This reads the inbox, applies signals that cost nothing (archetype keywords
 * in the title, seniority, location tier, agency/staffing patterns, German-
 * language titles, prior history with the company) and writes data/triage.md
 * as a review table sorted worth-a-look first.
 *
 * Zero network, zero LLM tokens — pure string work over files already on disk.
 *
 * The verdicts are HEURISTIC. They are a reading order, not a decision. Titles
 * are thin evidence, so the bias is deliberately toward showing rather than
 * hiding: nothing is dropped from the file, and ambiguity lands in "maybe".
 *
 * Usage:
 *   node triage.mjs                    # everything pending in the inbox
 *   node triage.mjs --since 2026-08-03 # only what a scan added on/after a date
 *   node triage.mjs --out data/x.md    # write somewhere else
 *   node triage.mjs --drain            # preview clearing 🔴 and 🔵 from the inbox
 *   node triage.mjs --drain --apply    # actually clear them
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { linkedinJobId, parsePipelineLine } from './scan-core.mjs';
import { splitRow } from './markdown-core.mjs';

const PIPELINE_PATH = 'data/pipeline.md';
// Both tracker files. The archive is where skipped, rejected and retired roles
// go, and those are exactly the ones that must never resurface as fresh leads.
const APPLICATIONS_PATHS = ['data/applications.md', 'data/applications-archive.md'];
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const EXCLUDED_PATH = 'data/excluded.md';
const DEFAULT_OUT = 'data/triage.md';

// ── Signals ─────────────────────────────────────────────────────────

// Archetype lanes, keyed to config/profile.yml → target_roles.archetypes.
// Order matters: the first match becomes the primary lane shown.
//
// Terms are matched with an optional trailing "s". Without it `\bplatform\b`
// misses "Platforms" and `\bdeveloper solution\b` misses "Developer Solutions",
// which silently buried real matches (Coder, NVIDIA, BT Group) in the drop pile.
const LANE_TERMS = [
  ['DevEx', ['developer experience', 'devex', 'devx', 'developer productivity',
    'developer tool', 'developer platform', 'developer solution', 'developer portal',
    'developer', 'internal developer', 'backstage', 'techdocs', 'golden path',
    'platform engineering', 'code quality', 'ide', 'sdlc', 'ci/cd']],
  ['Platform', ['platform', 'infrastructure', 'catalog', 'self-service', 'self service',
    'observability', 'monitoring', 'telemetry', 'cloud', 'core service', 'networking',
    'virtualization', 'compute', 'storage', 'streaming', 'data platform']],
  ['Integrations', ['integration', 'connector', 'connectivity', 'api', 'sdk',
    'ecosystem', 'marketplace', 'interoperability', 'partner platform', 'webhook']],
  ['AI', ['ai', 'llm', 'genai', 'gen ai', 'agentic', 'agent', 'machine learning',
    'ml', 'rag', 'copilot', 'artificial intelligence', 'ki']],
  ['AppSec', ['security', 'appsec', 'vulnerability', 'sast', 'dast', 'supply chain']],
];

const LANES = LANE_TERMS.map(([name, terms]) => [
  name,
  new RegExp(`\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?\\b`, 'i'),
]);

// Not a lane of its own, but his profile treats technical depth as a
// qualifier — a "Senior Technical Product Manager" is worth a look even when
// the title names no domain.
const TECHNICAL_RE = /\b(technical|technology|engineering)\b/i;

// Lanes that carry weight 1.2-1.3 in the profile. AppSec is tertiary (0.7).
const PRIMARY_LANES = new Set(['DevEx', 'Platform', 'Integrations', 'AI']);

const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|head of|director|group product)\b/i;
const JUNIOR_RE = /\b(junior|jr\.?|intern|internship|working student|praktikant|graduate|trainee|apprentice|associate product)\b/i;

// German words that only appear in a German-language posting. "(m/w/d)" is NOT
// here on purpose — English JDs at German employers carry it routinely.
const GERMAN_RE = /\b(kundenkontakt|vertrieb|einkauf|entwicklung|bereich|betreuung|digitalisierung|mitarbeiter|leiter|fachbereich|schwerpunkt|technischer|kaufmann|kauffrau|standort|abteilung)\b/i;

// Staffing, recruiting and body-shop listings. Not an automatic kill — plenty
// are real roles — but the employer is hidden, so they cannot be judged on
// company quality and rarely sponsor. They get capped at "maybe".
const AGENCY_RE = /\b(recruit|recruitment|recruiting|appointments|talent|resourcing|staffing|headhunt|search (group|partners|associates)|consultancy|personnel|jobs?$|hire|hiring)\b/i;
const AGENCY_NAMES = new Set([
  'jobgether', 'devjobs', 'pms for hire', 'mason alexander', 'morgan mckinley',
  'la fosse', 'twentyai', 'profectus recruitment', 'skillful', 'diagonal recruitment',
  'proactive.it appointments ltd.', 'mcgregor boyall', 'consultport', 'arrows',
  'euphoric', 'bgbx', 'cos', 'amaris consulting', 'globallogic', 'tiebreak',
  'findr', 'phoeniqs', 'nigel frank', 'harnham', 'oho group', 'x4 technology',
]);

function detectLanes(title) {
  return LANES.filter(([, re]) => re.test(title)).map(([name]) => name);
}

function isAgency(company) {
  const c = company.toLowerCase().trim();
  return AGENCY_NAMES.has(c) || AGENCY_RE.test(c);
}

// ── Parsing ─────────────────────────────────────────────────────────

/**
 * Pipeline lines look like: `- [ ] url | company | title | location | tier X | posted DATE`
 *
 * Line shape is decided in scan-core.mjs next to the writer; the pipe escaping
 * both sides rely on lives in markdown-core.mjs. Pipes occur inside real titles
 * and company names, so reader and writer have to share one convention.
 */
function parsePipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const out = [];
  for (const line of readFileSync(PIPELINE_PATH, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('- [')) continue;
    const entry = parsePipelineLine(t);
    // Keep the source line: --drain has to find it again to remove it.
    if (entry) out.push({ ...entry, raw: t });
  }
  return out;
}

/** url → first_seen, so --since can filter to one scan's additions. */
function loadFirstSeen() {
  const map = new Map();
  if (!existsSync(SCAN_HISTORY_PATH)) return map;
  for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
    const [url, firstSeen] = line.split('\t');
    if (!url) continue;
    const id = linkedinJobId(url);
    map.set(id ? `li:${id}` : url, firstSeen);
  }
  return map;
}

function firstSeenOf(map, url) {
  const id = linkedinJobId(url);
  return map.get(id ? `li:${id}` : url) || '';
}

/**
 * Normalize a role title so tracker rows and live postings compare equal.
 *
 * The tracker is written by hand and abbreviates ("Senior PM, Infrastructure
 * Observability"); postings spell it out ("Senior Product Manager,
 * Infrastructure Observability"). Matching raw strings therefore almost never
 * fires, which let roles he was already rejected for come back as fresh leads.
 */
export function normalizeRole(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\((?:all genders|[mwfdx](?:\s*\/\s*[mwfdx])+)\)/g, ' ') // (m/f/d), (all genders)
    .replace(/\b(m|w|f|d|x)\s*\/\s*(m|w|f|d|x)(\s*\/\s*(m|w|f|d|x))?\b/g, ' ')
    .replace(/\btpm\b/g, ' technical product manager ')
    .replace(/\bpm\b/g, ' product manager ')
    .replace(/\bpo\b/g, ' product owner ')
    .replace(/\b(sr|snr)\b\.?/g, ' senior ')
    .replace(/\bjr\b\.?/g, ' junior ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATIVE_STATUS = { '❌': 'rejected', '🚫': 'discarded', '⏭️': 'marked SKIP', '👻': 'no reply' };
const ACTIVE_STATUS = { '🎯': 'interviewing', '💰': 'offer', '✅': 'applied', '📬': 'responded' };

/**
 * Tracker history, keyed by company. Every prior row is kept, because a
 * rejection on a DIFFERENT role at the same company is still worth knowing
 * even though it should not block a fresh application.
 *
 * Deliberately not scan-core's loadSeenCompanyRoles(): that one also indexes
 * pipeline.md for cross-source scan dedup, so using it here would match every
 * inbox row against itself and empty the report.
 */
function loadEvaluated() {
  const companies = new Set();
  const byCompany = new Map();
  // URL is the only unambiguous join between a posting and a tracker row.
  // Names drift in both directions — the tracker says "Global Payments" where
  // LinkedIn says "Global Payments Inc.", and tracker role titles get enriched
  // ("Senior Product Manager (Coder Agents)"). Matching on those alone made
  // already-tracked roles resurface as fresh leads.
  const urls = new Map();

  for (const path of APPLICATIONS_PATHS) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cols = splitRow(line);
    if (cols.length < 8) continue;
    const date = cols[1]?.trim();
    const company = cols[2]?.trim().toLowerCase();
    const role = cols[3]?.trim();
    const status = cols[7]?.trim() || '';
    if (!company || company === 'company' || /^-+$/.test(company)) continue;

    companies.add(company);
    if (!byCompany.has(company)) byCompany.set(company, []);
    const entry = { date, role, status, norm: normalizeRole(role) };
    byCompany.get(company).push(entry);

    const url = (line.match(/https?:\/\/[^\s|)\]]+/) || [])[0];
    if (url) {
      const id = linkedinJobId(url);
      urls.set(id ? `li:${id}` : url.replace(/\/+$/, ''), entry);
    }
  }
  }
  return { companies, byCompany, urls };
}

/** Same posting already in the tracker, matched by URL rather than by name. */
function trackedByUrl(row, urls) {
  const id = linkedinJobId(row.url);
  return urls.get(id ? `li:${id}` : row.url.replace(/\/+$/, '')) || null;
}

/**
 * data/excluded.md — roles reviewed and declined without a full evaluation.
 *
 * Kept out of applications.md on purpose: the tracker's Fit/Odds/Priority
 * columns feed analyze-patterns.mjs, and filling it with unevaluated declines
 * carrying invented scores would corrupt that analysis. A `*` role excludes the
 * whole company.
 */
function loadExclusions() {
  const map = new Map();
  if (!existsSync(EXCLUDED_PATH)) return map;
  for (const line of readFileSync(EXCLUDED_PATH, 'utf-8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cols = splitRow(line);
    if (cols.length < 5) continue;
    const [, date, company, role, reason] = cols;
    if (!company || company.toLowerCase() === 'company' || /^-+$/.test(company)) continue;
    const key = `${company.toLowerCase()}::${role === '*' ? '*' : normalizeRole(role)}`;
    map.set(key, { date, reason });
  }
  return map;
}

function exclusionFor(row, exclusions) {
  const co = row.company.toLowerCase().trim();
  return exclusions.get(`${co}::${normalizeRole(row.title)}`) || exclusions.get(`${co}::*`) || null;
}

/** Prior tracker entries for this posting: the same role first, then the rest. */
function historyFor(row, byCompany) {
  const prior = byCompany.get(row.company.toLowerCase().trim()) || [];
  const norm = normalizeRole(row.title);
  const sameRole = prior.find(p => p.norm === norm);
  return { sameRole, other: prior.filter(p => p !== sameRole) };
}

function describeStatus(s) {
  return NEGATIVE_STATUS[s] || ACTIVE_STATUS[s] || 'evaluated';
}

/**
 * Companies from portals.yml → tracked_companies. That list was curated by
 * archetype (IDP vendors, dev tools, platform companies), so appearing on it
 * is real evidence about the role even when the title says nothing.
 */
function loadTrackedCompanies() {
  const set = new Set();
  if (!existsSync('portals.yml')) return set;
  for (const line of readFileSync('portals.yml', 'utf-8').split('\n')) {
    const m = line.match(/^\s*-\s+name:\s*(.+?)\s*$/);
    if (m) set.add(m[1].replace(/^["']|["']$/g, '').toLowerCase());
  }
  return set;
}

// ── Verdict ─────────────────────────────────────────────────────────

const PROMISING = '🟢';
const MAYBE = '🟡';
// Title named no target domain, so there is no evidence either way. Kept in its
// own bucket rather than dropped: absence of a signal is not a negative signal.
const UNKNOWN = '🔵';
const SKIP = '🔴';

/**
 * How many 🟢 rows the "read these first" block surfaces.
 *
 * Sized to a week of actual review, not to the size of the queue. The queue is
 * a few hundred rows and always will be; a reading order that lists all of them
 * is not a reading order.
 */
const SHORTLIST_N = 25;

function judge(row, ctx) {
  const { title, company, tier } = row;
  const key = company.toLowerCase().trim();
  const { sameRole, other } = historyFor(row, ctx.byCompany);
  const lanes = detectLanes(title);

  // Build the history cell first — it is decision-relevant on every row,
  // including ones that stay green.
  const history = [];
  if (sameRole) history.push(`${sameRole.status || '·'} same role, ${describeStatus(sameRole.status)} ${sameRole.date}`);
  for (const p of other.slice(0, 2)) {
    history.push(`${p.status || '·'} ${describeStatus(p.status)} ${p.date}: ${truncate(p.role, 34)}`);
  }
  if (other.length > 2) history.push(`+${other.length - 2} more`);
  row.history = history;

  // Reviewed and declined previously. Highest-priority block: the whole point
  // of the exclusion list is that these never come back.
  const excluded = exclusionFor(row, ctx.exclusions);
  if (excluded) {
    row.history = [`⛔ excluded ${excluded.date}`, ...history];
    return { verdict: SKIP, lanes, why: [`Excluded: ${excluded.reason}`], known: true };
  }

  // Same posting URL already in the tracker. Strongest possible match.
  const byUrl = trackedByUrl(row, ctx.urls);
  if (byUrl) {
    row.history = [`${byUrl.status || '·'} tracked ${byUrl.date}: ${truncate(byUrl.role, 40)}`, ...history.slice(0, 2)];
    return {
      verdict: SKIP,
      lanes,
      why: [`Already in tracker — ${describeStatus(byUrl.status)} on ${byUrl.date}`],
      known: true,
    };
  }

  // This exact role is already tracked. Re-surfacing it as a new lead is the
  // failure this whole column exists to prevent.
  if (sameRole) {
    return {
      verdict: SKIP,
      lanes,
      why: [`Already in tracker for this role — ${describeStatus(sameRole.status)} on ${sameRole.date}`],
      known: true,
    };
  }

  const primary = lanes.filter(l => PRIMARY_LANES.has(l));
  const senior = SENIOR_RE.test(title);
  const junior = JUNIOR_RE.test(title);
  const german = GERMAN_RE.test(title);
  const technical = TECHNICAL_RE.test(title);
  const agency = isAgency(company);
  const known = ctx.knownCompanies.has(key);
  const tracked = ctx.trackedCompanies.has(key);
  const why = [];

  // Only two things are unambiguous enough to drop on the title alone.
  if (junior) return { verdict: SKIP, lanes, why: ['Below target seniority'], known };
  if (german) return { verdict: SKIP, lanes, why: ['German-language title implies German-language role'], known };

  // A title naming no domain is weak evidence, not proof of a bad role: a bare
  // "Senior Product Manager" at a company already on the curated dev-tools list
  // is a strong lead. Drop only when title AND company both say nothing.
  // A title naming no domain is uninformative, not disqualifying. If the
  // company is on the curated dev-tools list it still earns a real verdict;
  // otherwise it goes to the unknown bucket for a human glance.
  if (row.titleGeneric && !tracked) {
    const bits = ['Title names no domain — needs the JD to judge'];
    if (tier === 'C') bits.push('tier C location');
    if (agency) bits.push('agency/staffing listing');
    if (known) bits.push('company already in tracker');
    return { verdict: UNKNOWN, lanes, why: bits, known };
  }

  if (lanes.length === 0 && !technical && !tracked) {
    return { verdict: SKIP, lanes, why: ['No archetype signal in title or company'], known };
  }

  if (lanes.length) why.push(`${lanes.slice(0, 2).join(' + ')} lane`);
  else if (technical) why.push('technical PM, domain not named in title');
  if (tracked) why.push('on your curated dev-tools company list');
  if (!senior) why.push('title reads below senior');
  if (agency) why.push('agency/staffing listing, employer hidden');
  if (tier === 'C') why.push('tier C location');
  // A rejection on a different role is context, not a blocker — different team,
  // different req. Surfaced so the decision is made knowingly.
  const rejectedBefore = other.some(p => p.status === '❌');
  if (rejectedBefore) why.push('rejected here before on another role');

  // Promising needs archetype evidence, senior framing, a workable location and
  // a named employer. Anything softer stays a maybe for the human to resolve.
  //
  // KNOWN DEFECT, measured 2026-08-17 against 191 applications and 21
  // conversations. `senior` does not belong in these conditions. Titles WITHOUT
  // a seniority word converted at 12.3%; titles with one, at 10.4%. The gate
  // demotes 378 rows to 🟡, and those rows include Bloomberg, Datadog, trivago,
  // Sonar and Constructor — five of the companies that actually replied. Strong
  // employers routinely skip the word ("Product Manager II", "IC4", "Technical
  // Product Manager"). JUNIOR_RE above catches the genuinely junior ones, which
  // is the seniority signal that does hold.
  //
  // It is still here because removing it makes the daily file worse, not
  // better: 🟢 goes from 104 to 313 and fills with staffing agencies and
  // off-target employers (Mondelēz, Thales, McKinsey). The seniority test was
  // silently compensating for a loose lane matcher — LANE_TERMS 'AI' matches any
  // "AI Product Manager", including consumer-marketing roles that share no
  // archetype with a developer platform. Fix the lane matcher first, then delete
  // `senior` from these three lines. Do not delete it on its own.
  //
  // Nothing else available at triage time predicts contact either: the curated
  // company list ran 9.1% against 11.2% off it, and lane-in-title ran 9.5% (AI)
  // and 10.4% (Platform) against a 13.0% base for titles naming no lane. That is
  // why the reading order below ranks on posting freshness, which decays, rather
  // than on a verdict that does not predict.
  const goodLocation = tier === 'S' || tier === 'A';
  const strong = primary.length > 0 && senior && goodLocation && !agency;
  const veryStrong = primary.length >= 2 && senior && !agency;
  const trustedCompany = tracked && senior && goodLocation && !agency;

  if (strong || veryStrong || trustedCompany) return { verdict: PROMISING, lanes, why, known };
  return { verdict: MAYBE, lanes, why, known };
}

// ── Duplicate grouping ──────────────────────────────────────────────

/**
 * One opening advertised across several countries arrives as several rows
 * (Grafana's observability role showed up three times, Majestic Labs' three).
 * They are one decision, so collapse them onto the best-tier row and note the
 * alternates rather than making the reader rediscover that they match.
 */
const normGroupTitle = (t) => t
  .replace(/[\s–—-]+(IL|US|UK|DE|AT|CH|NL|IE|ES|PL|SE|FR|BE|RO|EU)\s*$/i, '') // "… - IL" / "… - US"
  .toLowerCase()
  .replace(/\([^)]*\)/g, ' ')           // "(m/f/d)", "(Remote)"
  .replace(/\b(remote|hybrid|onsite)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Shared by the display grouping and by --drain, so both see one opening. */
function groupKey(r) {
  return `${r.company.toLowerCase().trim()}::${normGroupTitle(r.title)}`;
}

function groupDuplicates(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = groupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    group.sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9));
    const [best, ...rest] = group;
    const others = [...new Set(rest.map(r => r.location).filter(Boolean))];
    best.why = [...best.why, `also posted in ${others.slice(0, 3).join('; ') || `${rest.length} other location(s)`}`];
    out.push(best);
  }
  return out;
}

// ── Drain ───────────────────────────────────────────────────────────

/**
 * The inbox is a queue, and a queue nobody empties stops being one. Two
 * verdicts will never earn a human read:
 *
 *   🔴 already in the tracker, or no archetype signal in title or company.
 *   🔵 the title names no domain, so judging it means reading the JD. Nobody
 *      reads a thousand JDs, and the LinkedIn sweep adds more of these every
 *      run than any week can absorb.
 *
 * Both are removed from pipeline.md and written to scan-history.tsv with
 * status `drained`. History is what the scanners dedup against, so a drained
 * role is remembered and never re-queued. It is NOT written to excluded.md:
 * that file means "a human reviewed this and said no", and these were not
 * reviewed. The scan history is the honest record.
 *
 * One carve-out: a 🔵 at a company already in the tracker survives. You have
 * engaged with them before, so a bare "Product Manager" there is a lead even
 * when the title says nothing. That keeps roughly 90 rows a blanket rule
 * would have thrown away.
 *
 * A role advertised in several countries is one decision, so a group is
 * drained only when every one of its rows is drainable. That way an alternate
 * location can never disappear out from under a row that survives.
 */
function isDrainable(r) {
  if (r.verdict === SKIP) return true;
  return r.verdict === UNKNOWN && !r.known;
}

function selectDrainable(rows) {
  const byGroup = new Map();
  for (const r of rows) {
    const key = groupKey(r);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(r);
  }

  const drain = [];
  for (const group of byGroup.values()) {
    if (group.every(isDrainable)) drain.push(...group);
  }
  return drain;
}

function applyDrain(drained, date) {
  const lines = new Set(drained.map(r => r.raw));
  const kept = readFileSync(PIPELINE_PATH, 'utf-8')
    .split('\n')
    .filter(line => !lines.has(line.trim()));
  writeFileSync(PIPELINE_PATH, kept.join('\n'), 'utf-8');

  // Same six columns the scanners write, so loadSeenUrls picks these up as
  // seen and no future scan can re-add them.
  const rows = drained
    .map(r => `${r.url}\t${date}\ttriage-drain\t${r.title}\t${r.company}\tdrained`)
    .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, rows, 'utf-8');
}

// ── Output ──────────────────────────────────────────────────────────

const VERDICT_RANK = { [PROMISING]: 0, [MAYBE]: 1, [UNKNOWN]: 2, [SKIP]: 3 };
const TIER_RANK = { S: 0, A: 1, B: 2, C: 3 };

function esc(s) {
  return (s || '').replace(/\|/g, '\\|').trim();
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function render(rows, meta) {
  const lines = [];
  lines.push('# Triage — Pending Review');
  lines.push('');
  lines.push('> **What this is.** A cheap screening pass over `data/pipeline.md`, generated by `node triage.mjs`.');
  lines.push('> Verdicts come from the job title, company name and location tier alone — no job description was read,');
  lines.push('> so treat them as a **reading order, not a decision**. Nothing is hidden: every pending role appears here.');
  lines.push('>');
  lines.push('> 🟢 worth a full evaluation · 🟡 needs a human look · 🔵 title says nothing, judge from the JD · 🔴 clear reason to drop');
  lines.push('>');
  lines.push('> **Workflow:** review, then tell the agent which rows to promote. Promoted roles get a full A-G');
  lines.push('> evaluation and land in `data/applications.md`. Everything else stays here and never pollutes the tracker.');
  lines.push('');
  lines.push(`Generated ${meta.date} · ${meta.total} pending · 🟢 ${meta.counts[PROMISING] || 0} · 🟡 ${meta.counts[MAYBE] || 0} · 🔵 ${meta.counts[UNKNOWN] || 0} · 🔴 ${meta.counts[SKIP] || 0}`);
  lines.push('');

  // The queue runs to several hundred rows and a week's review capacity is a
  // few dozen, so the full table below is a reference, not a reading order.
  // This block is the reading order: the freshest 🟢 rows, capped at what can
  // actually be read. Ranked on posting date because that is what decays —
  // nothing else here predicts an answer (see the note above the verdict rules).
  const shortlist = rows
    .filter(r => r.verdict === PROMISING)
    .sort((a, b) => (b.posted || '').localeCompare(a.posted || '') || a.company.localeCompare(b.company))
    .slice(0, SHORTLIST_N);

  if (shortlist.length) {
    const pool = meta.counts[PROMISING] || 0;
    lines.push(`## Read these first — freshest ${shortlist.length} of ${pool} 🟢`);
    lines.push('');
    for (const r of shortlist) {
      const when = r.posted ? `\`${r.posted}\`` : '`undated`';
      const where = r.tier ? ` · tier ${r.tier}` : '';
      lines.push(`- ${when}${where} · **${esc(r.company)}** — [${esc(truncate(r.title, 80))}](${r.url})`);
    }
    lines.push('');
    lines.push(`Everything else is in the table below, newest first within each verdict.`);
    lines.push('');
  }
  lines.push('| ? | Company | Role | Lane | Tier | History | Why | Location | Posted | URL |');
  lines.push('| - | ------- | ---- | ---- | ---- | ------- | --- | -------- | ------ | --- |');

  for (const r of rows) {
    lines.push([
      '',
      r.verdict,
      esc(truncate(r.company, 32)),
      esc(truncate(r.title, 70)),
      r.lanes.slice(0, 2).join(', ') || '—',
      r.tier || '?',
      esc((r.history || []).join('<br>')) || '—',
      esc(truncate(r.why.join('; '), 150)),
      esc(truncate(r.location, 44)),
      r.posted || '',
      r.url,
      '',
    ].join(' | ').replace(/^ \| /, '| ').replace(/ \| $/, ' |'));
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const argOf = (n) => { const i = args.indexOf(`--${n}`); return i !== -1 ? args[i + 1] : null; };
  const since = argOf('since');
  const out = argOf('out') || DEFAULT_OUT;
  const drain = args.includes('--drain');
  const apply = args.includes('--apply');

  const firstSeen = loadFirstSeen();
  const { companies: knownCompanies, byCompany, urls } = loadEvaluated();
  const trackedCompanies = loadTrackedCompanies();
  const exclusions = loadExclusions();

  let rows = parsePipeline();
  const totalParsed = rows.length;

  if (since) {
    rows = rows.filter(r => {
      const seen = firstSeenOf(firstSeen, r.url);
      return seen && seen >= since;
    });
  }

  for (const r of rows) Object.assign(r, judge(r, { knownCompanies, trackedCompanies, byCompany, exclusions, urls }));

  const drainDate = new Date().toISOString().slice(0, 10);
  let drained = [];
  if (drain) {
    drained = selectDrainable(rows);
    const bulk = { [SKIP]: 0, [UNKNOWN]: 0 };
    for (const r of drained) bulk[r.verdict]++;
    console.log(`Drain — ${apply ? 'applying' : 'dry run'}`);
    console.log(`${'━'.repeat(45)}`);
    console.log(`Inbox rows:            ${totalParsed}`);
    console.log(`  ${SKIP} clear drop:        ${bulk[SKIP]}`);
    console.log(`  ${UNKNOWN} title uninformative: ${bulk[UNKNOWN]}`);
    console.log(`Removing:              ${drained.length}`);
    console.log(`Left in the inbox:     ${totalParsed - drained.length}\n`);

    if (apply) {
      applyDrain(drained, drainDate);
      const gone = new Set(drained);
      rows = rows.filter(r => !gone.has(r));
      console.log(`Removed from ${PIPELINE_PATH}, recorded in ${SCAN_HISTORY_PATH} as \`drained\`.`);
      console.log('They are now dedup keys, so no future scan re-adds them.\n');
    } else {
      console.log('Nothing written. Re-run with --apply to remove them.\n');
    }
  }

  const beforeGrouping = rows.length;
  rows = groupDuplicates(rows);

  const counts = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

  rows.sort((a, b) =>
    VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] ||
    (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) ||
    (b.posted || '').localeCompare(a.posted || '') ||
    a.company.localeCompare(b.company));

  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(out, render(rows, { date, total: rows.length, counts }), 'utf-8');

  console.log(`Triage — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Inbox entries parsed:  ${totalParsed}`);
  if (since) console.log(`Filtered to since:     ${since}`);
  if (beforeGrouping !== rows.length) {
    console.log(`Multi-location dupes:  ${beforeGrouping - rows.length} collapsed`);
  }
  console.log(`Pending review:        ${rows.length}`);
  console.log(`  ${PROMISING} worth evaluating:  ${counts[PROMISING] || 0}`);
  console.log(`  ${MAYBE} needs a look:      ${counts[MAYBE] || 0}`);
  console.log(`  ${UNKNOWN} title uninformative: ${counts[UNKNOWN] || 0}`);
  console.log(`  ${SKIP} clear drop:        ${counts[SKIP] || 0}`);
  console.log(`\nWritten to ${out}`);
  console.log('→ Review it, then tell the agent which rows to promote to applications.md.');
}

main();
