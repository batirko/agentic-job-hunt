#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, applies title
 * filters from portals.yml, deduplicates against existing history,
 * and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import {
  buildTitleFilter,
  buildTierResolver,
  loadTierConfig,
  loadSeenUrls,
  loadSeenCompanyRoles,
  isSeen,
  markSeen,
  appendToPipeline,
  appendToScanHistory,
  PIPELINE_PATH,
  SCAN_HISTORY_PATH,
} from './scan-core.mjs';

const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 10_000;

// ── API detection ───────────────────────────────────────────────────

function detectApi(company) {
  // Explicit api field — infer the board type from the endpoint host
  if (company.api) {
    if (company.api.includes('greenhouse')) return { type: 'greenhouse', url: company.api };
    if (company.api.includes('ashbyhq')) return { type: 'ashby', url: company.api };
    if (company.api.includes('lever.co')) return { type: 'lever', url: company.api };
    if (company.api.includes('comeet.co')) return { type: 'comeet', url: company.api };
    if (company.api.includes('workable.com')) return { type: 'workable', url: company.api };
  }

  const url = company.careers_url || '';

  // Workable. The public widget endpoint needs no key and returns the same
  // listings as apply.workable.com/{account}.
  const workableMatch = url.match(/apply\.workable\.com\/([^/?#]+)/);
  if (workableMatch) {
    return {
      type: 'workable',
      url: `https://apply.workable.com/api/v1/widget/accounts/${workableMatch[1]}`,
    };
  }

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  // Greenhouse EU boards
  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

/**
 * Publication date as YYYY-MM-DD, or '' when the board does not give one.
 *
 * Every board here carries a date, and sort-tracker.mjs ranks the unapplied
 * queue on it. Dropping it sinks every board role to the bottom of its lane
 * behind the LinkedIn ones, which is why it is read here and not left to a
 * later pass.
 */
function toPostedDate(value) {
  if (value === undefined || value === null || value === '') return '';
  const d = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
    posted: toPostedDate(j.first_published || j.updated_at),
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
    posted: toPostedDate(j.publishedAt),
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    posted: toPostedDate(j.createdAt),
  }));
}

function parseComeet(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.name || '',
    url: j.url_comeet_hosted_page || j.url_active_page || j.position_url || '',
    company: companyName,
    location: j.location?.name || '',
    posted: toPostedDate(j.time_updated),
  }));
}

function parseWorkable(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.shortlink || j.url || '',
    company: companyName,
    // Workable splits the place across fields; the tier resolver reads one string.
    location: [j.city, j.state, j.country].filter(Boolean).join(', '),
    posted: toPostedDate(j.published_on || j.created_at),
  }));
}

const PARSERS = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  comeet: parseComeet,
  workable: parseWorkable,
};

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);
  const resolveTier = buildTierResolver(loadTierConfig());

  // 2. Filter to enabled companies with detectable APIs
  const targets = companies
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map(c => ({ ...c, _api: detectApi(c) }))
    .filter(c => c._api !== null);

  const skipped = companies
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .filter(c => detectApi(c) === null)
    .map(c => c.name);

  console.log(`Scanning ${targets.length} companies via API (${skipped.length} skipped — no API detected)`);
  if (skipped.length > 0) {
    // Name them: a silently skipped company looks identical to one with no openings.
    console.log(`  Not scanned: ${skipped.join(', ')}`);
  }
  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 3. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalLocationFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];
  const emptyBoards = [];

  const tasks = targets.map(company => async () => {
    const { type, url } = company._api;
    try {
      const json = await fetchJson(url);
      const jobs = PARSERS[type](json, company.name);
      totalFound += jobs.length;
      // A board that answers 200 with an empty list reads exactly like a healthy
      // board with nothing open, so a stale token can hide for months. Record it.
      if (jobs.length === 0) emptyBoards.push(company.name);

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        // Tier resolves desirability. Only untiered locations (US, APAC,
        // anchored non-European cities) get dropped — every S-C role is kept.
        const loc = resolveTier(job.location);
        if (!loc.keep) {
          totalLocationFiltered++;
          continue;
        }
        if (isSeen(seenUrls, job.url, job.company, job.title, seenCompanyRoles)) {
          totalDupes++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        markSeen(seenUrls, seenCompanyRoles, job.url, job.company, job.title);
        newOffers.push({ ...job, tier: loc.tier, source: `${type}-api` });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Out of tier (dropped): ${totalLocationFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  const byTier = newOffers.reduce((acc, o) => {
    const k = o.tier || '?';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  if (newOffers.length > 0) {
    const summary = ['S', 'A', 'B', 'C', '?']
      .filter(t => byTier[t])
      .map(t => `${t}:${byTier[t]}`)
      .join('  ');
    console.log(`By location tier:      ${summary}   (? = unqualified remote)`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (emptyBoards.length > 0) {
    console.log(`\nBoards that returned no postings (${emptyBoards.length}):`);
    console.log(`  ${emptyBoards.sort().join(', ')}`);
    console.log('  A company that moved ATS looks the same as one with nothing open.');
    console.log('  If a name sits here run after run, open its careers page and check the token.');
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + [${o.tier || '?'}] ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /job-hunt pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
