#!/usr/bin/env node
/**
 * verify-pipeline.mjs — Health check for agentic-job-hunt pipeline integrity
 *
 * Checks:
 * 1. All statuses are canonical (per states.yml)
 * 2. No duplicate company+role entries
 * 3. All report links point to existing files
 * 4. Scores match format X.XX/5 or N/A or DUP
 * 5. All rows have proper pipe-delimited format
 * 6. No pending TSVs in tracker-additions/ (only in merged/ or archived/)
 * 7. states.yml canonical IDs for cross-system consistency
 *
 * Run: node agentic-job-hunt/verify-pipeline.mjs
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { splitRow } from './markdown-core.mjs';
import { resolveTrackerPath, trackerPaths } from './tracker-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original)
const APPS_FILE = resolveTrackerPath(CAREER_OPS);
const ADDITIONS_DIR = join(CAREER_OPS, 'batch/tracker-additions');
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const STATES_FILE = existsSync(join(CAREER_OPS, 'templates/states.yml'))
  ? join(CAREER_OPS, 'templates/states.yml')
  : join(CAREER_OPS, 'states.yml');

// Ensure required directories exist (fresh setup)
mkdirSync(join(CAREER_OPS, 'data'), { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });

// Status emojis map (matches templates/states.yml)
const STATUS_EMOJIS = {
  '': 'pending',      // empty = pending
  '✅': 'applied',
  '📬': 'responded',
  '🎯': 'interview',
  '💰': 'offer',
  '❌': 'rejected',
  '🚫': 'discarded',
  '👻': 'ignored',
  '⏭️': 'skip',
};

// Legacy text statuses for backward compatibility
const CANONICAL_STATUSES = [
  'evaluated', 'applied', 'responded', 'interview',
  'offer', 'rejected', 'discarded', 'ignored', 'skip',
  // Also accept emojis directly
  '', '✅', '📬', '🎯', '💰', '❌', '🚫', '👻', '⏭️',
];

const ALIASES = {
  'evaluada': 'evaluated', 'condicional': 'evaluated', 'hold': 'evaluated', 'evaluar': 'evaluated', 'verificar': 'evaluated',
  'aplicado': 'applied', 'enviada': 'applied', 'aplicada': 'applied', 'applied': 'applied', 'sent': 'applied',
  'respondido': 'responded',
  'entrevista': 'interview',
  'oferta': 'offer',
  'rechazado': 'rejected', 'rechazada': 'rejected',
  'descartado': 'discarded', 'descartada': 'discarded', 'cerrada': 'discarded', 'cancelada': 'discarded',
  'ghosted': 'ignored', 'no_response': 'ignored', 'no response': 'ignored',
  'no aplicar': 'skip', 'no_aplicar': 'skip', 'monitor': 'skip', 'geo blocker': 'skip',
};

let errors = 0;
let warnings = 0;

function error(msg) { console.log(`❌ ${msg}`); errors++; }
function warn(msg) { console.log(`⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`✅ ${msg}`); }

// --- Read applications.md ---
if (!existsSync(APPS_FILE)) {
  console.log('\n📊 No applications.md found. This is normal for a fresh setup.');
  console.log('   The file will be created when you evaluate your first offer.\n');
  process.exit(0);
}
// The health check covers the live tracker AND the archive. An archived row
// with a broken report link or a non-canonical status is still broken, and
// moving it out of the live file is not a reason to stop looking at it.
const APPS_FILES = trackerPaths(CAREER_OPS);

const entries = [];
let rowNum = 0;
for (const file of APPS_FILES) {
for (const line of readFileSync(file, 'utf-8').split('\n')) {
  if (!line.startsWith('|')) continue;
  const parts = splitRow(line);
  if (parts.length < 10) continue;
  // Format: Date | Company | Role | Fit | Priority | Status | Output | Report | Location | Reasoning | URL
  const date = parts[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // Skip non-date rows
  rowNum++;
  // Detect 3-score format (Fit | Odds | Priority) vs 2-score (Fit | Priority).
  // The accepted values must match check 4 below exactly. A row the tracker
  // never scored carries N/A, and when the detector rejected that, the row fell
  // through to the legacy layout and its own Odds column got reported as a
  // broken status.
  const isScore = s => /^\d+\.?\d*\/5$/.test(s);
  const col4LooksLikeScore = isScore(parts[4]) || parts[4] === '-' || parts[4] === 'N/A';
  const col5LooksLikeScore = isScore(parts[5]) || parts[5] === '-' || parts[5] === 'N/A';
  const col6LooksLikeScore = isScore(parts[6]) || parts[6] === 'N/A' || parts[6] === 'DUP';
  const hasOddsCol = col4LooksLikeScore && col5LooksLikeScore && col6LooksLikeScore;

  let fit, odds, score, status, output, report, location, reasoning, url;
  if (hasOddsCol) {
    // New: Date | Company | Role | Fit | Odds | Priority | Status | ...
    fit = parts[4]; odds = parts[5]; score = parts[6];
    status = parts[7]; output = parts[8]; report = parts[9];
    location = parts[10]; reasoning = parts[11]; url = parts[12] || '';
  } else {
    // Legacy: Date | Company | Role | Fit | Priority | Status | ...
    fit = parts[4]; odds = '-'; score = parts[5];
    status = parts[6]; output = parts[7]; report = parts[8];
    location = parts[9]; reasoning = parts[10]; url = parts[11] || '';
  }

  entries.push({
    num: rowNum,
    file,
    date,
    company: parts[2],
    role: parts[3],
    fit, odds, score, status, output, report, location, reasoning, url,
  });
}
}

const scope = APPS_FILES.map(f => basename(f)).join(' + ');
console.log(`\n📊 Checking ${entries.length} entries in ${scope}\n`);

// --- Check 1: Canonical statuses ---
let badStatuses = 0;
for (const e of entries) {
  const clean = e.status.replace(/\*\*/g, '').trim().toLowerCase();
  // Strip trailing dates
  const statusOnly = clean.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

  if (!CANONICAL_STATUSES.includes(statusOnly) && !ALIASES[statusOnly]) {
    error(`#${e.num}: Non-canonical status "${e.status}"`);
    badStatuses++;
  }

  // Check for markdown bold in status
  if (e.status.includes('**')) {
    error(`#${e.num}: Status contains markdown bold: "${e.status}"`);
    badStatuses++;
  }

  // Check for dates in status
  if (/\d{4}-\d{2}-\d{2}/.test(e.status)) {
    error(`#${e.num}: Status contains date: "${e.status}" — dates go in date column`);
    badStatuses++;
  }
}
if (badStatuses === 0) ok('All statuses are canonical');

