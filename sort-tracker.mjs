#!/usr/bin/env node
/**
 * sort-tracker.mjs — Sort applications.md into status groups, then rank each
 * group by the key that group is actually used for.
 *
 * Group order:
 *   0 — Unapplied   (blank — evaluated, apply decision not yet made)
 *   1 — Pending     (🎯 📬 💰 — a live conversation with the company)
 *   2 — Applied     (✅ — sent, no reply yet)
 *   3 — Skip        (⏭️)
 *   4 — Closed/Out  (❌ rejected | 🚫 discarded)
 *   5 — Ignored     (👻 — applied, ghosted, retired)
 *
 * Within a group the primary key depends on what the group is FOR:
 *
 *   Unapplied sorts by LANE, then by POSTING FRESHNESS. Lane is the coarse
 *   priority bucket that drives the apply decision (see modes/_profile.md):
 *   4.0+ full effort, 3.5-3.9 light effort, below 3.5 do not apply. Inside a
 *   lane, priority carries no information — measured contact rate is 23% at
 *   4.0-4.4 and 25% at 4.5+, a difference of four applications — so ranking on
 *   the second decimal sorts noise. What does decay is the posting: a role
 *   listed four days ago is a different bet from the same role at six weeks.
 *   Rows with no recorded posting date fall back to priority, so trackers
 *   predating the `Posted YYYY-MM-DD` note keep their old ordering.
 *
 *   Freshness stops at the gate. The below-3.5 lane sends no applications, so
 *   a fresher posting there is worth nothing and only lifts recommend-against
 *   rows over better-scored ones. That lane ranks on priority instead.
 *
 *   Pending and Applied sort by DATE DESC (tie-break priority desc). These are
 *   chase queues — the apply decision is already made, so what matters is what
 *   went out most recently. Their date is the date the application was SENT
 *   (the "Applied YYYY-MM-DD" note), not the Date column, which records when
 *   the offer was evaluated. The two routinely differ by weeks.
 *
 *   Every other group sorts by PRIORITY DESC (tie-break date desc, then odds
 *   desc). These are decision queues, and once a row is closed the lane it was
 *   worked in no longer matters — highest-value first.
 *
 * Ties resolve down to original file position, so the comparator is a total
 * order: re-running on an already-sorted file is a no-op and never churns the
 * diff. Sorting on priority alone used to shuffle equal-priority rows.
 *
 * Rows that cannot be parsed (header, separator, blank) are left in place.
 *
 * Sorts BOTH tracker files with the same rules. The archive only ever holds
 * groups 3-5, so the shared group order keeps the two files consistent with
 * each other and a row keeps its position when it moves between them.
 *
 * Run: node sort-tracker.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { normalizeStatus } from './states-core.mjs';
import { detectColumns, effectiveAppliedDate, postedDate, resolveTrackerPath, trackerPaths } from './tracker-core.mjs';
import { splitRow } from './markdown-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = resolveTrackerPath(CAREER_OPS);

/**
 * Group definitions, in output order. `by` selects the within-group rule.
 *
 * Statuses are canonical ids from states-core.mjs (which reads states.yml), not
 * emoji literals — adding a state means adding its id to a group here, and an
 * id that belongs to no group falls through to Unapplied.
 */
export const GROUPS = [
  { name: 'unapplied', ids: ['evaluated'],                       by: 'lane'     },
  { name: 'pending',   ids: ['interview', 'responded', 'offer'], by: 'date'     },
  { name: 'applied',   ids: ['applied'],                         by: 'date'     },
  { name: 'skip',      ids: ['skip'],                            by: 'priority' },
  { name: 'closed',    ids: ['rejected', 'discarded'],           by: 'priority' },
  { name: 'ignored',   ids: ['ignored'],                         by: 'priority' },
];

// Unrecognized statuses land in the top group rather than being buried at the
// bottom, so a typo or an unregistered state stays visible.
const UNKNOWN_GROUP = 0;

const GROUP_OF_STATUS = {};
GROUPS.forEach((g, i) => g.ids.forEach(id => { GROUP_OF_STATUS[id] = i; }));

const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * Effort lanes, from modes/_profile.md. Coarse on purpose: these are the only
 * priority distinctions the measured contact rate supports.
 */
export const LANES = [
  { id: 'full',  min: 4.0 },
  { id: 'light', min: 3.5 },
  { id: 'none',  min: 0   },
];

export const laneOf = (priority) => LANES.findIndex(l => priority >= l.min);

/** The lane below the apply gate — evaluated, but no application will be sent. */
export const NO_APPLY_LANE = LANES.findIndex(l => l.id === 'none');

