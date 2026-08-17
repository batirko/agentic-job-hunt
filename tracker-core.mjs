/**
 * tracker-core.mjs — Shared applications.md row parsing for agentic-job-hunt
 *
 * The tracker schema has changed over time. Rather than hardcoding column
 * positions, this reads the markdown header row and maps column labels to
 * fields, so both the canonical 12-column layout and the older 9-column
 * layout parse correctly.
 *
 *   canonical: | Date | Company | Role | Fit | Odds | Priority | Status |
 *                Output | Report | Location | Reasoning | URL |
 *   legacy:    | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { splitRow } from './markdown-core.mjs';

// Header label → field name. Labels are matched case-insensitively with
// punctuation and whitespace stripped.
const HEADER_FIELDS = {
  '#': 'num', 'num': 'num',
  'date': 'date', 'fecha': 'date',
  'company': 'company', 'empresa': 'company',
  'role': 'role', 'puesto': 'role', 'position': 'role',
  'fit': 'fit',
  'odds': 'odds',
  'priority': 'priority', 'prioridad': 'priority',
  'score': 'score', 'puntuacion': 'score',
  'status': 'status', 'estado': 'status',
  'output': 'output', 'pdf': 'output',
  'report': 'report', 'informe': 'report',
  'location': 'location', 'ubicacion': 'location',
  'reasoning': 'notes', 'notes': 'notes', 'notas': 'notes', 'razonamiento': 'notes',
  'url': 'url', 'link': 'url',
};

// Positional fallbacks, used only when no header row is recognizable.
const CANONICAL_POSITIONS = {
  date: 1, company: 2, role: 3, fit: 4, odds: 5, priority: 6, status: 7,
  output: 8, report: 9, location: 10, notes: 11, url: 12,
};
const LEGACY_POSITIONS = {
  num: 1, date: 2, company: 3, role: 4, score: 5, status: 6,
  output: 7, report: 8, notes: 9,
};

const normalizeLabel = (s) => s.replace(/\*\*/g, '').trim().toLowerCase().replace(/[^a-z#]/g, '');
const isSeparatorRow = (line) => /^\|[\s:|-]+\|?\s*$/.test(line);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test((s || '').trim());
const isScore = (s) => /^\*{0,2}\d+(\.\d+)?\/5\*{0,2}$/.test((s || '').trim());

function parseScore(raw) {
  const m = String(raw ?? '').replace(/\*\*/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Build a field → column-index map from the table header row.
 *
 * Exported for writer scripts (retire-stale.mjs) that must rewrite individual
 * cells in place: parseTracker() discards line positions, so they parse lines
 * themselves and use this to locate columns instead of hardcoding offsets.
 */
export function detectColumns(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|') || isSeparatorRow(line)) continue;
    // A header row is a pipe row immediately followed by a separator row.
    const next = lines[i + 1];
    if (!next || !isSeparatorRow(next)) continue;

    const cells = splitRow(line);
    const columns = {};
    for (let c = 0; c < cells.length; c++) {
      const field = HEADER_FIELDS[normalizeLabel(cells[c])];
      if (field && columns[field] === undefined) columns[field] = c;
    }
    if (columns.status !== undefined && columns.company !== undefined) return columns;
  }
  return null;
}

/** Shape-based fallback when the header is missing or unrecognized. */
function detectColumnsByShape(parts) {
  if (isDate(parts[1]) && isScore(parts[4])) return CANONICAL_POSITIONS;
  if (!Number.isNaN(parseInt(parts[1])) && isDate(parts[2])) return LEGACY_POSITIONS;
  return null;
}

/**
 * The tracker is two files, not one.
 *
 * `data/applications.md` holds the rows a decision is still owed on: the
 * unapplied queue, the live conversations, and everything already sent. Once a
 * row can no longer change — skipped, rejected, withdrawn, or retired after
 * silence — it moves to `data/applications-archive.md`, which keeps the exact
 * same 12-column schema.
 *
 * The split is for reading, not for forgetting. The archive holds the rejections
 * and the silences, which is precisely the signal analyze-patterns.mjs and
 * analyze-scoring.mjs learn from, so anything that ANALYSES the record must read
 * both files and anything that DEDUPS against the record must check both. Only
 * writers that append or re-rank the live queue may use resolveTrackerPath()
 * alone.
 */
export const TRACKER_BASENAME = 'applications.md';
export const ARCHIVE_BASENAME = 'applications-archive.md';

/**
 * The live tracker's path.
 *
 * Supports both layouts the project has shipped: `data/applications.md` in the
 * current boilerplate, bare `applications.md` in the original.
 */
export function resolveTrackerPath(root) {
  const inData = join(root, 'data', TRACKER_BASENAME);
  return existsSync(inData) ? inData : join(root, TRACKER_BASENAME);
}

/** The archive's path, always beside the live tracker. May not exist yet. */
export function resolveArchivePath(root) {
  return join(dirname(resolveTrackerPath(root)), ARCHIVE_BASENAME);
}

/** Every file holding tracker rows, live first, existing ones only. */
export function trackerPaths(root) {
  return [resolveTrackerPath(root), resolveArchivePath(root)].filter(existsSync);
}

/**
 * Parse applications.md into entries.
 *
 * Each entry exposes: num, date, company, role, fit, odds, priority, score,
 * status, output, report, location, notes, url. `score` is the primary
 * ranking score — Fit in the canonical schema, Score in the legacy one.
 */
export function parseTracker(appsFile) {
  if (!existsSync(appsFile)) return [];
  const lines = readFileSync(appsFile, 'utf-8').split('\n');
  const headerColumns = detectColumns(lines);
  const entries = [];

  for (const line of lines) {
    if (!line.startsWith('|') || isSeparatorRow(line)) continue;

    const parts = splitRow(line);
    const columns = headerColumns || detectColumnsByShape(parts);
    if (!columns) continue;

    const at = (field) => (columns[field] !== undefined ? (parts[columns[field]] ?? '') : '');

    // Skip the header row itself and any malformed row.
    const date = at('date');
    if (!isDate(date)) continue;

    const fit = at('fit') || at('score');
    const report = at('report');
    // The canonical schema dropped the '#' column; the report link label
    // carries the same number, e.g. "[117](../reports/117-acme-...md)".
    const num = parseInt(at('num')) || parseInt(report.match(/\[(\d+)\]/)?.[1]) || null;

    entries.push({
      num,
      date,
      company: at('company'),
      role: at('role'),
      fit: parseScore(fit),
      odds: parseScore(at('odds')),
      priority: parseScore(at('priority')),
      score: parseScore(fit),
      status: at('status'),
      output: at('output'),
      report,
      location: at('location'),
      notes: at('notes'),
      url: at('url'),
    });
  }
  return entries;
}

/**
 * Parse the live tracker and the archive into one list.
 *
 * Use this for any question about the whole record — funnel counts, score
 * calibration, rejection patterns, "have I seen this company before". Each entry
 * carries `archived` so a caller that needs only the live queue can filter,
 * and `file` so it can report where a row came from.
 */
export function parseTrackerAll(root) {
  const live = resolveTrackerPath(root);
  return trackerPaths(root).flatMap(file =>
    parseTracker(file).map(entry => ({ ...entry, archived: file !== live, file }))
  );
}

/**
 * The date an application was actually sent.
 *
 * The Date column is the EVALUATION date — an offer can be evaluated weeks
 * before it is applied to. When the notes record an explicit
 * "Applied YYYY-MM-DD" (the latest one wins, for re-applications), that is the
 * real send date; otherwise fall back to the Date column.
 */
export function effectiveAppliedDate(notes, dateColumn) {
  const found = [...String(notes ?? '').matchAll(/applied\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/gi)]
    .map(m => m[1])
    .sort();
  return found.length ? found[found.length - 1] : dateColumn;
}

/**
 * The date the job posting itself went live.
 *
 * The scanners already read this from the Greenhouse / Ashby / Lever / LinkedIn
 * payloads and write it into data/pipeline.md as a `posted YYYY-MM-DD` marker,
 * but it was dropped when a role was promoted to the tracker. Carrying it
 * forward as a `Posted YYYY-MM-DD` note keeps the tracker schema at 12 columns
 * — the same trick the `Applied YYYY-MM-DD` note already uses.
 *
 * Returns null when the note is absent, which is the case for every row
 * evaluated before this was recorded. Callers must treat null as "unknown",
 * never as "old".
 */
export function postedDate(notes) {
  const match = String(notes ?? '').match(/posted\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

/**
 * Resolve a report link from the tracker to an absolute path.
 *
 * Links are written relative to applications.md (which lives in data/), so
 * `../reports/x.md` must resolve against that file's directory, not the
 * project root.
 */
export function resolveReportPath(reportField, appsFile) {
  const match = String(reportField ?? '').match(/\]\(([^)]+)\)/);
  if (!match) return null;
  return join(dirname(appsFile), match[1]);
}
