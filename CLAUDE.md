# agentic-job-hunt -- AI Job Search Pipeline

## Origin

**agentic-job-hunt** is an opinionated fork of
[agentic-job-hunt](https://github.com/santifer/career-ops) by
[santifer](https://santifer.io), rebuilt over roughly 350 real applications and
270 evaluations.

What this fork changed:

- **The tracker is two files.** Open rows stay readable; closed rows move to an
  archive that analysis and dedup still read.
- **A triage layer** sits between the scan inbox and full evaluation, so a role
  can be dismissed for the cost of reading its title.
- **Outcomes are recorded separately from statuses**, because a rejection at the
  CV screen and a rejection after four rounds are not the same event. That file
  is what makes the apply gate calibratable instead of a guess.
- **Effort lanes** replace a single apply/skip decision.
- **Location is tiered, not penalised**, and kept strictly separate from work
  authorization.
- **An interview method**: a seniority playbook, three distinct prep-doc types,
  and a debrief protocol that grades delivery and harvests intel from
  transcripts.

**It is built to be made yours.** The archetypes, scoring weights, deal-breakers
and proof points are all placeholders. Ask the agent to change any of it, and
read `docs/SETUP.md` first.

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**

- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**System Layer (auto-updatable, DON'T put user data here):**

- `modes/_shared.md`, `modes/oferta.md`, all other modes
- `CLAUDE.md`, `*.mjs` scripts, `dashboard/*`, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.** This ensures system updates don't overwrite their customizations.

## What is agentic-job-hunt

AI-powered job search automation built on Claude Code: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

### Main Files

| File                                 | Function                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/applications.md`               | Application tracker — OPEN rows only (see §"The tracker is two files")                                                                             |
| `data/applications-archive.md`       | Application tracker — CLOSED rows (`⏭️` `❌` `🚫` `👻`). Same 12 columns. Read together with the live file by every analysis and every dedup         |
| `archive-tracker.mjs`                | Moves closed rows from the live tracker to the archive. Dry run by default, `--apply` writes                                                        |
| `data/pipeline.md`                   | Inbox of pending URLs                                                                                                                               |
| `data/scan-history.tsv`              | Scanner dedup history                                                                                                                               |
| `portals.yml`                        | Query and company config                                                                                                                            |
| `templates/cv-template.html`         | HTML template for CVs                                                                                                                               |
| `templates/cv-template.tex`          | LaTeX/Overleaf template for CVs                                                                                                                     |
| `generate-pdf.mjs`                   | Playwright: HTML to PDF                                                                                                                             |
| `generate-latex.mjs`                 | LaTeX CV validator + pdflatex compiler                                                                                                              |
| `article-digest.md`                  | Compact proof points from portfolio (optional)                                                                                                      |
| `interview-prep/seniority-playbook.md` | **Required reading before any interview work.** Cross-company reference: probe mechanics, interviewer role map, context lens, objection counters, story-to-probe map, and the canonical six-beat answer (§13) |
| `interview-prep/interview-feedback-log.md` | Every call graded A-F across seven dimensions, plus the two standing rules for transcripts. The record four rejections were diagnosed from      |
| `interview-prep/story-bank.md`       | Accumulated STAR+R stories across evaluations                                                                                                       |
| `interview-prep/rejected-option-excavation.md` | Pre-work: the decision and its rejected alternative for each lead story                                                                   |
| `interview-prep/voice-drill-briefing.md` | Out-loud timed drill setup. Recommend this over another prep doc                                                                                |
| `interview-prep/{company}-{role}.md` | Company-specific prep docs (three types, see `modes/interview-prep.md`)                                                                            |
| `analyze-patterns.mjs`               | Pattern analysis script (JSON output)                                                                                                               |
| `analyze-scoring.mjs`                | Scoring calibration — does a pre-apply score predict a real conversation? Joins the applied cohort against `data/outcomes.tsv`                      |
| `data/outcomes.tsv`                  | One row per application that produced a human response: first-contact date, stages passed, furthest stage, outcome, stated reason                    |
| `followup-cadence.mjs`               | Follow-up cadence calculator (JSON output)                                                                                                          |
| `data/follow-ups.md`                 | Follow-up history tracker                                                                                                                           |
| `scan.mjs`                           | Zero-token portal scanner — hits Greenhouse/Ashby/Lever/Comeet/Workable APIs directly, zero LLM cost                                                |
| `scan-linkedin.mjs`                  | Zero-token LinkedIn scanner — public logged-out job endpoints, no account, no browser                                                              |
| `scan-core.mjs`                      | Shared scanner logic: location tier resolver, dedup, pipeline/history writers                                                                       |
| `triage.mjs`                         | Cheap screening pass over the inbox → `data/triage.md` (🟢/🟡/🔴 reading order, zero tokens). `--drain` clears what will never be read              |
| `data/triage.md`                     | Review table between the inbox and the tracker; user promotes rows from here                                                                        |
| `data/excluded.md`                   | Reviewed-and-declined roles; `triage.mjs` blocks these from resurfacing. NOT the tracker — no scores, so pattern analysis stays clean               |
| `check-liveness.mjs`                 | Job posting liveness checker                                                                                                                        |
| `liveness-core.mjs`                  | Shared liveness logic (expired signals win over generic Apply text)                                                                                 |
| `reports/`                           | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy). Header includes `**Legitimacy:** {tier}`. |

### OpenCode Commands

`.opencode/commands/` mirrors every mode as a flat slash command: `/job-hunt-{mode}`
is the same as `/job-hunt {mode}` in Claude Code. Both invoke
`.claude/skills/job-hunt/SKILL.md` and share the `modes/*` files, so there is
nothing platform-specific to keep in sync.

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**

- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_profile.md` or `config/profile.yml`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting, or edit `modes/_shared.md` and `batch/batch-prompt.md` only when changing the shared system defaults for everyone

### Skill Modes

| If the user...                                              | Mode                                              |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Pastes JD or URL                                            | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer                                      | `oferta`                                          |
| Asks to compare offers                                      | `ofertas`                                         |
| Wants LinkedIn outreach                                     | `contacto`                                        |
| Asks for company research                                   | `deep`                                            |
| Preps for interview at specific company                     | `interview-prep`                                  |
| Shares an interview transcript, recording, or company feedback | `interview-debrief`                            |
| Wants to generate CV/PDF                                    | `pdf`                                             |
| Evaluates a course/cert                                     | `training`                                        |
| Evaluates portfolio project                                 | `project`                                         |
| Asks about application status                               | `tracker`                                         |
| Fills out application form                                  | `apply`                                           |
| Searches for new offers                                     | `scan`                                            |
| Processes pending URLs                                      | `pipeline`                                        |
| Batch processes offers                                      | `batch`                                           |
| Asks about rejection patterns or wants to improve targeting | `patterns`                                        |
| Asks about follow-ups or application cadence                | `followup`                                        |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but always STOP before clicking Submit/Send/Apply. The user makes the final call.
- **Strongly discourage low-fit applications.** Below the apply gate, explicitly recommend against applying, and never produce a CV without asking first. The user's time and the recruiter's time are both valuable. Only proceed if the user has a specific reason to override the score. The gate defaults to 4.0/5; when `modes/_profile.md` sets its own gate and effort lanes from measured outcomes (`node analyze-scoring.mjs`), the profile wins.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Location Tiers -- CRITICAL

Locations are **tiered, not penalized**. The tier values, the resolution
precedence and the out-of-scope rule are all defined in `config/profile.yml` →
`location.tiers`, with the reasoning in the comments there. `scan-core.mjs`
resolves the same table for the scanners. Read it there and never hardcode a
tier value anywhere else, including in prose.

**Tier is desirability, NOT work authorization.** These are separate axes and collapsing them corrupts both scores:

- Tier answers "do I want to be there" → Opportunity.
- Work authorization answers "can they actually hire me" → Odds.

A tier-A country can still need a visa, and a low tier never implies one. Read `location.work_authorization` in profile.yml and assess sponsorship **per posting**, not by blanket rule.

---

## Offer Verification -- MANDATORY

**A posting is only "confirmed live" when a real browser has rendered it.** WebSearch/WebFetch return page markdown and can surface signals (applicant counts, dates) but do NOT drive a browser, so on their own they count as **unconfirmed** — never mark an offer verified from WebFetch alone.

**Verdict rule:** Title + description + an active Apply control = active. Only footer/navbar/"no longer accepting applications" (without the JD body) = closed/expired.

### Tool ladder (use the first one available, in this order)

1. **Built-in Claude browser (PREFERRED — most capable and efficient here).** Tools: `mcp__Claude_Browser__*`.
   - Open a fresh tab so any CV previews stay put: `tabs_create` → note the returned `tabId` (or reuse an existing non-preview tab from `tabs_context`).
   - `navigate` with that `tabId` to the URL, then `get_page_text` (or `read_page` for an a11y tree with clickable refs).
   - **Tested and confirmed:** this renders LinkedIn *public* job pages with NO login wall — you get title, "posted N hours/days ago", applicant count, the Apply button, and the full JD. Works on Ashby/Greenhouse/Lever/dou.ua too.
2. **chrome-devtools MCP (second choice).** Tools: `mcp__chrome-devtools__*`. `new_page` (or `navigate_page`) → `take_snapshot` for a full a11y tree with the Apply control as a real uid + posting date. Verified working on dou.ua and LinkedIn.
3. **WebFetch (fallback only).** Static pages or when both browsers are unavailable. Mark the report header `**Verification:** unconfirmed (WebFetch)`.

**Deferred-tool note:** the browser tools may be deferred — load their schemas first via `ToolSearch` (e.g. `select:mcp__Claude_Browser__navigate,mcp__Claude_Browser__get_page_text` or the chrome-devtools equivalents) before calling them.

**Never run 2+ browser-driving agents in parallel** (single shared browser). Batch-worker JD extraction can still fan out with WebFetch.

**Exception for batch workers (`claude -p`):** no interactive browser in headless pipe mode. Use WebFetch and mark the report header `**Verification:** unconfirmed (batch mode)`. The user (or a later pass) can browser-verify.

---

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data), Canva MCP (optional visual CV)
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each batch of evaluations, run `node merge-tracker.mjs`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists** -- in EITHER tracker file. Update the existing entry. `merge-tracker.mjs` checks both and reports an archived match instead of opening a second row.

### TSV Format for Tracker Additions

Write one TSV file per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`. Single line, 13 tab-separated columns:

```
{num}\t{date}\t{company}\t{role}\t{fit}/5\t{odds}/5\t{priority}/5\t{status}\t{output}\t[{num}](../reports/{num}-{slug}-{date}.md)\t{location}\t{note}\t{url}
```

**Column order (IMPORTANT):**

1. `num` -- report number (integer, 3-digit zero-padded)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `fit` -- format `X.X/5` (e.g., `3.8/5`) — "Do I qualify?"
6. `odds` -- format `X.X/5` (e.g., `3.2/5`) — "Will they pick me?"
7. `priority` -- format `X.X/5` (e.g., `4.2/5`) — "Should I focus here?"
8. `status` -- emoji (e.g., `✅`) or blank for evaluated/pending. **Never a text label** -- "Evaluated" IS the blank value
9. `output` -- `[📁](../output/slug)` or `-`
10. `report` -- markdown link `[num](../reports/...)` -- the `../` is required because applications.md lives in `data/`
11. `location` -- role location (e.g., `Berlin, Germany`)
12. `notes` -- one-line summary
13. `url` -- original offer URL

**Note:** merge-tracker.mjs also accepts legacy 9-col TSVs for backward compat, normalizes text status labels and aliases to their canonical emoji (blank for evaluated), and rewrites a bare `](reports/...)` prefix to `](../reports/...)` on write.

### The tracker is two files

The record is split by whether a row can still change:

| File | Holds | Statuses |
| ---- | ----- | -------- |
| `data/applications.md` | Open — what to do next | _(blank)_, `🎯` `📬` `💰`, `✅` |
| `data/applications-archive.md` | Closed — what already happened | `⏭️`, `❌`, `🚫`, `👻` |

Identical 12-column schema, identical rules. The reason for the split is the reading cost: the apply queue is a handful of rows, and a few hundred closed ones on top of it make the file useless for the one question it exists to answer.

**The split is for reading, not for forgetting.** The archive holds the rejections and the silences, which is the entire input to `analyze-scoring.mjs` and most of `analyze-patterns.mjs`. So:

- **Anything that ANALYSES the record reads both.** `parseTrackerAll()` in `tracker-core.mjs` is the loader; `analyze-patterns.mjs`, `analyze-scoring.mjs` and `verify-pipeline.mjs` use it. Never answer a question about the funnel, the score calibration or the history from the live file alone.
- **Anything that DEDUPS against the record checks both.** `triage.mjs`, `scan.mjs`, `scan-linkedin.mjs` and `merge-tracker.mjs` do. A role skipped or rejected months ago must never come back as a fresh lead.
- **Anything that WRITES the open queue touches the live file only.** `retire-stale.mjs` and `followup-cadence.mjs` are live-only by design: a status can only change on an open row, and a follow-up is only worth sending on an open application.

**Moving rows between the files:**

```bash
node archive-tracker.mjs
```

Dry run by default; `--apply` writes both files and re-sorts them. **Never cut and paste rows between the files by hand** — the same rule as `retire-stale.mjs`, for the same reason.

**Re-opening an archived row** is the one direction with no script. Move the line back to `data/applications.md` by hand and set its status. `merge-tracker.mjs` deliberately will not do it: a company reposting a role it once rejected you for is a judgment call, so it reports the archived match and stops.

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF). Include `**Legitimacy:** {tier}` (see Block G in `modes/oferta.md`).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `node verify-pipeline.mjs` (covers both tracker files)
6. Normalize statuses: `node normalize-statuses.mjs` (both files)
7. Dedup: `node dedup-tracker.mjs` (both files, one at a time — a duplicate spanning the two is a merge bug, and `verify-pipeline.mjs` reports it)
8. **Report numbers are NOT unique keys.** Concurrent sessions have handed the same number to different companies (26 covers three rows, 48 covers three more). Never join on the report number alone — key on company plus the Date column.

### Recording Outcomes (`data/outcomes.tsv`)

**Whenever a company makes contact, add or update a row in `data/outcomes.tsv`.** This is the input to `analyze-scoring.mjs`, and it is the only place the depth of a conversation is recorded — the tracker status collapses "rejected at the CV screen" and "rejected after four rounds" into the same `❌`.

- One row per application that produced a **real human response**: recruiter screen, HR call, interview, direct invite. An automated rejection is not a response and does not belong here.
- **Absence is the signal.** Every applied row with no outcome row counts as "no contact". Never add placeholder rows for silence.
- Keyed on `company` + `date`, where `date` is the tracker's Date column (the evaluation date), not the applied date.
- `stages_passed` counts stages COMPLETED; `furthest_stage` is an id from the `stages:` ladder in `templates/states.yml`. Record both — a 2-stage loop at one company is a 5-stage loop at another.
- Also update the tracker row's status as usual. The two files answer different questions and both need to stay current.

### Draining the Inbox (`triage.mjs --drain`)

`data/pipeline.md` is a queue, and a queue nobody empties stops being one. Two triage verdicts will never earn a human read:

- `🔴` already in the tracker, or no archetype signal in title or company.
- `🔵` the title names no domain, so judging it means opening the JD.

```bash
node triage.mjs --drain
```

Dry run by default; `--apply` writes. Drained rows leave `data/pipeline.md` and land in `data/scan-history.tsv` with status `drained`, which is what the scanners dedup against, so nothing re-queues itself.

**Not the same file as `data/excluded.md`.** That one means a human reviewed the role and said no. A drained row was never reviewed. Keep the distinction or the exclusion list stops meaning anything.

**Two deliberate carve-outs.** A `🔵` at a company already in `data/applications.md` survives: prior engagement is the evidence the title lacks. And a role advertised in several countries drains only when every one of its rows is drainable, so an alternate location can never vanish out from under a row that stays.

**Stopping the refill.** `linkedin.keep_generic_titles` in `portals.yml` controls whether the LinkedIn sweep queues generic titles at all. Default `false`, same carve-out for tracker companies. Set it `true` to go back to keeping every one.

### Posting Freshness (`Posted YYYY-MM-DD`)

The scanners read the posting's publication date from the Greenhouse / Ashby / Lever / Comeet / Workable / LinkedIn payloads and write it into `data/pipeline.md`. (The board lane only started doing this on 2026-08-12; rows queued before that carry no date and fall to the bottom of their lane.) **When a role is promoted to the tracker, carry that date into the notes column as `Posted YYYY-MM-DD`** (same convention as `Applied YYYY-MM-DD`, no schema change). `sort-tracker.mjs` ranks the unapplied queue on it, so a dropped date means the role sinks to the bottom of its lane.

### Status Emojis (applications.md)

**Source of truth:** `templates/states.yml` — **status column uses emojis only, never text labels.**

| Emoji     | Meaning                                                     |
| --------- | ----------------------------------------------------------- |
| _(blank)_ | Evaluated — report done or assessed, pending apply decision |
| `✅`       | Applied — application sent                                  |
| `📬`      | Responded — company responded, not yet interview            |
| `🎯`      | Interview — active interview process                        |
| `💰`      | Offer received                                              |
| `❌`       | Rejected by company                                         |
| `🚫`      | Discarded — candidate withdrew or position closed           |
| `👻`      | Ignored — applied, never got a response, retired            |
| `⏭️`      | SKIP — doesn't fit, don't apply                             |

**RULES:**

- Status field contains an emoji or is blank. No text labels (not "Evaluated", not "Applied", etc.)
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes/reasoning column)

### Retiring Silent Applications

`✅` applied rows that never got a response go to `👻` once they pass the follow-up window (default 14 days). They are neither rejected (nobody said no) nor discarded (the candidate didn't withdraw), and leaving them as `✅` makes the top of the tracker useless for deciding what to chase.

**RULE: never bulk-edit these by hand.** Run the sweep:

```bash
node retire-stale.mjs
```

Dry run by default; `--apply` writes and re-sorts; `--days N` overrides the window. Age is measured from the `Applied YYYY-MM-DD` date in the notes when present, falling back to the Date column. Those are different dates: Date is when the offer was evaluated, not when it was sent.

### Sort Order (both tracker files)

**Group order:** _(blank)_ › 🎯/📬/💰 › ✅ › ⏭️ › ❌/🚫 › 👻

One group order across both files. The live tracker only ever holds the first three groups and the archive only the last three, so a row keeps its relative position when it moves between them. `node sort-tracker.mjs` sorts both.

`🎯`, `📬` and `💰` share one group (any live conversation with the company). `❌` and `🚫` share one group. `👻` is its own group at the very bottom.

**Within each group:**

- _(blank)_ — **effort lane, then posting freshness** (`Posted YYYY-MM-DD` desc), tie-break by priority desc, date desc, odds desc. Freshness applies to the two apply lanes only; the below-3.5 lane ranks on priority desc
- 🎯/📬/💰 and ✅ — **date desc**, tie-break by priority desc
- ⏭️, ❌, 🚫, 👻 — **priority desc**, tie-break by date desc then odds desc

The three rules answer different questions. The unapplied group is the apply queue: the lane (4.0+ full effort, 3.5–3.9 light, below 3.5 blocked) decides how much work a role gets, and inside a lane priority carries no measured signal, so the freshest posting leads. Rows with no recorded posting date fall back to priority and sit at the bottom of their lane. Freshness stops at the gate: the below-3.5 lane sends no applications, so a fresher posting there is worth nothing and only lifts recommend-against rows over better-scored ones — that lane ranks on priority. Better still, below-gate rows do not belong in the apply queue at all; mark them `⏭️` once the call is made. The date groups are chase queues — the apply decision is already made, so what leads is what went out most recently. The closed groups are review queues, ranked by score.

**The date for the chase groups is the date the application was SENT** — the `Applied YYYY-MM-DD` note, falling back to the Date column. The Date column is the *evaluation* date and routinely runs weeks earlier, so sorting the applied group on it buries the most recent sends. Same rule `retire-stale.mjs` measures its window with.

Ties resolve down to original file position, so re-running `node sort-tracker.mjs` on a sorted tracker moves nothing and produces no diff.

**Keep the table unpadded.** Rows are written `| a | b | c |`, one space either side of each value, never padded out to align the columns. Alignment padding is invisible and costs nothing to look at, but it inflated this file to 1.6 MB against 180 KB of actual content — roughly 400K tokens of whitespace that every session reading the tracker had to pay for. `merge-tracker.mjs` and `sort-tracker.mjs` already write unpadded rows; if an editor reformats the table, undo it.
