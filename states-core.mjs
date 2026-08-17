/**
 * states-core.mjs — Shared status parsing for agentic-job-hunt
 *
 * Reads templates/states.yml as the source of truth for canonical statuses,
 * their emojis, and their aliases. Scripts import from here instead of
 * hardcoding their own copy of the mapping.
 *
 * applications.md stores the status column as EMOJI ONLY (blank = evaluated).
 * Text labels ('applied', 'rechazado', ...) are legacy and still resolve, so
 * older trackers and hand-edited rows keep working.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const STATES_FILE = existsSync(join(CAREER_OPS, 'templates/states.yml'))
  ? join(CAREER_OPS, 'templates/states.yml')
  : join(CAREER_OPS, 'states.yml');

// Fallback used only if states.yml is missing or unreadable, so a broken
// install degrades to the documented defaults instead of misreporting.
const FALLBACK_STATES = [
  { id: 'evaluated', emoji: '', aliases: ['evaluada'] },
  { id: 'applied', emoji: '✅', aliases: ['aplicado', 'enviada', 'aplicada', 'sent'] },
  { id: 'responded', emoji: '📬', aliases: ['respondido'] },
  { id: 'interview', emoji: '🎯', aliases: ['entrevista'] },
  { id: 'offer', emoji: '💰', aliases: ['oferta'] },
  { id: 'rejected', emoji: '❌', aliases: ['rechazado', 'rechazada'] },
  { id: 'discarded', emoji: '🚫', aliases: ['descartado', 'descartada', 'cerrada', 'cancelada'] },
  { id: 'ignored', emoji: '👻', aliases: ['ghosted', 'no_response', 'no response'] },
  { id: 'skip', emoji: '⏭️', aliases: ['no_aplicar', 'no aplicar', 'skip', 'monitor'] },
];

function loadStates() {
  if (!existsSync(STATES_FILE)) return FALLBACK_STATES;
  try {
    const parsed = yaml.load(readFileSync(STATES_FILE, 'utf-8'));
    const states = parsed?.states;
    if (!Array.isArray(states) || states.length === 0) return FALLBACK_STATES;
    return states.filter(s => s && typeof s.id === 'string');
  } catch {
    return FALLBACK_STATES;
  }
}

const STATES = loadStates();

// Emoji → canonical id. Variation selectors (U+FE0F) are stripped on both
// sides so '⏭️' and '⏭' both resolve.
const stripVariationSelectors = (s) => s.replace(/[︎️]/g, '');

export const EMOJI_TO_STATUS = {};
for (const state of STATES) {
  const emoji = stripVariationSelectors(String(state.emoji ?? '')).trim();
  if (emoji) EMOJI_TO_STATUS[emoji] = state.id;
}

// Text label / alias → canonical id.
export const ALIASES = {};
for (const state of STATES) {
  ALIASES[state.id] = state.id;
  for (const alias of state.aliases ?? []) {
    ALIASES[String(alias).trim().toLowerCase()] = state.id;
  }
}

// Legacy aliases kept for backward compatibility with older trackers.
// These predate states.yml and are not part of the canonical file.
const LEGACY_ALIASES = {
  'condicional': 'evaluated', 'hold': 'evaluated',
  'evaluar': 'evaluated', 'verificar': 'evaluated',
  'geo blocker': 'skip',
};
for (const [alias, id] of Object.entries(LEGACY_ALIASES)) {
  if (!ALIASES[alias]) ALIASES[alias] = id;
}

/**
 * Normalize a raw status cell to a canonical status id.
 *
 * Handles, in order: emoji (the current on-disk format), blank (= evaluated),
 * then text labels and aliases (legacy). Strips markdown bold and any
 * trailing date left over from older hand-written rows.
 *
 * Returns the canonical id, or the cleaned lowercase string if unrecognized.
 */
export function normalizeStatus(raw) {
  const cleaned = String(raw ?? '')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')
    .trim();

  if (cleaned === '') return 'evaluated';

  const emojiKey = stripVariationSelectors(cleaned);
  if (EMOJI_TO_STATUS[emojiKey]) return EMOJI_TO_STATUS[emojiKey];

  const lower = cleaned.toLowerCase();
  return ALIASES[lower] || lower;
}

/**
 * Bucket a status into an outcome for pattern analysis.
 *
 *   positive      — the application moved forward (or is live)
 *   negative      — the company said no, or the offer closed
 *   no_response   — applied and never heard back; retired after the window
 *   self_filtered — the candidate ruled it out before applying
 *   pending       — evaluated, decision not yet made
 *
 * no_response is kept out of negative on purpose: "they said no" and "they
 * never looked" are different signals, and lumping them together hides how
 * much of the funnel is silence rather than a decision.
 */
export function classifyOutcome(status) {
  const s = normalizeStatus(status);
  if (['interview', 'offer', 'responded', 'applied'].includes(s)) return 'positive';
  if (['rejected', 'discarded'].includes(s)) return 'negative';
  if (s === 'ignored') return 'no_response';
  if (s === 'skip') return 'self_filtered';
  return 'pending';
}
