/**
 * markdown-core.mjs — Pipe-safe cell handling for the markdown tables and
 * pipe-delimited lines agentic-job-hunt stores its data in.
 *
 * `data/applications.md`, `data/triage.md`, `data/excluded.md` and
 * `data/pipeline.md` all use `|` as the field separator. Real job data puts
 * pipes inside the fields:
 *
 *   Technical Product Manager | Developer Platform   (title names two things)
 *   Senior Product Manager (m|w|d) Catalog Content   (German gender marker)
 *   STARCON | HR Experts                             (agency company name)
 *   Germany | Remote                                 (Greenhouse location)
 *
 * A plain `line.split('|')` shifts every field after the first stray pipe. The
 * damage is silent and it is not cosmetic: a split title loses the half that
 * names the domain, and a split company name turns the role column into the
 * company's own suffix. On 2026-08-09 that had corrupted 23 pipeline rows and
 * demoted five roles out of the worth-evaluating bucket.
 *
 * The convention is the markdown one: a literal pipe inside a cell is written
 * `\|`. Read with splitRow(), write with escapeCell(). Both live here, in one
 * module, because the last bug of this class came from a writer and a reader
 * that disagreed.
 */

/** Write side: make a value safe to place between two `|` separators. */
export function escapeCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}

/**
 * Read side: split a row into trimmed, unescaped cells.
 *
 * Use for anything that reads values. Do not use for rewriting a row in place
 * — rejoining these cells would drop the escaping on every cell you did not
 * touch. Use splitRowRaw() for that.
 */
export function splitRow(line) {
  return splitRowRaw(line).map(c => c.trim().replace(/\\\|/g, '|'));
}

/**
 * Read side, verbatim: split on unescaped pipes only, preserving each cell's
 * original spacing and escaping.
 *
 * For scripts that rewrite one cell and join the rest back untouched. Escape
 * the replacement cell with escapeCell(); the others are already correct.
 */
export function splitRowRaw(line) {
  return line.split(/(?<!\\)\|/);
}
