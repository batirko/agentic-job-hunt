# Mode: scan — Portal Scanner (Job Discovery)

Scans configured job portals, filters by title relevance, and adds new offers to the pipeline for later evaluation.

## Recommended Execution

Execute as a subagent to avoid consuming the main agent's context:

```
Task(
    subagent_type="general",
    description="Portal scan for [date]",
    prompt="[content of this file + specific data]"
)
```

## Zero-Token Scanners (RUN THESE FIRST)

Two scripts cover discovery at zero LLM cost. Run both before falling back to any agent-driven browsing below — everything they return is already filtered, tiered and deduplicated.

```bash
node scan.mjs && node scan-linkedin.mjs
```

| Script | Source | Notes |
|--------|--------|-------|
| `scan.mjs` | Greenhouse / Ashby / Lever APIs for every company in `tracked_companies` | Concurrent, fast, real-time |
| `scan-linkedin.mjs` | LinkedIn's public logged-out job endpoints | No account, no browser. Sequential and paced |

Both write to `data/pipeline.md` + `data/scan-history.tsv` and share dedup logic in `scan-core.mjs`.

**Useful flags:** `--dry-run` on either. `scan.mjs --company X`. `scan-linkedin.mjs --days 30 --pages 5` to backfill, `--query` / `--location` to narrow.

### LinkedIn specifics

`scan-linkedin.mjs` hits `/jobs-guest/jobs/api/seeMoreJobPostings/search` and gets back title, company, location, exact posting date and job ID — no login and no browser. Because nothing is authenticated, a bad run costs a rate-limit at worst, never the account.

- It is a **delta scan**. Narrow with `--days`, do not crawl deep pagination.
- Requests are sequential with jittered pacing from `linkedin.pacing` in `portals.yml`.
- **Rate limits are real but soft.** LinkedIn throttles per IP on a short rolling window (measured: roughly 70-100 requests before a 429, recovering in about a minute). The scanner backs off automatically at 45s / 90s / 180s and continues, so a full run may pause once or twice. It only stops if the window refuses to recover, and it keeps everything collected. The budget is cumulative per IP, so back-to-back runs share it.
- Dedup keys on the numeric **job ID**, because LinkedIn serves one posting under many URLs (country subdomains, slugged paths, tracking params).
- The guest endpoint returns **10 cards per request** and `start` is a true item offset, not a page index. Do not change the stride.
- LinkedIn gets its own **stricter title gate** (`linkedin.title_filter` in `portals.yml`). A bare "Product Manager" keyword is fine for the 86 curated boards but matches every PM job in Europe here, so on LinkedIn the title must carry an archetype signal.
- **Titles get three outcomes, not two.** `pass` names a target domain, `reject` is not a product role or carries a disqualifying keyword, and `generic` is a product role whose title names nothing. Generic titles are **kept and flagged**, never dropped — a bare "Senior Product Manager" is the absence of a signal, not a negative one. A 2026-08-03 coverage audit found nine relevant postings discarded purely for uninformative titles.
- **Search one country at a time, not one region.** "European Union" is a single search covering 27 member states, so a few pages of it samples the EU rather than sweeping it. That is why Rotterdam, Porto, Amsterdam, Stockholm, Lisbon and Bulgaria roles were invisible while Germany and Austria came through: those two had dedicated searches. `linkedin.locations` now lists countries individually, with "European Union" last as a residual catch-all.
- `pacing.max_requests` (or `--max-requests`) caps a run, because the location matrix can grow faster than the rate budget.

### Location tiers

Locations are tiered, not allow/blocked. The source of truth is `config/profile.yml` → `location.tiers`.

Both scanners keep every posting that resolves to **any** tier (S/A/B/C) and drop only untiered ones (US, APAC, anchored non-European cities). Bare "Remote" with no stated region is kept and flagged `?` for a human look. The tier appears in the scan summary and in each pipeline line, so a low-tier role is visible rather than silently discarded.

Note that US "remote" postings are almost always remote **within** the US and need work authorization he does not hold. A full board scan on 2026-08-03 found GitLab, Render and Cribl all scoped that way. What is reachable is remote work employable in Europe, which is what `linkedin.remote_locations` searches for.

## Triage buckets

`triage.mjs` sorts the inbox into a reading order, not a decision:

| | Meaning |
|---|---|
| 🟢 | Archetype match, senior, workable location, named employer — worth a full evaluation |
| 🟡 | Real signal but something is unresolved (agency listing, tier C, below-senior title) |
| 🔵 | Title names no domain. No evidence either way; needs the JD to judge |
| 🔴 | Clear reason to drop, already in the tracker, or on the exclusion list |

