# agentic-job-hunt

A job search pipeline you run through a coding agent: offer evaluation, tailored CVs, portal scanning, and an application tracker. These instructions apply to any agent (Claude Code, Codex, OpenCode, and others); `CLAUDE.md` only imports this file.

Forked from [career-ops](https://github.com/santifer/career-ops) by [santifer](https://santifer.io). `README.md` explains what changed. Read `docs/SETUP.md` before customizing.

`modes/_router.md` is the one routing table: it maps a request to a mode file in `modes/` and says which files to load. Claude Code reaches it through the `/job-hunt` skill; other agents read it directly. Script usage is in `docs/SCRIPTS.md`, and each script's header explains its rules.

## Data Contract

Your files and the system's files are kept apart, so you can pull upstream changes without losing your work. Full list of both layers: `DATA_CONTRACT.md`.

- Personal content goes in `modes/_profile.md` or `config/profile.yml`. That covers archetypes, narrative, comp, proof points, negotiation scripts, scoring weights, and location policy. Never put it in `modes/_shared.md` or other system files, because an upstream pull overwrites them.
- Your own standing rules for the agent go in the Working Preferences section of `modes/_profile.md`, not in this file. `AGENTS.md` and `CLAUDE.md` are system files too.
- `cv.md` is the canonical CV. Read metrics from `cv.md` and `article-digest.md` at evaluation time, never hardcode them.

When the user asks to change archetypes, scoring, portals, or the CV template, edit the files directly. `docs/CUSTOMIZATION.md` says which file holds what.

## Ethical Use

- Never submit an application yourself. Fill forms, draft answers, and generate PDFs, then stop before Submit, Send, or Apply. A submission is outward-facing and can't be undone.
- The apply gate and effort lanes live in `modes/_profile.md`; take every threshold from there. Below the gate, say so, recommend against applying, and ask before producing a CV.

## Location Tiers

Locations are tiered, not penalized. Tier values, resolution order, and the out-of-scope rule live in `config/profile.yml` → `location.tiers`, and `scan-core.mjs` resolves the same table. Never restate a tier value anywhere else, prose included.

Tier is desirability, not work authorization. Collapsing the two corrupts both scores:

- Tier answers "do I want to be there", which feeds Opportunity.
- Work authorization answers "can they hire me", which feeds Odds.

A tier-A country can still need a visa, and a low tier never implies one. Read `location.work_authorization` and assess sponsorship per posting.

## Offer Verification

A posting is confirmed live only when a real browser has rendered it. Web search and plain fetch don't drive a browser, so on their own they leave it unconfirmed.

Verdict: title, description, and an active Apply control mean active. Only a footer, navbar, or "no longer accepting applications" without the job description means closed.

Use the first tool available:

1. A browser tool that drives a real, rendering browser, such as Claude Code's built-in browser, a Chrome DevTools MCP server, or Playwright. It renders LinkedIn public job pages with no login wall: title, posting age, applicant count, Apply button, and full description.
2. Plain fetch (WebFetch or an equivalent). Mark the report header `**Verification:** unconfirmed (WebFetch)`.

Never run two browser-driving agents in parallel; they share one browser. Headless batch workers (such as `claude -p`) have no browser, so they use plain fetch and mark `**Verification:** unconfirmed (batch mode)`.

## Reports and outputs

- Reports go in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`. The number is the highest existing one plus 1, three digits.
- Every report header carries `**URL:**` (between Score and PDF) and `**Legitimacy:** {tier}` (Block G in `modes/oferta.md`).
- Never delete or regenerate anything in `output/` or `reports/`. They're the record of what was sent: the tracker's Output column links into `output/{slug}/`, and `verify-pipeline.mjs` warns when an applied row has no folder.

## The tracker is two files

| File | Holds | Statuses |
| ---- | ----- | -------- |
| `data/applications.md` | Open: what to do next | _(blank)_, `🎯` `📬` `💰`, `✅` |
| `data/applications-archive.md` | Closed: what already happened | `⏭️`, `❌`, `🚫`, `👻` |

Same 12 columns, same rules. The split keeps the apply queue readable; it isn't for forgetting. The archive holds the rejections and silences, which are most of what the analysis scripts learn from.

- Anything that analyzes the record reads both files (`parseTrackerAll()` in `tracker-core.mjs`). Never answer a funnel, calibration, or history question from the live file alone.
- Anything that dedups checks both. A role skipped months ago must never return as a fresh lead.
- Re-opening an archived row is the one manual move. Move the line back and set its status. `merge-tracker.mjs` reports the archived match and stops, because a reposted role that once rejected the user is a judgement call.

## Pipeline Integrity

- Never create a second row for a company and role that already exist in either file. Update the existing row instead.
- Add new rows only through a TSV in `batch/tracker-additions/` and `node merge-tracker.mjs`. You can edit an existing row's status or notes directly.
- Report numbers aren't unique keys. Concurrent sessions can hand one number to two companies, so key on company plus the Date column.
- Never hand-sort, hand-retire, or hand-move rows between files. `sort-tracker.mjs`, `retire-stale.mjs`, and `archive-tracker.mjs` do it: dry run by default, `--apply` writes.
- Keep rows unpadded (`| a | b |`). Alignment padding is invisible but can multiply the file's size, and every session that reads the tracker pays for it. If an editor reformats the table, undo it.
- `node verify-pipeline.mjs` checks both files.

### TSV Format for tracker additions

One file per evaluation, `batch/tracker-additions/{num}-{company-slug}.tsv`: one line, 13 tab-separated columns, no header.

```
{num}\t{date}\t{company}\t{role}\t{fit}/5\t{odds}/5\t{priority}/5\t{status}\t{output}\t[{num}](../reports/{num}-{slug}-{date}.md)\t{location}\t{note}\t{url}
```

- `fit`, `odds`, `priority` use `X.X/5`. Fit is "do I qualify", odds "will they pick me", priority "should I focus here".
- `output` is `[📁](../output/slug)` or `-`. The report link needs `../` because the tracker lives in `data/`.

### Status Emojis

Status cells hold a canonical emoji from `templates/states.yml`, or blank for evaluated. No words, bold, dates, or notes in that cell.

| Emoji | Meaning |
| ----- | ------- |
| _(blank)_ | Evaluated, apply decision pending |
| `✅` | Applied |
| `📬` | Responded, no interview yet |
| `🎯` | Interviewing |
| `💰` | Offer |
| `❌` | Rejected by the company |
| `🚫` | Discarded: withdrew, or the position closed |
| `👻` | Ignored: applied, no response, retired by `retire-stale.mjs` |
| `⏭️` | Skip: doesn't fit, don't apply |

### Sort Order

Group order, across both files: _(blank)_ › 🎯/📬/💰 › ✅ › ⏭️ › ❌/🚫 › 👻. `node sort-tracker.mjs` sorts both, and its header explains why each group ranks the way it does. In short, the unapplied group ranks by effort lane, then posting freshness. The chase groups rank by the date the application was sent, and closed groups by priority.

### Notes markers

The notes column carries dated markers that scripts parse. They need no schema change.

- `Applied YYYY-MM-DD`: when the application went out. The Date column is the evaluation date and often runs weeks earlier.
- `Posted YYYY-MM-DD`: carry it over from `data/pipeline.md` when you promote a role. The unapplied queue ranks on it, so a dropped date sinks the role.

### Recording Outcomes

When a company makes human contact, add or update its row in `data/outcomes.tsv`, and update the tracker status too. The tracker shows one `❌` for both a CV-screen rejection and a fourth-round one. Only the outcomes file records how far a conversation went, and `analyze-scoring.mjs` reads it to calibrate the apply gate.

- One row per real human response. An automated rejection isn't one.
- Absence is the signal. An applied row with no outcome row counts as no contact, so never add placeholder rows for silence.
- Key on `company` plus the tracker's Date column, not the applied date.
- Record both `stages_passed` (stages completed) and `furthest_stage` (an id from `stages:` in `templates/states.yml`). Loop lengths differ by company.

### The inbox

`node triage.mjs` screens `data/pipeline.md` into `data/triage.md`, and `--drain` clears rows that will never earn a read. A drained row was never reviewed. `data/excluded.md` means a human reviewed the role and said no. Keep the two apart, or the exclusion list stops meaning anything.

## Interview work

Read `interview-prep/seniority-playbook.md` and `interview-prep/interview-feedback-log.md` first, every time. Prep written without the playbook misses material it already holds. When more prep is on the table, recommend the out-loud drill in `interview-prep/voice-drill-briefing.md` over another prep doc.
