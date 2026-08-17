#!/usr/bin/env node
/**
 * normalize-statuses.mjs — Clean non-canonical states in applications.md
 *
 * Maps all non-canonical statuses to canonical ones per states.yml:
 *   Evaluada, Aplicado, Respondido, Entrevista, Oferta, Rechazado, Descartado, NO APLICAR
 *
 * Also strips markdown bold (**) and dates from the status field,
 * moving DUPLICADO info to the notes column.
 *
 * Run: node agentic-job-hunt/normalize-statuses.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { splitRowRaw, escapeCell } from './markdown-core.mjs';
import { trackerPaths } from './tracker-core.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Both tracker files. A non-canonical status in the archive still breaks the
// status parsers, and archiving a row is not a reason to stop cleaning it.
const APPS_FILES = trackerPaths(CAREER_OPS);
const DRY_RUN = process.argv.includes('--dry-run');

// Ensure required directories exist (fresh setup)
mkdirSync(join(CAREER_OPS, 'data'), { recursive: true });

// Canonical statuses are EMOJIS (or blank) per templates/states.yml.
// "Evaluated" is the BLANK status — an empty status column is already canonical.
const EMOJI = {
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

const EMOJI_SET = new Set(Object.values(EMOJI).filter(Boolean));

// Canonical status mapping
function normalizeStatus(raw) {
  // Strip markdown bold
  let s = raw.replace(/\*\*/g, '').trim();
  const lower = s.toLowerCase();

  // Blank / placeholder dash = Evaluated, pending apply decision. Already canonical.
  if (s === '' || s === '-' || s === '—') return { status: EMOJI.evaluated };

  // Already an emoji
  if (EMOJI_SET.has(s)) return { status: s };

  // DUPLICADO variants → Discarded
  if (/^duplicado/i.test(s) || /^dup\b/i.test(s)) {
    return { status: EMOJI.discarded, moveToNotes: raw.trim() };
  }

  // CERRADA / Cancelada / Descartada → Discarded
  if (/^cerrada$/i.test(s)) return { status: EMOJI.discarded };
  if (/^cancelada/i.test(s)) return { status: EMOJI.discarded };
  if (/^descartada$/i.test(s)) return { status: EMOJI.discarded };
  if (/^descartado$/i.test(s)) return { status: EMOJI.discarded };

  // Rechazada / Rechazado → Rejected
  if (/^rechazada?$/i.test(s)) return { status: EMOJI.rejected };
  if (/^rechazado\s+\d{4}/i.test(s)) return { status: EMOJI.rejected };

  // Aplicado with date → Applied (strip date)
  if (/^aplicado\s+\d{4}/i.test(s)) return { status: EMOJI.applied };

  // CONDICIONAL / HOLD / EVALUAR / Verificar → Evaluated (blank)
  if (/^(condicional|hold|evaluar|verificar)$/i.test(s)) return { status: EMOJI.evaluated };

  // MONITOR → SKIP
  if (/^monitor$/i.test(s)) return { status: EMOJI.skip };

  // GEO BLOCKER → SKIP
  if (/geo.?blocker/i.test(s)) return { status: EMOJI.skip };

  // Repost #NNN → Discarded
  if (/^repost/i.test(s)) return { status: EMOJI.discarded, moveToNotes: raw.trim() };

  // Text labels (English canonical + Spanish aliases) → emoji
  const labels = {
    'evaluated': EMOJI.evaluated, 'evaluada': EMOJI.evaluated,
    'applied': EMOJI.applied, 'aplicado': EMOJI.applied, 'enviada': EMOJI.applied,
    'aplicada': EMOJI.applied, 'sent': EMOJI.applied,
    'responded': EMOJI.responded, 'respondido': EMOJI.responded,
    'interview': EMOJI.interview, 'entrevista': EMOJI.interview,
    'offer': EMOJI.offer, 'oferta': EMOJI.offer,
    'rejected': EMOJI.rejected,
    'discarded': EMOJI.discarded,
    'ignored': EMOJI.ignored, 'ghosted': EMOJI.ignored,
    'no_response': EMOJI.ignored, 'no response': EMOJI.ignored,
    'skip': EMOJI.skip, 'no aplicar': EMOJI.skip, 'no_aplicar': EMOJI.skip,
  };
  if (lower in labels) return { status: labels[lower] };

  // Unknown — flag it
  return { status: null, unknown: true };
}

// Read the tracker files
if (APPS_FILES.length === 0) {
  console.log('No applications.md found. Nothing to normalize.');
  process.exit(0);
}
for (const APPS_FILE of APPS_FILES) {
const LABEL = APPS_FILE.split('/').pop();
console.log(`\n── ${LABEL} ──`);
const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

let changes = 0;
let unknowns = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const parts = splitRowRaw(line).map(s => s.trim());
  // Format: ['', '#', 'fecha', 'empresa', 'rol', 'score', 'STATUS', 'pdf', 'report', 'notas', '']
  if (parts.length < 9) continue;
  if (parts[1] === '#' || parts[1] === '---' || parts[1] === '') continue;

  const num = parseInt(parts[1]);
  if (isNaN(num)) continue;

  const rawStatus = parts[6];
  const result = normalizeStatus(rawStatus);

  if (result.unknown) {
    unknowns.push({ num, rawStatus, line: i + 1 });
    continue;
  }

  if (result.status === rawStatus) continue; // Already canonical

  // Apply change
  const oldStatus = rawStatus;
  parts[6] = escapeCell(result.status);

  // Move DUPLICADO info to notes if needed
  if (result.moveToNotes && parts[9]) {
    const existing = parts[9] || '';
    if (!existing.includes(result.moveToNotes)) {
      parts[9] = escapeCell(result.moveToNotes) + (existing ? '. ' + existing : '');
    }
  } else if (result.moveToNotes && !parts[9]) {
    parts[9] = escapeCell(result.moveToNotes);
  }

  // Also strip bold from score field
  if (parts[5]) {
    parts[5] = parts[5].replace(/\*\*/g, '');
  }

  // Reconstruct line
  const newLine = '| ' + parts.slice(1, -1).join(' | ') + ' |';
  lines[i] = newLine;
  changes++;

  console.log(`#${num}: "${oldStatus}" → "${result.status}"`);
}

if (unknowns.length > 0) {
  console.log(`\n⚠️  ${unknowns.length} unknown statuses:`);
  for (const u of unknowns) {
    console.log(`  #${u.num} (line ${u.line}): "${u.rawStatus}"`);
  }
}

console.log(`\n📊 ${changes} statuses normalized`);

if (!DRY_RUN && changes > 0) {
  // Backup first
  copyFileSync(APPS_FILE, APPS_FILE + '.bak');
  writeFileSync(APPS_FILE, lines.join('\n'));
  console.log(`✅ Written to ${LABEL} (backup: ${LABEL}.bak)`);
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No changes needed');
}
}