const COMPARATORS = {
  // Decision queue: what deserves attention first.
  priority: (a, b) =>
    desc(a.priority, b.priority) || desc(a.date, b.date) ||
    desc(a.odds, b.odds) || a.index - b.index,
  // Chase queue: what went out most recently.
  date: (a, b) =>
    desc(a.date, b.date) || desc(a.priority, b.priority) || a.index - b.index,
  // Apply queue: which lane, then which posting is freshest. laneOf() returns
  // a rank where 0 is the best lane, so it sorts ascending. An unknown posting
  // date ('') sorts last within its lane and falls through to priority, which
  // keeps pre-existing rows where they were.
  //
  // Freshness only applies to the lanes an application is actually sent from.
  // In the below-gate lane nothing gets sent, so a fresher posting buys nothing
  // and only floats recommend-against rows above better-scored ones. That lane
  // ranks on priority, like the other decision queues.
  lane: (a, b) => {
    const rank = laneOf(a.priority) - laneOf(b.priority);
    if (rank) return rank;
    const applies = laneOf(a.priority) !== NO_APPLY_LANE;
    return (applies ? desc(a.posted, b.posted) : 0) ||
      desc(a.priority, b.priority) ||
      desc(a.date, b.date) || desc(a.odds, b.odds) || a.index - b.index;
  },
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());

function parseScore(raw) {
  const m = String(raw ?? '').replace(/\*\*/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseRow(line, columns, index) {
  if (!line.startsWith('|')) return null;
  const parts = splitRow(line);
  const at = (field) => (columns[field] !== undefined ? (parts[columns[field]] ?? '') : '');

  const date = at('date');
  if (!isDate(date)) return null; // header, separator, malformed

  const id = normalizeStatus(at('status'));
  return {
    raw: line,
    index,
    group: GROUP_OF_STATUS[id] ?? UNKNOWN_GROUP,
    // The legacy 9-column schema has a single Score column and no Priority.
    priority: parseScore(at('priority') || at('score')),
    odds: parseScore(at('odds')),
    date: effectiveAppliedDate(at('notes'), date),
    posted: postedDate(at('notes')) || '',
  };
}

/**
 * Sort the tracker's table body.
 *
 * Pure function over the file's lines so the ordering rules are testable
 * without touching applications.md. Returns the rewritten lines plus per-group
 * counts and how many rows changed position, or `{ error }` when there is no
 * table to sort.
 */
export function sortTracker(lines) {
  const separatorIdx = lines.findIndex(l => l.startsWith('|') && l.includes('---'));
  if (separatorIdx === -1) return { error: 'no-table' };

  const columns = detectColumns(lines);
  if (!columns || columns.status === undefined || columns.date === undefined) {
    return { error: 'no-header' };
  }

  const preamble = lines.slice(0, separatorIdx + 1);

  // Everything from the separator to the first blank line is the table body;
  // whatever follows is trailing prose and is left untouched.
  const dataRows = [];
  const trailer = [];
  let inTrailer = false;
  for (const line of lines.slice(separatorIdx + 1)) {
    if (!inTrailer && line.trim() === '') inTrailer = true;
    (inTrailer ? trailer : dataRows).push(line);
  }

  const groups = GROUPS.map(() => []);
  const unparsed = [];

  dataRows.forEach((line, index) => {
    const row = parseRow(line, columns, index);
    if (row) groups[row.group].push(row);
    else unparsed.push(line);
  });

  groups.forEach((rows, i) => rows.sort(COMPARATORS[GROUPS[i].by]));

  const body = [...groups.flatMap(g => g.map(r => r.raw)), ...unparsed];
  const moved = body.reduce((n, line, i) => n + (line === dataRows[i] ? 0 : 1), 0);

  return {
    lines: [...preamble, ...body, ...trailer],
    counts: groups.map(g => g.length),
    moved,
  };
}

// ── CLI ─────────────────────────────────────────────────────────
// Guarded so test-all.mjs can import the ordering rules without the script
// reading, rewriting, or exiting on the real tracker.

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const DRY_RUN = process.argv.includes('--dry-run');

  const files = trackerPaths(CAREER_OPS);
  if (files.length === 0) {
    console.error('applications.md not found');
    process.exit(1);
  }

  for (const file of files) {
    const label = basename(file);
    const result = sortTracker(readFileSync(file, 'utf-8').split('\n'));

    if (result.error === 'no-table') {
      console.log(`${label}: no table separator found — nothing to sort.`);
      continue;
    }
    if (result.error === 'no-header') {
      console.error(`${label}: could not locate the Date and Status columns in the header.`);
      process.exit(1);
    }

    if (!DRY_RUN) writeFileSync(file, result.lines.join('\n'));

    // Only name the groups that have rows. The archive holds three of the six,
    // and printing the empty ones buries the counts that matter.
    const summary = GROUPS
      .map((g, i) => ({ name: g.name, n: result.counts[i] }))
      .filter(g => g.n > 0)
      .map(g => `${g.n} ${g.name}`)
      .join(', ') || 'no rows';
    const verb = DRY_RUN ? 'would move' : 'moved';
    console.log(`${DRY_RUN ? '(dry run)' : '✅ Sorted'} ${label}: ${summary}`);
    console.log(`   ${result.moved} row${result.moved === 1 ? '' : 's'} ${verb}`);
  }
}