A generic title at a company on the curated `tracked_companies` list still earns a real verdict rather than 🔵, since the company itself is evidence.

**Tier is desirability, never work authorization.** Do not infer visa difficulty from a tier when evaluating.

## Configuration

Read `portals.yml` which contains:
- `tracked_companies`: Specific companies with `careers_url` / `api` for direct scanning.
- `title_filter`: `role_gate` + positive/negative keywords for title filtering.
- `linkedin`: queries, locations and pacing for `scan-linkedin.mjs`.

Location tiers live in `config/profile.yml`, not here.

**Note:** `search_queries` and `location_filter` were removed from `portals.yml`. Ignore any reference to them below — the Level 3 WebSearch section is legacy and applies only when the two scripts above have already run.

## Discovery Strategy (3 Levels)

### Level 1 — Direct Playwright (PRIMARY)

**For each company in `tracked_companies`**: Navigate to its `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, and extract title + URL for each. This is the most reliable method because:
- It sees the page in real-time (not cached Google results).
- It works with SPAs (Ashby, Lever, Workday).
- It detects new offers instantly.
- It does not depend on Google indexing.

**Every company SHOULD have a `careers_url` in `portals.yml`.** If it doesn't, search for it once, save it, and use it in future scans.

### Level 2 — ATS APIs / Feeds (COMPLEMENTARY)

For companies with a public API or structured feed, use the JSON/XML response as a fast Level 1 complement. It's faster than Playwright and reduces visual scraping errors.

**Current support (variables in `{}`):**
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR**: list `https://{company}.bamboohr.com/careers/list`; job detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever**: `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor**: `https://{company}.teamtailor.com/jobs.rss`
- **Workday**: `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Parsing convention by provider:**
- `greenhouse`: `jobs[]` → `title`, `absolute_url`
- `ashby`: GraphQL `ApiJobBoardWithTeams` with `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`; construct public URL if not provided)
- `bamboohr`: list `result[]` → `jobOpeningName`, `id`; construct detail URL `https://{company}.bamboohr.com/careers/{id}/detail`; to read full JD, GET detail and use `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`).
- `lever`: root array `[]` → `text`, `hostedUrl` (fallback: `applyUrl`)
- `teamtailor`: RSS items → `title`, `link`
- `workday`: `jobPostings[]`/`jobPostings` (depending on tenant) → `title`, `externalPath` or constructed URL from host.

### Level 3 — WebSearch queries (BROAD DISCOVERY)

`search_queries` with `site:` filters cover portals transversally (all Ashby, all Greenhouse, etc.). Useful for discovering NEW companies not yet in `tracked_companies`, but results may be outdated.

**Execution priority:**
1. Level 1: Playwright → all `tracked_companies` with `careers_url`.
2. Level 2: API → all `tracked_companies` with `api:`.
3. Level 3: WebSearch → all `search_queries` with `enabled: true`.

Levels are additive — all are executed, results are mixed and deduplicated.

## Workflow

1. **Read configuration**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` → already seen URLs.
3. **Read dedup sources**: `data/applications.md` + `data/applications-archive.md` + `data/pipeline.md`. Both tracker files, always — a role skipped or rejected months ago sits in the archive, and deduping against the live file alone re-queues it as a fresh lead.

4. **Level 1 — Playwright scan** (parallel in batches of 3-5):
   For each company in `tracked_companies` with `enabled: true` and defined `careers_url`:
   a. `browser_navigate` to `careers_url`.
   b. `browser_snapshot` to read all job listings.
   c. If the page has filters/departments, navigate relevant sections.
   d. For each job listing extract: `{title, url, company}`.
   e. If results are paginated, navigate additional pages.
   f. Accumulate in candidate list.
   g. If `careers_url` fails (404, redirect), try `scan_query` as fallback and note to update the URL.

5. **Level 2 — ATS APIs / feeds** (parallel):
   For each company in `tracked_companies` with defined `api:` and `enabled: true`:
   a. WebFetch the API/feed URL.
   b. If `api_provider` is defined, use its parser; otherwise, infer by domain (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`).
   c. For **Ashby**, send POST with:
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - GraphQL query for `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`.
   d. For **BambooHR**, the list only contains basic metadata. For each relevant item, read `id`, GET `https://{company}.bamboohr.com/careers/{id}/detail`, and extract full JD from `result.jobOpening`. Use `jobOpeningShareUrl` as public URL if provided; otherwise, use the detail URL.
   e. For **Workday**, send JSON POST with at least `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` and paginate via `offset` until results are exhausted.
   f. For each job, extract and normalize: `{title, url, company}`.
   g. Accumulate in candidate list (dedup with Level 1).

