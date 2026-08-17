#!/usr/bin/env node
/**
 * archive-tracker.mjs — Move closed rows out of the live tracker.
 *
 * The tracker answers one question: what should I do next? A row stops helping
 * with that the moment it can no longer change. Skipped, rejected, withdrawn and
 * retired rows are history, and at a few hundred of them they bury the nine rows
 * an apply decision is actually owed on.
 *
 * So the record lives in two files with the identical 12-column schema:
 *
 *   data/applications.md          — open: unapplied, live conversations, sent
 *   data/applications-archive.md  — closed: ⏭️ skip, ❌ rejected, 🚫 discarded, 👻 ignored
 *
 * This is a split for reading, NOT a deletion. The archive holds the rejections
 * and the silences, which is the entire input to analyze-scoring.mjs and most of
 * analyze-patterns.mjs. Every script that analyses the record reads both files
 * (parseTrackerAll in tracker-core.mjs), and every script that dedups against it
 * checks both, so an archived role can never resurface as a fresh lead.
 *
 * Rows are moved verbatim. Nothing is rewritten, rescored, or dropped.
 *
 * Run: node archive-tracker.mjs [--apply]
 *   Dry run by default. `--apply` writes both files and re-sorts them.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStatus } from './states-core.mjs';
import { resolveTrackerPath, resolveArchivePath, detectColumns } from './tracker-core.mjs';
import { splitRow } from './markdown-core.mjs';
import { GROUPS, sortTracker } from './sort-tracker.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = resolveTrackerPath(CAREER_OPS);
const ARCHIVE_FILE = resolveArchivePath(CAREER_OPS);
const APPLY = process.argv.includes('--apply');

// Which statuses belong in the archive. Sourced from sort-tracker's group table
// rather than a second hardcoded list, so registering a new state in one place
// keeps the two files agreeing on where its rows live.
const ARCHIVED_GROUPS = ['skip', 'closed', 'ignored'];
const ARCHIVED_STATUSES = new Set(
  GROUPS.filter(g => ARCHIVED_GROUPS.includes(g.name)).flatMap(g => g.ids)
);

const isSeparatorRow = (line) => /^\|[\s:|-]+\|?\s*$/.test(line);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());

/** Split a tracker file into its preamble, its data rows, and trailing prose. */
function splitFile(lines) {
  const separatorIdx = lines.findIndex(l => l.startsWith('|') && l.includes('---'));
  if (separatorIdx === -1) return null;

  const preamble = lines.slice(0, separatorIdx + 1);
  const rows = [];
  const trailer = [];
  let inTrailer = false;
  for (const line of lines.slice(separatorIdx + 1)) {
    if (!inTrailer && line.trim() === '') inTrailer = true;
    (inTrailer ? trailer : rows).push(line);
  }
  return { preamble, rows, trailer };
}

const ARCHIVE_HEADER = (tableHeader, tableSeparator) => `# Applications Archive — closed rows

> **This is half of the tracker, not a deleted pile.**
>
> - **Live queue:** \`data/applications.md\` — unapplied, live conversations, sent-and-waiting
> - **This file:** every row that can no longer change — \`⏭️\` skip, \`❌\` rejected, \`🚫\` discarded, \`👻\` ignored
> - **Same 12 columns, same rules.** \`CLAUDE.md\` → §"Pipeline Integrity", §"Status Emojis", §"Sort Order"
> - **Both files are read together** by \`analyze-patterns.mjs\`, \`analyze-scoring.mjs\` and \`verify-pipeline.mjs\`, and deduped against together by the scanners and \`triage.mjs\`. Archiving a row hides it from the queue; it never hides it from the analysis.
> - **Moving rows here:** \`node archive-tracker.mjs\` (dry run) → \`--apply\`. Never cut and paste by hand
> - **Re-opening a row:** move the line back to \`data/applications.md\` by hand and set its status. \`merge-tracker.mjs\` will not do it for you — it reports the archived match and stops, because reviving a closed row is a judgment call
> - **Always sort after any change:** \`node sort-tracker.mjs\` sorts both files
>
> **Sort order:** ⏭️ › ❌/🚫 › 👻, each group by priority desc (tie-break date desc, then odds desc). These are review queues: highest-value first.

${tableHeader}
${tableSeparator}`;

