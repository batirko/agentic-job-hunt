#!/usr/bin/env node

/**
 * scan-linkedin.mjs — Zero-token LinkedIn scanner
 *
 * LinkedIn has no public jobs API, but it serves its job search to logged-out
 * visitors through two endpoints that return plain HTML fragments:
 *
 *   /jobs-guest/jobs/api/seeMoreJobPostings/search   → paginated result cards
 *   /jobs-guest/jobs/api/jobPosting/{jobId}          → the full description
 *
 * No account, no browser, no LLM tokens — same cost profile as scan.mjs.
 * Because nothing is authenticated, a bad run costs at worst a rate-limit,
 * never the account.
 *
 * Requests are sequential and paced. This is a DELTA scan: narrow the window
 * with --days rather than crawling deep pagination.
 *
 * Usage:
 *   node scan-linkedin.mjs                     # scan the configured matrix
 *   node scan-linkedin.mjs --dry-run           # preview without writing
 *   node scan-linkedin.mjs --days 30           # widen the window (backfill)
 *   node scan-linkedin.mjs --pages 5           # deeper pagination
 *   node scan-linkedin.mjs --query platform    # only matching queries
 *   node scan-linkedin.mjs --location Austria  # only matching locations
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import {
  classifyTitle,
  buildTierResolver,
  loadTierConfig,
  loadSeenUrls,
  loadSeenCompanyRoles,
  isSeen,
  markSeen,
  appendToPipeline,
  appendToScanHistory,
  canonicalLinkedInUrl,
  fetchWithTimeout,
  sleep,
  USER_AGENT,
  PIPELINE_PATH,
  SCAN_HISTORY_PATH,
} from './scan-core.mjs';

const PORTALS_PATH = 'portals.yml';
const SEARCH_ENDPOINT =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
// The guest endpoint returns 10 cards per request and `start` is a true item
// offset, not a page index. Verified 2026-08-03: start=20 and start=25 overlap
// by five items. Using any other stride silently skips results.
const RESULTS_PER_PAGE = 10;
const APPLICATIONS_PATHS = ['data/applications.md', 'data/applications-archive.md'];

mkdirSync('data', { recursive: true });

/**
 * Companies already in the tracker, lowercased.
 *
 * Used for one decision only: whether a title that names no archetype is still
 * worth queueing. Prior engagement is the evidence the title itself lacks.
 */
function loadEngagedCompanies() {
  const set = new Set();
  // Both tracker files: a company is engaged whether that history is still live
  // or already archived.
  for (const path of APPLICATIONS_PATHS) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (!line.startsWith('|')) continue;
      // Row shape is `| date | company | role | …`, so index 0 is the empty
      // string before the leading pipe and the company sits at 2.
      const company = (line.split('|')[2] || '').trim().toLowerCase();
      if (company && company !== 'company' && !/^-+$/.test(company)) set.add(company);
    }
  }
  return set;
}

// ── HTML helpers ────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'",
};

