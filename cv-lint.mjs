#!/usr/bin/env node
/**
 * cv-lint.mjs — CV rule compliance checker
 *
 * Runs automatically via PostToolUse hook on any Write/Edit to output/ CV files.
 * Can also be run manually: node cv-lint.mjs <file>
 *
 * Two modes, because the reader differs:
 *   hook   — payload arrives as JSON on stdin; the file is at tool_input.file_path.
 *            Emits pure JSON (hookSpecificOutput.additionalContext) so the model
 *            reads the warnings, and stays silent when the CV is clean.
 *   manual — file path as argv[2]; prints for a human.
 *
 * Exit code is always 0 (non-blocking). PostToolUse runs after the write has
 * already happened, so violations are warnings, never a veto.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Resolve target file ───────────────────────────────────────────────────────

let filePath = process.argv[2];
let hookMode = false;

if (!filePath) {
  // Called from the PostToolUse hook. Claude Code delivers the payload as JSON
  // on stdin — there is no CLAUDE_TOOL_INPUT environment variable, and reading
  // one is why this linter sat silent for every edit it was meant to catch.
  if (process.stdin.isTTY) process.exit(0);
  let raw;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }
  if (!raw || !raw.trim()) process.exit(0);
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path;
    hookMode = true;
  } catch {
    process.exit(0);
  }
}

if (!filePath) process.exit(0);

const abs = resolve(filePath);

// Only lint generated CV files under output/. The candidate name comes from
// config/profile.yml so this file stays portable; if the profile is missing or
// unnamed, fall back to linting every markdown/HTML file under output/.
let CANDIDATE = '';
try {
  const yml = readFileSync(resolve('config/profile.yml'), 'utf8');
  CANDIDATE = (yml.match(/^\s*(?:full_)?name:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
} catch { /* no profile yet */ }

const nameOk = CANDIDATE
  ? abs.includes(CANDIDATE)
  : /\.(md|html)$/.test(abs);
if (!abs.includes('/output/') || !nameOk) {
  process.exit(0);
}

if (!existsSync(abs)) process.exit(0);

const content = readFileSync(abs, 'utf8');
const isHTML = abs.endsWith('.html');
// A cover letter is a different document with different rules. It is named for
// the role it targets, so the CV title rule does not apply to it.
const isCoverLetter = /cover letter/i.test(abs);

// ── Rules ─────────────────────────────────────────────────────────────────────

const violations = [];

function check(label, pattern, message) {
  const matches = content.match(pattern);
  if (matches) {
    violations.push({ label, message, sample: matches[0].slice(0, 80) });
  }
}

// 1. Internal scale numbers (engineer counts, component/system/repo counts)
check(
  'INTERNAL_NUMBERS',
  /\b\d{1,3}[,.]?\d{3}\+?\s*(engineers|components|systems|repos|repositories|services)\b/gi,
  'Internal scale numbers (engineer/component/system/repo counts) must not appear in CVs. Remove or generalise ("production repositories", "engineering teams").'
);

// 2. Your own ownership boundaries
//
// FILL THIS IN. Add one check per phrasing that overclaims work you did not do.
// These exist because a generative pass reaches for the most impressive
// available verb, and only you know where the line is. Mirror the Ownership
// Accuracy block in modes/_profile.md.
//
// Example shape:
//   check(
//     'OVERCLAIMED_IMPLEMENTATION',
//     /standardized auth|defined (the )?integration contracts?/gi,
//     'Overclaimed technical implementation: you owned product scope, engineers built this.'
//   );

// 3. Forbidden cliché words
check(
  'CLICHE_VERBS',
  /\b(architected|spearheaded|leveraged|facilitated|synergies|passionate about|proven track record|best practices|cutting.?edge|innovative|seamless|robust|results.?oriented)\b/gi,
  'Cliché word found. Replace with specific, direct language.'
);

// 4. Em-dash continuation pattern ("-- [verb]ing")
check(
  'EMDASH_CONTINUATION',
  /--\s+\w+ing/g,
  'Em-dash continuation pattern ("-- [verb]ing"). Use a comma instead: "X, centralising Y".'
);