// ── Read the live tracker ───────────────────────────────────────────

if (!existsSync(APPS_FILE)) {
  console.error('applications.md not found');
  process.exit(1);
}

const liveLines = readFileSync(APPS_FILE, 'utf-8').split('\n');
const live = splitFile(liveLines);
if (!live) {
  console.error('No table separator found in applications.md — nothing to archive.');
  process.exit(1);
}

const columns = detectColumns(liveLines);
if (!columns || columns.status === undefined) {
  console.error('Could not locate the Status column in the tracker header.');
  process.exit(1);
}

const keep = [];
const move = [];
const counts = {};

for (const line of live.rows) {
  if (!line.startsWith('|') || isSeparatorRow(line)) { keep.push(line); continue; }
  const parts = splitRow(line);
  // Anything that does not parse as a data row stays put. Never move a line
  // this script does not understand.
  if (!isDate(parts[columns.date])) { keep.push(line); continue; }

  const status = normalizeStatus(parts[columns.status] ?? '');
  if (ARCHIVED_STATUSES.has(status)) {
    move.push(line);
    counts[status] = (counts[status] || 0) + 1;
  } else {
    keep.push(line);
  }
}

if (move.length === 0) {
  console.log('Nothing to archive — no closed rows in the live tracker.');
  process.exit(0);
}

// ── Build both files ────────────────────────────────────────────────

const tableHeader = live.preamble[live.preamble.length - 2];
const tableSeparator = live.preamble[live.preamble.length - 1];

let archiveLines;
if (existsSync(ARCHIVE_FILE)) {
  const existing = splitFile(readFileSync(ARCHIVE_FILE, 'utf-8').split('\n'));
  if (!existing) {
    console.error('applications-archive.md exists but has no table — refusing to overwrite it.');
    process.exit(1);
  }
  archiveLines = [...existing.preamble, ...existing.rows, ...move, ...existing.trailer];
} else {
  archiveLines = [...ARCHIVE_HEADER(tableHeader, tableSeparator).split('\n'), ...move, ''];
}

const newLiveLines = [...live.preamble, ...keep, ...live.trailer];

// Sort both before writing, so the split never lands unsorted.
const sortedLive = sortTracker(newLiveLines);
const sortedArchive = sortTracker(archiveLines);
if (sortedLive.error || sortedArchive.error) {
  console.error(`Sort failed: ${sortedLive.error || sortedArchive.error}`);
  process.exit(1);
}

// ── Report ──────────────────────────────────────────────────────────

const liveRows = live.rows.filter(l => l.startsWith('|') && isDate(splitRow(l)[columns.date])).length;
const EMOJI = { skip: '⏭️', rejected: '❌', discarded: '🚫', ignored: '👻' };
const breakdown = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([status, n]) => `${n} ${EMOJI[status] || ''} ${status}`)
  .join(', ');

console.log(`\n${move.length} of ${liveRows} rows are closed and move to ${basename(ARCHIVE_FILE)}`);
console.log(`   ${breakdown}`);
console.log(`\n${basename(APPS_FILE)}: ${liveRows} → ${liveRows - move.length} rows`);

if (APPLY) {
  writeFileSync(APPS_FILE, sortedLive.lines.join('\n'));
  writeFileSync(ARCHIVE_FILE, sortedArchive.lines.join('\n'));
  console.log(`\n✅ Written and sorted: ${basename(APPS_FILE)} + ${basename(ARCHIVE_FILE)}`);
} else {
  console.log('\n(dry run — nothing written. Re-run with --apply.)');
}
