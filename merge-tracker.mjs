#!/usr/bin/env node
/**
 * merge-tracker.mjs — Merge batch tracker additions into applications.md
 *
 * Tracker format (canonical):
 *   Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL
 *
 * TSV format (canonical, 13 cols):
 *   num\tdate\tcompany\trole\tfit/5\todds/5\tpriority/5\tstatus\toutput\treport\tlocation\tnote\turl
 *
 * Also handles legacy formats for backward compat:
 * - 9-col TSV: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes
 * - Pipe-delimited (markdown table row)
 *
 * Dedup (match-core.mjs): same company AND (same report number OR same role).
 * Company has to agree on both paths — report numbers are not unique keys.
 * If duplicate with higher Priority score → update in-place
 * A TSV that changed nothing is HELD in tracker-additions/, never filed away
 * Validates status against states.yml
 *
 * Run: node agentic-job-hunt/merge-tracker.mjs [--dry-run] [--verify]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { splitRow, escapeCell as e } from './markdown-core.mjs';
import { resolveTrackerPath, resolveArchivePath, ARCHIVE_BASENAME } from './tracker-core.mjs';
import { findDuplicate } from './match-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = resolveTrackerPath(CAREER_OPS);
const ARCHIVE_FILE = resolveArchivePath(CAREER_OPS);
const ADDITIONS_DIR = join(CAREER_OPS, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

// Ensure required directories exist (fresh setup)
mkdirSync(join(CAREER_OPS, 'data'), { recursive: true });
mkdirSync(ADDITIONS_DIR, { recursive: true });

// Canonical statuses are EMOJIS (or blank) per templates/states.yml.
// "Evaluated" is the BLANK status — an empty status column is valid, not an error.
const STATUS_EMOJIS = {
  evaluated: '',
  applied: '✅',
  responded: '📬',
  interview: '🎯',
  offer: '💰',
  rejected: '❌',
  discarded: '🚫',
  ignored: '👻',
  skip: '⏭️',
};

// Text label / alias → canonical id
const STATUS_ALIASES = {
  'evaluated': 'evaluated', 'evaluada': 'evaluated', 'condicional': 'evaluated',
  'hold': 'evaluated', 'evaluar': 'evaluated', 'verificar': 'evaluated', 'pending': 'evaluated',
  'applied': 'applied', 'aplicado': 'applied', 'enviada': 'applied', 'aplicada': 'applied', 'sent': 'applied',
  'responded': 'responded', 'respondido': 'responded',
  'interview': 'interview', 'entrevista': 'interview',
  'offer': 'offer', 'oferta': 'offer',
  'rejected': 'rejected', 'rechazado': 'rejected', 'rechazada': 'rejected',
  'discarded': 'discarded', 'descartado': 'discarded', 'descartada': 'discarded',
  'cerrada': 'discarded', 'cancelada': 'discarded',
  'ignored': 'ignored', 'ghosted': 'ignored', 'no_response': 'ignored', 'no response': 'ignored',
  'skip': 'skip', 'no aplicar': 'skip', 'no_aplicar': 'skip', 'monitor': 'skip', 'geo blocker': 'skip',
};

const EMOJI_SET = new Set(Object.values(STATUS_EMOJIS).filter(Boolean));

/**
 * Normalize any status form (emoji, text label, alias, blank) to its canonical emoji.
 * Blank in → blank out: that IS the "evaluated, pending decision" state.
 */
function validateStatus(status) {
  const clean = (status ?? '').replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

  // Blank / placeholder dash = evaluated, pending apply decision
  if (clean === '' || clean === '-' || clean === '—') return '';

  // Already an emoji
  if (EMOJI_SET.has(clean)) return clean;

  const lower = clean.toLowerCase();
  if (STATUS_ALIASES[lower]) return STATUS_EMOJIS[STATUS_ALIASES[lower]];

  // DUPLICADO/Repost → Discarded
  if (/^(duplicado|dup|repost)/i.test(lower)) return STATUS_EMOJIS.discarded;

  console.warn(`⚠️  Non-canonical status "${status}" → defaulting to blank (evaluated)`);
  return '';
}

