#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for agentic-job-hunt
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, cpSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 agentic-job-hunt test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run('node', ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: 1, allowFail: true }, // fails without cv.md (normal in repo)
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs', expectExit: 0 },
  { name: 'dedup-tracker.mjs', expectExit: 0 },
  { name: 'merge-tracker.mjs', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run('node', name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(ROOT, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 3b. TRACKER SORT ORDER ──────────────────────────────────────

// The sort rules are a product decision documented in CLAUDE.md §"Sort Order",
// and nothing else enforces them: a regression here silently reorders the
// user's tracker instead of failing loudly.
console.log('\n3b. Tracker sort order');

try {
  const { sortTracker } = await import(pathToFileURL(join(ROOT, 'sort-tracker.mjs')).href);

  // Column labels only — sortTracker reads the header, not fixed offsets.
  const header = [
    '| Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const row = (company, { date, priority, odds = 3.0, status = '', notes = '' }) =>
    `| ${date} | ${company} | PM | 4.0/5 | ${odds}/5 | ${priority}/5 | ${status} |  |  | Berlin | ${notes} |  |`;

  const companies = (lines) =>
    lines.filter(l => l.startsWith('|') && /\d{4}-\d{2}-\d{2}/.test(l))
      .map(l => l.split('|')[2].trim());

  const sortOf = (rows) => {
    const out = sortTracker([...header, ...rows]);
    if (out.error) throw new Error(`sortTracker returned error: ${out.error}`);
    return out;
  };

  // 1. Group order: blank › pending › applied › skip › closed › ignored.
  const grouped = sortOf([
    row('Ignored', { date: '2026-01-01', priority: 4.9, status: '👻' }),
    row('Rejected', { date: '2026-01-02', priority: 4.9, status: '❌' }),
    row('Skipped', { date: '2026-01-03', priority: 4.9, status: '⏭️' }),
    row('Applied', { date: '2026-01-04', priority: 1.0, status: '✅' }),
    row('Interview', { date: '2026-01-05', priority: 1.0, status: '🎯' }),
    row('Blank', { date: '2026-01-06', priority: 1.0, status: '' }),
  ]);
  const wantGroups = ['Blank', 'Interview', 'Applied', 'Skipped', 'Rejected', 'Ignored'];
  if (JSON.stringify(companies(grouped.lines)) === JSON.stringify(wantGroups)) {
    pass('Status groups sort in documented order');
  } else {
    fail(`Group order wrong: got ${companies(grouped.lines).join(' › ')}`);
  }

  // 2. Decision queues rank by priority, NOT by date.
  const byPriority = sortOf([
    row('Low', { date: '2026-06-01', priority: 2.0 }),
    row('High', { date: '2026-01-01', priority: 4.5 }),
    row('Mid', { date: '2026-03-01', priority: 3.0 }),
  ]);
  if (JSON.stringify(companies(byPriority.lines)) === JSON.stringify(['High', 'Mid', 'Low'])) {
    pass('Blank group ranks by priority desc');
  } else {
    fail(`Blank group not priority-ranked: ${companies(byPriority.lines).join(', ')}`);
  }

  // 3. Chase queues rank by date, NOT by priority — the rule the old
  //    priority-only comparator got wrong.
  const byDate = sortOf([
    row('Older', { date: '2026-01-01', priority: 4.8, status: '✅' }),
    row('Newest', { date: '2026-06-01', priority: 1.2, status: '✅' }),
    row('Middle', { date: '2026-03-01', priority: 4.9, status: '✅' }),
  ]);
  if (JSON.stringify(companies(byDate.lines)) === JSON.stringify(['Newest', 'Middle', 'Older'])) {
    pass('Applied group ranks by date desc, overriding priority');
  } else {
    fail(`Applied group not date-ranked: ${companies(byDate.lines).join(', ')}`);
  }

  // 4. Chase queues use the SENT date from the notes, not the evaluation date.
  const bySentDate = sortOf([
    row('EvaluatedLate', { date: '2026-05-01', priority: 3.0, status: '✅', notes: 'Applied 2026-05-02' }),
    row('SentLate', { date: '2026-01-01', priority: 3.0, status: '✅', notes: 'Applied 2026-06-01' }),
  ]);
  if (companies(bySentDate.lines)[0] === 'SentLate') {
    pass('Applied group uses the sent date, not the evaluation date');
  } else {
    fail(`Applied group used the Date column: ${companies(bySentDate.lines).join(', ')}`);
  }

  // 5. Tie-breaks: equal priority falls to date desc, then odds desc.
  const tied = sortOf([
    row('SameDayLowOdds', { date: '2026-02-01', priority: 4.0, odds: 2.0 }),
    row('Oldest', { date: '2026-01-01', priority: 4.0, odds: 5.0 }),
    row('SameDayHighOdds', { date: '2026-02-01', priority: 4.0, odds: 4.0 }),
  ]);
  const wantTies = ['SameDayHighOdds', 'SameDayLowOdds', 'Oldest'];
  if (JSON.stringify(companies(tied.lines)) === JSON.stringify(wantTies)) {
    pass('Equal priority tie-breaks by date desc then odds desc');
  } else {
    fail(`Tie-break wrong: ${companies(tied.lines).join(', ')}`);
  }

  // 5b. Unapplied queue: effort lane first, then the freshest posting.
  //     A 4.1 role must not sit under a 3.9 one however new the 3.9 is, and
  //     inside a lane the newest posting leads regardless of the decimals.
  const laned = sortOf([
    row('LightLaneFresh', { date: '2026-02-01', priority: 3.9, notes: 'Posted 2026-08-09' }),
    row('FullLaneStale',  { date: '2026-02-01', priority: 4.9, notes: 'Posted 2026-06-01' }),
    row('FullLaneFresh',  { date: '2026-02-01', priority: 4.1, notes: 'Posted 2026-08-08' }),
    row('FullLaneUndated', { date: '2026-02-01', priority: 4.5 }),
  ]);
  const wantLanes = ['FullLaneFresh', 'FullLaneStale', 'FullLaneUndated', 'LightLaneFresh'];
  if (JSON.stringify(companies(laned.lines)) === JSON.stringify(wantLanes)) {
    pass('Unapplied sorts by effort lane, then posting freshness');
  } else {
    fail(`Lane/freshness order wrong: ${companies(laned.lines).join(', ')}`);
  }

  // 6. Idempotence — re-sorting a sorted file must not churn the diff.
  const identical = [
    row('A', { date: '2026-02-01', priority: 4.0 }),
    row('B', { date: '2026-02-01', priority: 4.0 }),
    row('C', { date: '2026-02-01', priority: 4.0 }),
  ];
  const first = sortOf(identical);
  const second = sortTracker(first.lines);
  if (first.moved === 0 && second.moved === 0 &&
      JSON.stringify(first.lines) === JSON.stringify(second.lines)) {
    pass('Sort is idempotent on fully-tied rows');
  } else {
    fail(`Sort reshuffles tied rows (moved: ${first.moved}, ${second.moved})`);
  }

  // 7. Every state in states.yml belongs to a group. An unmapped state would
  //    fall through to "unapplied" and quietly sit at the top of the tracker.
  const { GROUPS } = await import(pathToFileURL(join(ROOT, 'sort-tracker.mjs')).href);
  if (fileExists('templates/states.yml')) {
    // Only the `states:` block maps to sort groups. The file also carries a
    // `stages:` ladder (interview depth, consumed by analyze-scoring.mjs),
    // whose ids are not tracker statuses and have no group.
    const statesBlock = readFile('templates/states.yml').split(/^stages:/m)[0];
    const ids = [...statesBlock.matchAll(/^\s*-\s*id:\s*(\S+)/gm)].map(m => m[1]);
    const mapped = new Set(GROUPS.flatMap(g => g.ids));
    const orphans = ids.filter(id => !mapped.has(id));
    if (orphans.length === 0) {
      pass(`All ${ids.length} states map to a sort group`);
    } else {
      fail(`States with no sort group: ${orphans.join(', ')}`);
    }
  }
} catch (e) {
  fail(`Tracker sort tests crashed: ${e.message}`);
}

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  const goAvailable = run('go version');
  if (goAvailable === null) {
    warn('Dashboard build skipped (go not installed)');
  } else {
    const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
    if (goBuild !== null) {
      pass('Dashboard compiles');
    } else {
      fail('Dashboard build failed');
    }
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 3c. TRACKER MERGE MATCHING ──────────────────────────────────

// merge-tracker.mjs decides whether an incoming evaluation opens a new tracker
// row or resolves to one already there. A false match DISCARDS the evaluation:
// the report and the CV survive, the row never appears, and the only trace is
// one line of console output. A real evaluation was lost that way.
console.log('\n3c. Tracker merge matching');

try {
  const { findDuplicate, roleFuzzyMatch } = await import(pathToFileURL(join(ROOT, 'match-core.mjs')).href);

  const row = (company, role, report) => ({ company, role, report: `[${report}](../reports/x.md)` });
  const tsv = (company, role, report) => ({ company, role, report: `[${report}](../reports/x.md)` });

  // 1. Report numbers are NOT unique keys (CLAUDE.md §"Pipeline Integrity").
  //    Concurrent sessions hand the same number to different companies, and
  //    matching on the number alone resolved a Northwind addition to a
  //    brickworks row and dropped it.
  const numberCollision = findDuplicate(
    [row('brickworks', 'Team Lead, Commerce Platform', 319)],
    tsv('Northwind', 'Product Manager - Infrastructure Monitoring', 319),
  );
  if (numberCollision === null) {
    pass('A shared report number across two companies is not a duplicate');
  } else {
    fail(`Report number 319 matched across companies → ${numberCollision.company}`);
  }

  // 2. Same company, same report number: this is the re-evaluation path, and
  //    it has to keep resolving or every re-eval opens a second row.
  const sameCompanyNumber = findDuplicate(
    [row('Northwind', 'AI Senior Product Manager', 318)],
    tsv('Northwind', 'AI Senior PM', 318),
  );
  if (sameCompanyNumber) {
    pass('Same company + same report number still resolves to the existing row');
  } else {
    fail('Re-evaluation of the same report no longer finds its row');
  }

  // 3. One company, several concurrent openings. One employer in this tracker had five product
  //    roles live on 2026-08-25 sharing the whole title stem, so the domain
  //    qualifier is the only thing separating them.
  const distinct = [
    ['Product Manager - Infrastructure Monitoring', 'AI Senior Product Manager'],
    ['Product Manager - Infrastructure Monitoring', 'Product Manager - Cybersecurity & AI'],
    // Shared prefix, opposed differentiator — Zendesk, two real openings.
    ['Senior Product Manager, AI Agents (Config & Personalization)', 'Senior Product Manager, AI Agents Testing'],
    // Same shape, one word apart — Jumbo Supermarkten.
    ['Senior Product Owner AI Platform', 'Senior Product Owner Data Platform'],
    // A lone qualifier must not swallow a specific one — SIXT, three AI roles.
    ['AI Product Manager (m/f/d)', '(Senior) PO Agentic AI B2B'],
  ];
  const wronglyMerged = distinct.filter(([a, b]) => roleFuzzyMatch(a, b));
  if (wronglyMerged.length === 0) {
    pass(`${distinct.length} concurrent-opening title pairs stay distinct`);
  } else {
    fail(`Distinct roles treated as one: ${wronglyMerged.map(p => p.join(' / ')).join('; ')}`);
  }

  // 4. The other direction. The tracker abbreviates, the posting spells out.
  //    Under-matching duplicates rows instead of losing them, but a title that
  //    reduces to nothing distinguishing used to not even match ITSELF.
  const same = [
    ['Senior PM, AI', 'Senior Product Manager - AI'],
    ['Senior Product Manager - AI', 'Senior AI Product Manager'],
    ['AI Senior Product Manager', 'AI Senior Product Manager'],
    ['Senior Product Manager', 'Product Manager, Senior'],
    ['Senior Product Manager (YouTrack)', 'Product Manager, YouTrack'],
  ];
  const wronglySplit = same.filter(([a, b]) => !roleFuzzyMatch(a, b));
  if (wronglySplit.length === 0) {
    pass(`${same.length} rewritten-title pairs still resolve to one role`);
  } else {
    fail(`Same role treated as new: ${wronglySplit.map(p => p.join(' / ')).join('; ')}`);
  }
} catch (e) {
  fail(`Merge matching tests crashed: ${e.message}`);
}

// ── 3d. MERGE KEEPS WHAT IT DID NOT WRITE ───────────────────────

// A merge that writes nothing and files the TSV away anyway loses the whole
// evaluation. Every TSV that did not reach applications.md must still be
// sitting in batch/tracker-additions/ when the run ends.
console.log('\n3d. Merge holds unwritten TSVs');

let sandbox = null;
try {
  sandbox = mkdtempSync(join(tmpdir(), 'career-ops-merge-'));
  for (const f of readdirSync(ROOT).filter(f => f.endsWith('.mjs'))) {
    cpSync(join(ROOT, f), join(sandbox, f));
  }
  cpSync(join(ROOT, 'templates'), join(sandbox, 'templates'), { recursive: true });
  // merge-tracker.mjs shells out to sort-tracker.mjs, which imports js-yaml.
  // Without this the sort fails and buries the result under a stack trace.
  if (existsSync(join(ROOT, 'node_modules'))) {
    symlinkSync(join(ROOT, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
  }
  mkdirSync(join(sandbox, 'data'), { recursive: true });
  mkdirSync(join(sandbox, 'batch/tracker-additions'), { recursive: true });

  const header = [
    '| Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  writeFileSync(join(sandbox, 'data/applications.md'), [
    ...header,
    '| 2026-08-25 | Northwind | AI Senior Product Manager | 4.4/5 | 3.5/5 | 4.1/5 |  | - | [318](../reports/318-northwind-2026-08-25.md) | Ramat Gan, Israel | x | https://example.com/a |',
  ].join('\n'));
  writeFileSync(join(sandbox, 'data/applications-archive.md'), header.join('\n'));

  const cols = (o) => [
    '400', '2026-08-25', 'Northwind', 'AI Senior Product Manager',
    '4.0/5', '3.0/5', o.priority, '', '-',
    '[400](../reports/400-northwind-2026-08-25.md)', 'Ramat Gan, Israel', 'note', 'https://example.com/b',
  ].join('\t');
  // Scores at or below the row it matches, so the merge writes nothing.
  writeFileSync(join(sandbox, 'batch/tracker-additions/400-northwind.tsv'), cols({ priority: '3.4/5' }));
  // Malformed: too few columns to parse at all.
  writeFileSync(join(sandbox, 'batch/tracker-additions/401-broken.tsv'), 'nope\tnot\tenough');

  // Pipe stderr too: the fixture deliberately includes a malformed TSV, and its
  // warning is expected output, not a failure to show the reader.
  const out = run('node', [join(sandbox, 'merge-tracker.mjs')], { cwd: sandbox, stdio: ['ignore', 'pipe', 'pipe'] });
  const pending = existsSync(join(sandbox, 'batch/tracker-additions'))
    ? readdirSync(join(sandbox, 'batch/tracker-additions')).filter(f => f.endsWith('.tsv'))
    : [];
  const filed = existsSync(join(sandbox, 'batch/tracker-additions/merged'))
    ? readdirSync(join(sandbox, 'batch/tracker-additions/merged')).filter(f => f.endsWith('.tsv'))
    : [];

  if (out === null) {
    fail('merge-tracker.mjs crashed on the held-TSV fixture');
  } else if (pending.includes('400-northwind.tsv') && !filed.includes('400-northwind.tsv')) {
    pass('A skipped addition stays in tracker-additions/ instead of moving to merged/');
  } else {
    fail(`Skipped addition was consumed (pending: ${pending.join(',') || 'none'}; merged: ${filed.join(',') || 'none'})`);
  }

  if (pending.includes('401-broken.tsv') && !filed.includes('401-broken.tsv')) {
    pass('A malformed TSV is held rather than filed away unparsed');
  } else {
    fail(`Malformed TSV was consumed (pending: ${pending.join(',') || 'none'})`);
  }

  if (out && out.includes('Held in')) {
    pass('The run names every held TSV and why');
  } else {
    fail('Held TSVs are not reported at the end of the run');
  }
} catch (e) {
  fail(`Merge hold tests crashed: ${e.message}`);
} finally {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'VERSION', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/job-hunt/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// This repo is a TEMPLATE. It ships examples and templates; the real profile
// files are created by the user at setup and gitignored, so a clone never
// carries someone else's identity. Assert exactly that, in both directions.
const seedFiles = [
  'config/profile.example.yml', 'modes/_profile.template.md', 'templates/portals.example.yml',
];
for (const f of seedFiles) {
  if (existsSync(f)) pass(`Seed file present: ${f}`);
  else fail(`Missing seed file: ${f}`);
}

const userFiles = ['config/profile.yml', 'modes/_profile.md', 'portals.yml', 'cv.md'];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (!tracked) pass(`User file not tracked: ${f}`);
  else fail(`User file IS tracked — it would ship someone's identity: ${f}`);
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

// A template must never carry a real person's identity. These patterns are the
// author's, so a fork that fills in cv.md and forgets to gitignore it fails
// here loudly. Add your own once you have set the project up: your name, your
// email, your phone, your home path.
const leakPatterns = [
  'Vitalii Batyr', 'batirko@', '/Users/vitalii/',
  'Santiago', 'santifer.io', 'hi@santifer.io', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // Attribution to both authors is legitimate and required by the licence.
  'README.md', 'LICENSE', 'CLAUDE.md', 'package.json', 'test-all.mjs',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
//
// reports/, output/ and interview-prep/ are excluded. They are the record of
// what this search actually did, not shipped code — an evaluation that quoted a
// local path in 2026-05 is history, and rewriting history to satisfy a linter
// is the wrong trade. The check exists to keep hardcoded paths out of scripts,
// modes and config.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs | grep -v '^reports/' | grep -v '^output/' | grep -v '^interview-prep/'`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// ── 9. CLAUDE.md INTEGRITY ──────────────────────────────────────

console.log('\n9. CLAUDE.md integrity');

const claude = readFile('CLAUDE.md');
// Sections this fork actually relies on. 'Update Check' went with
// update-system.mjs, 'Canonical States' was renamed 'Status Emojis', and the
// first-run wizard moved to docs/SETUP.md — it was 98 lines of always-loaded
// context describing a state this project left in April.
const requiredSections = [
  'Data Contract', 'Ethical Use',
  'Offer Verification', 'Status Emojis', 'TSV Format',
  'The tracker is two files', 'Sort Order', 'Location Tiers',
];

for (const section of requiredSections) {
  if (claude.includes(section)) {
    pass(`CLAUDE.md has section: ${section}`);
  } else {
    fail(`CLAUDE.md missing section: ${section}`);
  }
}

// ── 10. STATUS CONSISTENCY ───────────────────────────────────────

// The emoji/alias map is duplicated across five JS files and the Go dashboard;
// only states-core.mjs reads states.yml at runtime. A status that is missing
// from any one of them fails silently — rows land in the wrong sort group, or
// verify-pipeline rejects the whole tracker. Scan the sources so drift is
// caught here instead of in production data.
console.log('\n10. Status consistency (states.yml vs consumers)');

const STATUS_CONSUMERS = [
  'states-core.mjs',
  'sort-tracker.mjs',
  'merge-tracker.mjs',
  'verify-pipeline.mjs',
  'normalize-statuses.mjs',
  'dashboard/internal/data/career.go',
  'dashboard/internal/ui/screens/pipeline.go',
  'CLAUDE.md',
];

if (fileExists('templates/states.yml')) {
  const statesYml = readFile('templates/states.yml');
  const states = [...statesYml.matchAll(/^\s*-\s*id:\s*(\S+)[\s\S]*?^\s*emoji:\s*"([^"]*)"/gm)]
    .map(m => ({ id: m[1], emoji: m[2] }));

  if (states.length === 0) {
    fail('Could not parse any states from templates/states.yml');
  } else {
    const sources = Object.fromEntries(
      STATUS_CONSUMERS.filter(fileExists).map(f => [f, readFile(f)])
    );
    let drift = 0;
    for (const { id, emoji } of states) {
      // 'evaluated' is the blank status — there is no emoji literal to find.
      const needle = emoji || null;
      for (const [file, src] of Object.entries(sources)) {
        const known = needle ? src.includes(needle) : true;
        // Go files use canonical ids, not emoji.
        const knownById = src.includes(`"${id}"`) || src.includes(`'${id}'`) || src.includes(`${id}:`);
        if (!known && !knownById) {
          fail(`Status "${id}" (${emoji}) missing from ${file}`);
          drift++;
        }
      }
    }
    if (drift === 0) pass(`All ${states.length} states in states.yml are known to every consumer`);
  }
} else {
  fail('templates/states.yml missing — cannot check status consistency');
}

// ── 11. VERSION FILE ─────────────────────────────────────────────

console.log('\n11. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}
