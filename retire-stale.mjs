#!/usr/bin/env node
/**
 * retire-stale.mjs — Retire silent applications to 👻 Ignored.
 *
 * An application that was sent and never answered is neither Rejected (nobody
 * said no) nor Discarded (the candidate did not withdraw). Past the follow-up
 * window it becomes 👻 Ignored: applied, ghosted, retired.
 *
 * This is the terminus of the cadence in followup-cadence.mjs — once
 * applied_max_followups is exhausted an application goes 'cold' there, and
 * this script takes it out of the queue.
 *
 * Run: node retire-stale.mjs                  (dry run — never writes)
 *      node retire-stale.mjs --apply          (write 👻, then re-sort)
 *      node retire-stale.mjs --days 21        (override the 14-day window)
 *      node retire-stale.mjs --apply --no-stamp
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { normalizeStatus } from './states-core.mjs';
import { detectColumns, effectiveAppliedDate, resolveTrackerPath } from './tracker-core.mjs';
import { splitRowRaw, escapeCell } from './markdown-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Live tracker only, by design: this sweep retires ✅ rows, and ✅ rows are live
// by definition. Nothing in the archive can change status.
const APPS_FILE = resolveTrackerPath(CAREER_OPS);

const IGNORED_EMOJI = '👻';

// --- CLI args ---
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const STAMP = !args.includes('--no-stamp');
const daysIdx = args.indexOf('--days');
const DAYS = daysIdx !== -1 && !Number.isNaN(parseInt(args[daysIdx + 1]))
  ? parseInt(args[daysIdx + 1])
  : 14;

const TODAY = new Date(new Date().toISOString().split('T')[0]);
const todayStr = TODAY.toISOString().split('T')[0];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
const daysSince = (dateStr) => Math.floor((TODAY - new Date(dateStr)) / 86400000);

/** Replace one cell's content while preserving the row's existing padding. */
function replaceCell(cells, index, value) {
  const original = cells[index];
  const lead = original.match(/^\s*/)[0];
  const trail = original.match(/\s*$/)[0];
  const width = original.length;
  const padded = lead + value + trail;
  // Keep the column at least as wide as it was, so table alignment survives.
  return padded.length >= width ? padded : padded + ' '.repeat(width - padded.length);
}

if (!existsSync(APPS_FILE)) {
  console.error('applications.md not found');
  process.exit(1);
}

const lines = readFileSync(APPS_FILE, 'utf-8').split('\n');
const columns = detectColumns(lines);
if (!columns || columns.status === undefined) {
  console.error('Could not locate the Status column in the tracker header.');
  process.exit(1);
}

const retired = [];
const kept = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const cells = splitRowRaw(line);
  const at = (field) => (columns[field] !== undefined ? (cells[columns[field]] ?? '').trim().replace(/\\\|/g, '|') : '');

  const date = at('date');
  if (!isDate(date)) continue; // header, separator, malformed
  if (normalizeStatus(at('status')) !== 'applied') continue;

  const notes = at('notes');
  const applied = effectiveAppliedDate(notes, date);
  const age = daysSince(applied);
  const record = { line: i, company: at('company'), role: at('role'), applied, age };

  if (age <= DAYS) {
    kept.push(record);
    continue;
  }
  retired.push(record);

  if (!APPLY) continue;

  cells[columns.status] = replaceCell(cells, columns.status, escapeCell(IGNORED_EMOJI));
  if (STAMP && columns.notes !== undefined) {
    const base = notes.replace(/[;\s]+$/, '');
    // Join with '; ' only if the note does not already end a sentence.
    const sep = base === '' ? '' : /[.!?]$/.test(base) ? ' ' : '; ';
    cells[columns.notes] = replaceCell(
      cells, columns.notes,
      escapeCell(`${base}${sep}Retired ${todayStr} (no response after ${age}d)`)
    );
  }
  lines[i] = cells.join('|');
}

// --- Report ---
retired.sort((a, b) => a.applied.localeCompare(b.applied));
for (const r of retired) {
  console.log(`  ${r.applied}  ${String(r.age).padStart(3)}d  ${r.company} — ${r.role.slice(0, 55)}`);
}

console.log('');
console.log(`Window: ${DAYS} days (as of ${todayStr})`);
console.log(`${retired.length} to retire → ${IGNORED_EMOJI}, ${kept.length} still within window`);

if (!APPLY) {
  console.log('\n(dry run — nothing written. Re-run with --apply to retire them.)');
  process.exit(0);
}

if (retired.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}

writeFileSync(APPS_FILE, lines.join('\n'));
console.log(`\n✅ Wrote ${retired.length} retirements to ${APPS_FILE}`);

execSync('node sort-tracker.mjs', { cwd: CAREER_OPS, stdio: 'inherit' });