function decodeEntities(s) {
  return (s || '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, code) => {
      const key = code.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return full;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(html, ...patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return '';
}

// ── Card parsing ────────────────────────────────────────────────────

/**
 * The search endpoint returns a bare <li> list, one job card each. Fields are
 * stable but class names carry variant suffixes, so match loosely.
 */
function parseCards(html) {
  const cards = [];
  for (const chunk of html.split(/<li[\s>]/).slice(1)) {
    const jobId = (chunk.match(/urn:li:jobPosting:(\d+)/) || [])[1];
    if (!jobId) continue;

    const title = firstMatch(chunk,
      /base-search-card__title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/,
      /sr-only"[^>]*>\s*([\s\S]*?)\s*<\/span>/);

    const company = firstMatch(chunk,
      /hidden-nested-link"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
      /base-search-card__subtitle"[^>]*>\s*(?:<a[^>]*>)?\s*([\s\S]*?)\s*(?:<\/a>)?\s*<\/h4>/);

    const location = firstMatch(chunk,
      /job-search-card__location"[^>]*>\s*([\s\S]*?)\s*<\/span>/);

    const posted = (chunk.match(/datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1] || '';

    if (!title || !company) continue;
    cards.push({ jobId, title, company, location, posted });
  }
  return cards;
}

// ── Search ──────────────────────────────────────────────────────────

// LinkedIn throttles on a short rolling window per IP, not with a hard block:
// a 429 clears again within roughly a minute. So back off and continue rather
// than abandoning the run — but never retry immediately, which is what turns a
// soft throttle into a longer one.
const BACKOFF_MS = [45_000, 90_000, 180_000];

async function fetchSearchPage({ keywords, location, days, start, remote }, onBackoff) {
  const params = new URLSearchParams({
    keywords,
    location,
    f_TPR: `r${days * 86400}`,
    start: String(start),
  });
  // f_WT=2 is LinkedIn's "Remote" work-type facet.
  if (remote) params.set('f_WT', '2');
  const url = `${SEARCH_ENDPOINT}?${params}`;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 15_000,
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' },
      });
      return res.text();
    } catch (err) {
      if (err.status !== 429 || attempt >= BACKOFF_MS.length) throw err;
      const wait = BACKOFF_MS[attempt];
      onBackoff(attempt + 1, wait);
      await sleep(wait);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

function arg(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const li = config.linkedin;

  if (!li || li.enabled === false) {
    console.error('LinkedIn scanning is disabled. Set `linkedin.enabled: true` in portals.yml.');
    process.exit(1);
  }

  const pacing = li.pacing || {};
  const days = Number(arg(args, 'days', pacing.posted_within_days ?? 7));
  const maxPages = Number(arg(args, 'pages', pacing.max_pages_per_search ?? 3));
  const delayMs = Number(pacing.delay_ms ?? 2500);
  const jitterMs = Number(pacing.jitter_ms ?? 1500);

  // Safety valve: the location matrix can grow faster than the rate budget.
  const maxRequests = Number(arg(args, 'max-requests', pacing.max_requests ?? 220));
  const queryFilter = arg(args, 'query', null)?.toLowerCase();
  const locationFilterArg = arg(args, 'location', null)?.toLowerCase();

  const queries = (li.queries || []).filter(q => !queryFilter || q.toLowerCase().includes(queryFilter));
  const locations = (li.locations || []).filter(l => !locationFilterArg || l.toLowerCase().includes(locationFilterArg));
  const remoteLocations = (li.remote_locations || []).filter(l => !locationFilterArg || l.toLowerCase().includes(locationFilterArg));

  if (queries.length === 0 || locations.length === 0) {
    console.error('Nothing to scan — check `linkedin.queries` / `linkedin.locations` and any --query/--location filter.');
    process.exit(1);
  }

  // LinkedIn is an open firehose, not a curated board, so it takes a stricter
  // gate when one is configured. Falls back to the global filter otherwise.
  const classify = classifyTitle(li.title_filter || config.title_filter);
  const usingOwnFilter = Boolean(li.title_filter);
  const resolveTier = buildTierResolver(loadTierConfig());

  // A 'generic' title names no archetype, so judging it means reading the JD.
  // Keeping every one of them buried the inbox: 997 of 1774 pending rows on
  // 2026-08-12 were generic, and none had been read. Default is now to drop
  // them, except at a company already in the tracker, where a bare "Product
  // Manager" is still a lead. Set linkedin.keep_generic_titles: true to go
  // back to keeping all of them.
  const keepGeneric = li.keep_generic_titles === true;
  const engagedCompanies = loadEngagedCompanies();

  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  const pairs = [
    ...queries.flatMap(q => locations.map(l => ({ query: q, location: l, remote: false }))),
    ...queries.flatMap(q => remoteLocations.map(l => ({ query: q, location: l, remote: true }))),
  ];
  console.log(
    `LinkedIn scan — ${queries.length} queries x ` +
    `(${locations.length} locations + ${remoteLocations.length} remote) ` +
    `= ${pairs.length} searches, up to ${maxPages} pages each, posted within ${days}d`
  );
  console.log(`Pacing: ${delayMs}ms + up to ${jitterMs}ms jitter between requests`);
  console.log(`Title gate: ${usingOwnFilter ? 'linkedin.title_filter (strict)' : 'global title_filter'}`);
  if (dryRun) console.log('(dry run — no files will be written)');
  console.log('');

  const date = new Date().toISOString().slice(0, 10);
  let totalCards = 0;
  let titleRejected = 0;
  let titleGeneric = 0;
  let genericDropped = 0;
  let outOfTier = 0;
  let dupes = 0;
  let requests = 0;
  let backoffs = 0;
  const newOffers = [];
  const errors = [];
  let rateLimited = false;
  let capped = false;

  outer:
  for (const { query, location, remote } of pairs) {
    for (let page = 0; page < maxPages; page++) {
      if (requests >= maxRequests) {
        console.log(`\n  ⚠ Request cap reached (${maxRequests}). Stopping; everything collected is kept.`);
        capped = true;
        break outer;
      }
      if (requests > 0) await sleep(delayMs + Math.floor(Math.random() * jitterMs));

      let html;
      try {
        html = await fetchSearchPage(
          { keywords: query, location, days, start: page * RESULTS_PER_PAGE, remote },
          (attempt, wait) => {
            backoffs++;
            console.log(`  ⏸ Rate limited after ${requests} requests — backing off ${wait / 1000}s (retry ${attempt}/${BACKOFF_MS.length})`);
          }
        );
        requests++;
      } catch (err) {
        // Backoff already retried this. A 429 still standing means the window
        // is not recovering, so stop rather than dig in deeper.
        if (err.status === 429) {
          console.log(`\n  ⚠ Still rate limited after ${BACKOFF_MS.length} backoffs. Stopping.`);
          console.log('    Everything collected so far is kept, and dedup means a later re-run picks up where this left off.');
          console.log('    If this repeats, raise pacing.delay_ms or trim the query/location matrix.');
          rateLimited = true;
          break outer;
        }
        errors.push({ query, location: location + (remote ? ' [remote]' : ''), page, error: err.message });
        break;
      }

      const cards = parseCards(html);
      totalCards += cards.length;

      for (const card of cards) {
        // 'generic' means the title named no domain. Absence of a signal is not
        // a negative signal, but at LinkedIn's volume it is also not something
        // anyone reviews, so it is dropped unless kept on purpose.
        const verdict = classify(card.title);
        if (verdict === 'reject') { titleRejected++; continue; }
        if (verdict === 'generic') {
          const engaged = engagedCompanies.has(card.company.toLowerCase().trim());
          if (!keepGeneric && !engaged) { genericDropped++; continue; }
          titleGeneric++;
        }

        const loc = resolveTier(card.location);
        if (!loc.keep) { outOfTier++; continue; }

        const url = canonicalLinkedInUrl(card.jobId);
        if (isSeen(seenUrls, url, card.company, card.title, seenCompanyRoles)) { dupes++; continue; }
        markSeen(seenUrls, seenCompanyRoles, url, card.company, card.title);

        newOffers.push({
          url,
          title: card.title,
          company: card.company,
          location: card.location,
          posted: card.posted,
          tier: loc.tier,
          titleGeneric: verdict === 'generic',
          source: 'linkedin-guest',
        });
      }

      process.stdout.write(
        `  ${query} / ${location}${remote ? ' [remote]' : ''} — page ${page + 1}: ${cards.length} cards, ${newOffers.length} new so far\n`
      );

      // A short page is the last page. Stop rather than paging into emptiness.
      if (cards.length < RESULTS_PER_PAGE) break;
    }
  }

  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  const byTier = newOffers.reduce((acc, o) => {
    const k = o.tier || '?';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`LinkedIn Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Requests made:         ${requests}${rateLimited ? ' (stopped early — rate limited)' : capped ? ' (stopped early — request cap)' : ''}`);
  if (backoffs > 0) console.log(`Rate-limit backoffs:   ${backoffs}`);
  console.log(`Cards seen:            ${totalCards}`);
  console.log(`Rejected by title:     ${titleRejected}`);
  console.log(`Generic titles kept:   ${titleGeneric} (flagged for triage)`);
  console.log(`Generic titles dropped: ${genericDropped}${keepGeneric ? ' (keep_generic_titles is on)' : ' — no lane in the title, company not in the tracker'}`);
  console.log(`Out of tier (dropped): ${outOfTier}`);
  console.log(`Duplicates:            ${dupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (newOffers.length > 0) {
    const summary = ['S', 'A', 'B', 'C', '?']
      .filter(t => byTier[t])
      .map(t => `${t}:${byTier[t]}`)
      .join('  ');
    console.log(`By location tier:      ${summary}   (? = unqualified remote)`);

    console.log('\nNew offers:');
    for (const o of [...newOffers].sort((a, b) => (a.tier || 'Z').localeCompare(b.tier || 'Z'))) {
      console.log(`  + [${o.tier || '?'}] ${o.company} | ${o.title} | ${o.location} | ${o.posted}`);
    }
    console.log(dryRun
      ? '\n(dry run — run without --dry-run to save results)'
      : `\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.query} / ${e.location} p${e.page}: ${e.error}`);
  }

  console.log('\n→ Run /job-hunt pipeline to evaluate new offers.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