// --- Check 2: Duplicates ---
const companyRoleMap = new Map();
let dupes = 0;
for (const e of entries) {
  const key = e.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '::' +
    e.role.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (!companyRoleMap.has(key)) companyRoleMap.set(key, []);
  companyRoleMap.get(key).push(e);
}
for (const [key, group] of companyRoleMap) {
  if (group.length > 1) {
    warn(`Possible duplicates: ${group.map(e => `#${e.num}`).join(', ')} (${group[0].company} — ${group[0].role})`);
    dupes++;
  }
}
if (dupes === 0) ok('No exact duplicates found');

// --- Check 3: Report links ---
let brokenReports = 0;
for (const e of entries) {
  const match = e.report.match(/\]\(([^)]+)\)/);
  if (!match) continue;
  // Resolve relative paths from the file the row lives in. The live tracker and
  // the archive sit in the same directory, so `../reports/...` works for both.
  const reportPath = isAbsolute(match[1]) ? match[1] : join(dirname(e.file), match[1]);
  if (!existsSync(reportPath)) {
    error(`#${e.num}: Report not found: ${match[1]}`);
    brokenReports++;
  }
}
if (brokenReports === 0) ok('All report links valid');

// --- Check 4: Score format ---
let badScores = 0;
for (const e of entries) {
  const s = e.score.replace(/\*\*/g, '').trim();
  if (!/^\d+\.?\d*\/5$/.test(s) && s !== 'N/A' && s !== 'DUP') {
    error(`#${e.num}: Invalid priority score format: "${e.score}"`);
    badScores++;
  }
  const f = e.fit.replace(/\*\*/g, '').trim();
  if (!/^\d+\.?\d*\/5$/.test(f) && f !== '-' && f !== 'N/A') {
    error(`#${e.num}: Invalid fit score format: "${e.fit}"`);
    badScores++;
  }
  const o = (e.odds || '-').replace(/\*\*/g, '').trim();
  if (!/^\d+\.?\d*\/5$/.test(o) && o !== '-' && o !== 'N/A') {
    error(`#${e.num}: Invalid odds score format: "${e.odds}"`);
    badScores++;
  }
}
if (badScores === 0) ok('All scores valid');