/**
 * applications.md lives in data/, so report links must be ../reports/...
 * Accept the bare `reports/...` form (as documented historically) and normalize it.
 */
function normalizeReportLink(report) {
  return (report ?? '').replace(/\]\((?:\.\/)?reports\//g, '](../reports/');
}

function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseAppLine(line) {
  const parts = splitRow(line);
  // Canonical format: Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL
  if (parts.length >= 13 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
    const col5IsScore = /^\d+\.?\d*\/5$/.test(parts[5]);
    if (col5IsScore) {
      return {
        date: parts[1], company: parts[2], role: parts[3],
        fit: parts[4], odds: parts[5], score: parts[6],
        status: parts[7], output: parts[8], report: parts[9],
        location: parts[10], reasoning: parts[11], url: parts[12] || '',
        raw: line, format: 'new',
      };
    }
  }
  // Legacy format: # | Date | Company | Role | Score | Status | Output | Report | Notes
  if (parts.length >= 9) {
    const num = parseInt(parts[1]);
    if (!isNaN(num) && num > 0) {
      return {
        num, date: parts[2], company: parts[3], role: parts[4],
        fit: parts[5], odds: null, score: parts[5],
        status: parts[6], output: parts[7], report: parts[8],
        notes: parts[9] || '', raw: line, format: 'legacy',
      };
    }
  }
  return null;
}

/**
 * Parse a TSV file content into a structured addition object.
 * Canonical: 13-col TSV (num\tdate\tcompany\trole\tfit\todds\tpriority\tstatus\toutput\treport\tlocation\tnote\turl)
 * Legacy: 9-col TSV, 8-col TSV, pipe-delimited markdown.
 */
function parseTsvContent(content, filename) {
  content = content.trim();
  if (!content) return null;

  let parts;
  let addition;

  // Detect pipe-delimited (markdown table row)
  if (content.startsWith('|')) {
    parts = splitRow(content).filter(Boolean);
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed pipe-delimited ${filename}: ${parts.length} fields`);
      return null;
    }
    addition = {
      num: parseInt(parts[0]),
      date: parts[1], company: parts[2], role: parts[3],
      fit: parts[4], odds: parts[5], score: parts[6],
      status: validateStatus(parts[7]),
      output: parts[8] || '-', report: normalizeReportLink(parts[9] || ''),
      location: parts[10] || '-', notes: parts[11] || '', url: parts[12] || '-',
    };
  } else {
    parts = content.split('\t');
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed TSV ${filename}: ${parts.length} fields`);
      return null;
    }

    const col4 = parts[4]?.trim() ?? '';
    const col5 = parts[5]?.trim() ?? '';
    const col6 = parts[6]?.trim() ?? '';
    const isScore = s => /^\d+\.?\d*\/5$/.test(s) || s === 'N/A';
    const isStatus = s => /^(evaluated|applied|responded|interview|offer|rejected|discarded|ignored|ghosted|skip|evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(s);

    if (parts.length >= 13 && isScore(col4) && isScore(col5) && isScore(col6)) {
      // Canonical 13-col: num\tdate\tcompany\trole\tfit\todds\tpriority\tstatus\toutput\treport\tlocation\tnote\turl
      addition = {
        num: parseInt(parts[0]),
        date: parts[1].trim(), company: parts[2].trim(), role: parts[3].trim(),
        fit: col4, odds: col5, score: col6,
        status: validateStatus(parts[7].trim()),
        output: parts[8]?.trim() || '-', report: normalizeReportLink(parts[9]?.trim() || ''),
        location: parts[10]?.trim() || '-', notes: parts[11]?.trim() || '',
        url: parts[12]?.trim() || '-',
      };
    } else {
      // Legacy 9-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes (or swapped)
      let statusCol, scoreCol;
      if (isStatus(col4) && !isScore(col4)) { statusCol = col4; scoreCol = col5; }
      else if (isScore(col4) && isStatus(col5)) { statusCol = col5; scoreCol = col4; }
      else if (isScore(col5) && !isScore(col4)) { statusCol = col4; scoreCol = col5; }
      else { statusCol = col4; scoreCol = col5; }

      addition = {
        num: parseInt(parts[0]),
        date: parts[1].trim(), company: parts[2].trim(), role: parts[3].trim(),
        fit: scoreCol, odds: '-', score: scoreCol,
        status: validateStatus(statusCol),
        output: parts[6]?.trim() || '-', report: normalizeReportLink(parts[7]?.trim() || ''),
        location: '-', notes: parts[8]?.trim() || '', url: '-',
      };
    }
  }

  if (isNaN(addition.num) || addition.num === 0) {
    console.warn(`⚠️  Skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}

// ---- Main ----

// Read applications.md
if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to merge into.');
  process.exit(0);
}
const appContent = readFileSync(APPS_FILE, 'utf-8');
const appLines = appContent.split('\n');
const existingApps = [];

for (const line of appLines) {
  if (line.startsWith('|') && !line.includes('---') && !line.includes('Empresa')) {
    const app = parseAppLine(line);
    if (app) existingApps.push(app);
  }
}

// The archive is read but never written. A closed row that matches an incoming
// addition means the role was already evaluated and decided on, so the merge
// must not open a second row for it in the live tracker — that is exactly the
// duplicate the two-file split would otherwise create, one per file.
const archivedApps = [];
if (existsSync(ARCHIVE_FILE)) {
  for (const line of readFileSync(ARCHIVE_FILE, 'utf-8').split('\n')) {
    if (line.startsWith('|') && !line.includes('---') && !line.includes('Empresa')) {
      const app = parseAppLine(line);
      if (app) archivedApps.push(app);
    }
  }
}

console.log(`📊 Existing: ${existingApps.length} live, ${archivedApps.length} archived`);

// Read tracker additions
if (!existsSync(ADDITIONS_DIR)) {
  console.log('No tracker-additions directory found.');
  process.exit(0);
}

const tsvFiles = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
if (tsvFiles.length === 0) {
  console.log('✅ No pending additions to merge.');
  process.exit(0);
}

// Sort files numerically for deterministic processing
tsvFiles.sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, '')) || 0;
  const numB = parseInt(b.replace(/\D/g, '')) || 0;
  return numA - numB;
});

console.log(`📥 Found ${tsvFiles.length} pending additions`);

let added = 0;
let updated = 0;
let skipped = 0;
const newLines = [];

// Only a TSV that actually changed applications.md may be filed away. Anything
// else is HELD in place, because a merge that writes nothing and consumes the
// file anyway loses the evaluation: the report and the CV survive, the tracker
// row does not, and nothing left behind says so.
const merged = new Set();
const held = [];
const hold = (file, reason) => { held.push({ file, reason }); skipped++; };

for (const file of tsvFiles) {
  const content = readFileSync(join(ADDITIONS_DIR, file), 'utf-8').trim();
  const addition = parseTsvContent(content, file);
  if (!addition) { hold(file, 'could not be parsed. Fix the columns and merge again'); continue; }

  // Duplicate check: same company AND (same report number OR same role).
  // Company agreement is required on both paths — see findDuplicate().
  const duplicate = findDuplicate(existingApps, addition);

  // Archived match: report it and leave both files alone. Reviving a closed row
  // is a judgment call (the company reposted, the score moved, the reason for
  // closing may no longer hold), so it stays a human decision.
  if (!duplicate) {
    const archived = findDuplicate(archivedApps, addition);
    if (archived) {
      console.log(`📦 Archived: ${addition.company} — ${addition.role} (closed as "${archived.status || 'evaluated'}" in ${ARCHIVE_BASENAME}; move the row back by hand to re-open it)`);
      hold(file, `matches a row closed as "${archived.status || 'evaluated'}" in ${ARCHIVE_BASENAME}. Re-open that row by hand, or delete this file`);
      continue;
    }
  }

  if (duplicate) {
    const newScore = parseScore(addition.score);
    const oldScore = parseScore(duplicate.score);

    if (newScore > oldScore) {
      console.log(`🔄 Update: ${addition.company} — ${addition.role} (${oldScore}→${newScore})`);
      const lineIdx = appLines.indexOf(duplicate.raw);
      if (lineIdx >= 0) {
        let updatedLine;
        if (duplicate.format === 'new') {
          updatedLine = `| ${duplicate.date} | ${e(addition.company)} | ${e(addition.role)} | ${addition.fit} | ${addition.odds} | ${addition.score} | ${e(duplicate.status)} | ${e(duplicate.output)} | ${e(addition.report)} | ${e(duplicate.location)} | ${e(`Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`)} | ${e(duplicate.url)} |`;
        } else {
          updatedLine = `| ${duplicate.num} | ${addition.date} | ${e(addition.company)} | ${e(addition.role)} | ${addition.score} | ${e(duplicate.status)} | ${e(duplicate.output)} | ${e(addition.report)} | ${e(`Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`)} |`;
        }
        appLines[lineIdx] = updatedLine;
        updated++;
        merged.add(file);
      } else {
        hold(file, 'the row it updates vanished from the tracker mid-merge');
      }
    } else {
      console.log(`⏭️  Skip: ${addition.company} — ${addition.role} (matches "${duplicate.role}", existing ${oldScore} >= new ${newScore})`);
      hold(file, `treated as the same role as "${duplicate.role}" (${oldScore}), which scores at least as high. Confirm they are one role, then delete this file`);
    }
  } else {
    const newLine = `| ${addition.date} | ${e(addition.company)} | ${e(addition.role)} | ${addition.fit} | ${addition.odds} | ${addition.score} | ${e(addition.status)} | ${e(addition.output)} | ${e(addition.report)} | ${e(addition.location)} | ${e(addition.notes)} | ${e(addition.url)} |`;
    newLines.push(newLine);
    added++;
    merged.add(file);
    console.log(`➕ Add: ${addition.company} — ${addition.role} (${addition.fit} / ${addition.odds} / ${addition.score})`);
  }
}

// Insert new lines after the header (line index of first data row)
if (newLines.length > 0) {
  // Find header separator (|---|...) and insert after it
  let insertIdx = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (appLines[i].includes('---') && appLines[i].startsWith('|')) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx < 0) {
    // No header means nowhere to put the rows. Writing the file back unchanged
    // and filing the TSVs away would drop every one of them.
    console.error(`\n❌ ${APPS_FILE} has no table header — cannot insert ${newLines.length} row(s). Nothing written; all TSVs left in place.`);
    process.exit(1);
  }
  appLines.splice(insertIdx, 0, ...newLines);
}

// Write back
if (!DRY_RUN) {
  writeFileSync(APPS_FILE, appLines.join('\n'));

  // Re-sort after every merge
  try {
    execFileSync('node', [join(CAREER_OPS, 'sort-tracker.mjs')], { stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  sort-tracker.mjs failed:', e.message);
  }

  // File away ONLY what reached the tracker.
  if (merged.size > 0) {
    if (!existsSync(MERGED_DIR)) mkdirSync(MERGED_DIR, { recursive: true });
    for (const file of tsvFiles) {
      if (merged.has(file)) renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
    }
    console.log(`\n✅ Moved ${merged.size} TSVs to merged/`);
  }
}

if (held.length > 0) {
  console.log(`\n⚠️  Held in ${ADDITIONS_DIR.replace(CAREER_OPS + '/', '')}/. Nothing was written for these, so the files stay put:`);
  for (const { file, reason } of held) console.log(`   • ${file}: ${reason}`);
  console.log('   Every merge re-reports them. Resolve the row by hand, or delete the file to drop the evaluation.');
}

console.log(`\n📊 Summary: +${added} added, 🔄${updated} updated, ⏭️${skipped} held`);
if (DRY_RUN) console.log('(dry-run — no changes written)');

// Optional verify
if (VERIFY && !DRY_RUN) {
  console.log('\n--- Running verification ---');
  try {
    execFileSync('node', [join(CAREER_OPS, 'verify-pipeline.mjs')], { stdio: 'inherit' });
  } catch (e) {
    process.exit(1);
  }
}