6. **Level 3 — WebSearch queries** (parallel if possible):
   For each query in `search_queries` with `enabled: true`:
   a. Execute WebSearch with the defined `query`.
   b. For each result extract: `{title, url, company}`.
      - **title**: from result title (before " @ " or " | ").
      - **url**: result URL.
      - **company**: after " @ " in title, or extract from domain/path.
   c. Accumulate in candidate list (dedup with Level 1+2).

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 `positive` keyword must appear in the title (case-insensitive).
   - 0 `negative` keywords must appear.
   - `seniority_boost` keywords give priority but are not mandatory.

7. **Deduplicate** against 3 sources:
   - `scan-history.tsv` → exact URL already seen.
   - `applications.md` + `applications-archive.md` → normalized company + role already evaluated. The scanners read both.
   - `pipeline.md` → exact URL already in pending or processed.

7.5. **Verify liveness of WebSearch results (Level 3)** — BEFORE adding to pipeline:

   WebSearch results may be outdated (Google caches results for weeks or months). To avoid evaluating expired offers, verify every new Level 3 URL with Playwright. Levels 1 and 2 are inherently real-time and do not require this verification.

   For each new Level 3 URL (sequential — NEVER parallel Playwright):
   a. `browser_navigate` to the URL.
   b. `browser_snapshot` to read content.
   c. Classify:
      - **Active**: visible job title + role description + visible Apply/Submit button within main content. Do not count generic header/navbar/footer text.
      - **Expired** (any of these signals):
        - Final URL contains `?error=true` (Greenhouse redirects this way when the offer is closed).
        - Page contains: "job no longer available" / "no longer open" / "position has been filled" / "this job has expired" / "page not found".
        - Only navbar and footer visible, no JD content (content < ~300 chars).
   d. If expired: register in `scan-history.tsv` with `skipped_expired` status and discard.
   e. If active: continue to step 8.

   **Do not interrupt the entire scan if one URL fails.** If `browser_navigate` errors (timeout, 403, etc.), mark as `skipped_expired` and continue to the next one.

8. **For each verified new offer that passes filters**:
   a. Add to `pipeline.md` "Pending" section: `- [ ] {url} | {company} | {title}`.
   b. Register in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`.

9. **Offers filtered by title**: register in `scan-history.tsv` with `skipped_title` status.
10. **Duplicate offers**: register with `skipped_dup` status.
11. **Expired offers (Level 3)**: register with `skipped_expired` status.

## Extracting Title and Company from WebSearch results

WebSearch results come in formats like: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns by portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`.
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`.
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`.

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private URLs

If a non-publicly accessible URL is found:
1. Save the JD in `jds/{company}-{role-slug}.md`.
2. Add to `pipeline.md` as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`.

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Output Summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executed: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
Expired discarded: N (dead links, Level 3)
New added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /job-hunt-pipeline to evaluate the new offers.
```

## Management of careers_url

Each company in `tracked_companies` should have a `careers_url` — the direct URL to its job listings page. This avoids searching for it every time.

**Known patterns by platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **BambooHR:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor:** `https://{company}.teamtailor.com/jobs`
- **Workday:** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom:** The company's own URL (e.g.: `https://openai.com/careers`)

**API/feed patterns by platform:**
- **Ashby API:** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API:** list `https://{company}.bamboohr.com/careers/list`; detail `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API:** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS:** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API:** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**If `careers_url` does not exist** for a company:
1. Try the pattern for its known platform.
2. If it fails, do a quick WebSearch: `"{company}" careers jobs`.
3. Navigate with Playwright to confirm it works.
4. **Save the found URL in `portals.yml`** for future scans.

**If `careers_url` returns a 404 or redirect:**
1. Note it in the output summary.
2. Try `scan_query` as a fallback.
3. Mark for manual update.

## Maintenance of portals.yml

- **ALWAYS save `careers_url`** when adding a new company.
- Add new queries as interesting portals or roles are discovered.
- Deactivate queries with `enabled: false` if they generate too much noise.
- Adjust filtering keywords as target roles evolve.
- Add companies to `tracked_companies` when you want to follow them closely.
- Periodically verify `careers_url` — companies change ATS platforms.