// --- Check 5: Row format ---
// Every data row must be fenced by pipes and carry exactly as many columns as
// the table header declares. A row that is short, long, or missing its closing
// pipe shifts every cell after the defect, so the URL lands in the notes column
// and the notes land nowhere. Both failures have reached the archive unnoticed.
const SEPARATOR_ROW = /^\|[\s:|-]+\|?$/;

let badRows = 0;
for (const file of APPS_FILES) {
  const lines = readFileSync(file, 'utf-8').split('\n');

  // Column count comes from the header, so adding a column to the schema
  // does not mean editing this check.
  let expected = null;
  for (const line of lines) {
    if (!line.startsWith('|') || SEPARATOR_ROW.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length > 2 && /^(date|fecha|#|num)$/i.test(cells[1])) {
      expected = cells.length - 2;
      break;
    }
  }
  if (expected === null) {
    warn(`${basename(file)}: no table header found, skipping column-count check`);
    continue;
  }

  lines.forEach((line, i) => {
    if (!line.startsWith('|') || SEPARATOR_ROW.test(line)) return;
    const cells = splitRow(line);
    if (/^(date|fecha|#|num)$/i.test(cells[1])) return;  // the header itself

    const where = `${basename(file)}:${i + 1}`;
    const preview = line.substring(0, 80);

    if (cells[cells.length - 1] !== '') {
      error(`${where}: row is missing its closing pipe: ${preview}...`);
      badRows++;
      return;
    }
    const count = cells.length - 2;
    if (count !== expected) {
      error(`${where}: row has ${count} columns, expected ${expected}: ${preview}...`);
      badRows++;
    }
  });
}
if (badRows === 0) ok('All rows properly formatted');

// --- Check 6: Pending TSVs ---
let pendingTsvs = 0;
if (existsSync(ADDITIONS_DIR)) {
  const files = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
  pendingTsvs = files.length;
  if (pendingTsvs > 0) {
    warn(`${pendingTsvs} pending TSVs in tracker-additions/ (not merged)`);
  }
}
if (pendingTsvs === 0) ok('No pending TSVs');

// --- Check 7: Bold in scores ---
let boldScores = 0;
for (const e of entries) {
  if (e.score.includes('**') || e.fit.includes('**') || (e.odds || '').includes('**')) {
    warn(`#${e.num}: Score has markdown bold: "${e.score}" / "${e.fit}" / "${e.odds}"`);
    boldScores++;
  }
}
if (boldScores === 0) ok('No bold in scores');

// --- Check 8: Applied entries with no output ---
// 👻 ignored belongs here too: the application WAS sent, it just never got an
// answer, so the output folder is still expected.
const APPLIED_STATUSES = ['✅', 'applied', '📬', 'responded', '🎯', 'interview', '💰', 'offer', '👻', 'ignored'];
let missingOutput = 0;
for (const e of entries) {
  const statusClean = e.status.toLowerCase().trim();
  const isApplied = APPLIED_STATUSES.includes(e.status) || APPLIED_STATUSES.includes(statusClean);
  const hasOutput = e.output && e.output !== '-' && e.output.trim() !== '';
  if (isApplied && !hasOutput) {
    warn(`#${e.num}: ${e.company} — ${e.role}: Applied with no Output folder linked`);
    missingOutput++;
  }
}
if (missingOutput === 0) ok('All applied entries have output links');

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`📊 Pipeline Health: ${errors} errors, ${warnings} warnings`);
if (errors === 0 && warnings === 0) {
  console.log('🟢 Pipeline is clean!');
} else if (errors === 0) {
  console.log('🟡 Pipeline OK with warnings');
} else {
  console.log('🔴 Pipeline has errors — fix before proceeding');
}

process.exit(errors > 0 ? 1 : 0);