// 5. Em-dash / en-dash in body text (not in date ranges like "Nov 2024 – Present")
if (!isHTML) {
  // Strip date-range en-dashes before checking (e.g. "2021 – 2024", "Nov 2024 – Present")
  const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  const DATE  = `(?:${MONTH}\\s+)?\\d{4}`;
  const stripped = content
    .replace(new RegExp(`(${DATE})\\s*[–—]\\s*(${DATE}|Present|present)`, 'g'), '$1-$2')
    // An inline code span quotes a literal string, so a dash inside it is the
    // thing being quoted rather than the author's punctuation.
    .replace(/`[^`\n]*`/g, '``');
  if (stripped.match(/[—–]/)) {
    violations.push({
      label: 'DASH_IN_MD',
      message: 'Em-dash or en-dash in markdown body text (not a date range). Use commas, colons, or parentheses instead.',
      sample: stripped.match(/[—–]/)?.input?.slice(0, 80),
    });
  }
}

// 6. Wrong job title format (product name appended to title)
//
// Skipped for cover letters. A letter's subject line names the role being
// applied for, which is the correct thing for it to do; the rule is about the
// title the CV claims for its own author.
if (!isCoverLetter) {
  check(
    'TITLE_WITH_PRODUCT',
  /Senior Product Manager[,:]?\s+(Developer|Platform|AI|Security|Infrastructure|Catalog|IDP)/gi,
    'Job title includes product name. Keep title as "Senior Product Manager" only; product goes in the italic Product: subtitle.'
  );
}

// 7. "Portfolio Management" in skills
check(
  'PORTFOLIO_MGMT_SKILL',
  /Portfolio Management/gi,
  '"Portfolio Management" must not appear in Skills. Use "Roadmap Planning" instead.'
);

// 8. Hebrew characters
check(
  'HEBREW',
  /[֐-׿]/g,
  'Hebrew characters found. Remove permanently.'
);

// 9. Ownership overclaim for entire platform
check(
  'PLATFORM_OVERCLAIM',
  /I lead (the|our) Internal Developer Platform[^,.\n]/gi,
  'Overclaim: do not say "I lead the IDP". Use "I lead the core product areas of our IDP".'
);

// 10. Closing oversell sentences
check(
  'OVERSELL_CLOSER',
  /(Strong match for|directly applicable to|experience transferable to|perfectly aligned with)/gi,
  'Oversell closer found. Remove — let the recruiter decide fit.'
);

// 11. Missing Product: subtitle (MD only — check each role block that looks like a job entry)
if (!isHTML) {
  // Scoped to the employment section. Personal projects use the same heading
  // shape ("name | status | url") and carry no Product: line by design, so
  // scanning the whole document reports every side project as a broken job.
  const experience = content.split(/^## /m).find((sec) => /^(Work )?Experience/i.test(sec)) ?? '';
  const roleBlocks = experience.split(/^### /m).slice(1);
  roleBlocks.forEach((block) => {
    // Only check blocks that look like job entries: "Company | Role | Dates | Location"
    const firstLine = block.split('\n')[0];
    if (!firstLine.includes('|')) return; // skip non-job blocks (e.g. candidate title)
    if (!block.match(/^[_*]{0,2}Product:/m)) {
      const company = firstLine.split('|')[0].trim().slice(0, 40);
      violations.push({
        label: 'MISSING_PRODUCT_SUBTITLE',
        message: `Role "${company}" is missing its Product: subtitle line.`,
        sample: company,
      });
    }
  });
}

// 12. Employment facts
//
// FILL THIS IN. One check per employment detail a tailored CV tends to get
// wrong: an office-based role rendered as remote, a title inflated to match the
// posting, a date range quietly widened.
//
// Example shape:
//   check(
//     'EMPLOYER_LOCATION',
//     /{Employer}.*Remote/gi,
//     '{Employer} was office-based in {city}, not remote. Fix the location.'
//   );

// 13. Your internal numbers
//
// FILL THIS IN. Add the specific headcounts and scale figures that are
// confidential at your employers. Rule 1 above catches the generic shapes; this
// one catches the exact numbers you must never publish.

// ── Output ────────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  // Silent in hook mode: a clean CV should not add noise to every edit.
  if (!hookMode) console.log(`cv-lint: ✅ ${filePath} — no violations found`);
  process.exit(0);
}

const report = [
  `cv-lint: ${violations.length} violation(s) in ${filePath}`,
  '',
  ...violations.flatMap(({ label, message, sample }) => [
    `  [${label}]`,
    `  ${message}`,
    ...(sample ? [`  Found: "${sample}"`] : []),
    '',
  ]),
].join('\n');

if (hookMode) {
  // Pure JSON, nothing else on stdout — mixed output is read as plain text and
  // the structured block is lost.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: report,
    },
  }));
} else {
  console.log(`\n${report}`);
}

// Always exit 0 — violations are warnings, not hard errors
process.exit(0);
