# agentic-job-hunt -- Mode Router

This file is the single routing table. It works in any coding agent. Claude Code reaches it through `.claude/skills/job-hunt/SKILL.md` (`/job-hunt {mode}`). Every other harness reads it directly: match the user's request to a mode below.

## Mode Routing

Determine the mode from the sub-command or request (`{mode}`):

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `oferta` | `oferta` |
| `ofertas` | `ofertas` |
| `contacto` | `contacto` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `track` or `add` | Quick add URLs to tracker (no evaluation) |
| `tracker` | Application status overview |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `patterns` | `patterns` |
| `followup` | `followup` |
| `postmortem` | `postmortem` |
| `interview-prep`, `prep`, or an interview at a named company | `interview-prep` |
| `debrief`, or the user shares a transcript, recording, or company feedback | `interview-debrief` |
| `self-knowledge` | `self-knowledge` |

**Auto-pipeline detection:** If `{mode}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{mode}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu. The `/job-hunt` prefix is Claude Code syntax. In other harnesses, the user names the mode in plain words.

```
agentic-job-hunt -- Command Center

Available commands:
  /job-hunt {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /job-hunt pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /job-hunt oferta    → Evaluation only A-F (no auto PDF)
  /job-hunt ofertas   → Compare and rank multiple offers
  /job-hunt contacto  → LinkedIn power move: find contacts + draft message
  /job-hunt deep      → Deep research prompt about company
  /job-hunt pdf       → PDF only, ATS-optimized CV
  /job-hunt training  → Evaluate course/cert against North Star
  /job-hunt project   → Evaluate portfolio project idea
  /job-hunt tracker   → Application status overview
  /job-hunt track     → Quick add URLs to tracker (no evaluation)
  /job-hunt apply     → Live application assistant (reads form + generates answers)
  /job-hunt scan      → Scan portals and discover new offers
  /job-hunt batch     → Batch processing with parallel workers
  /job-hunt patterns  → Analyze rejection patterns and improve targeting
  /job-hunt followup  → Follow-up cadence tracker: flag overdue, generate drafts

Inbox: add URLs to data/pipeline.md → /job-hunt pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `oferta`, `ofertas`, `pdf`, `contacto`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `track`, `deep`, `training`, `project`, `patterns`, `followup`, `self-knowledge`

### Interview modes (their mode file plus the standing references):
Read `modes/{mode}.md`, then the required reading it names. For both
`interview-prep` and `interview-debrief` that always includes
`interview-prep/seniority-playbook.md` and
`interview-prep/interview-feedback-log.md`. Skipping the playbook is the
documented failure mode: prep written without it has already missed material
the playbook contained.

### Modes delegated to a subagent:
For `scan`, `apply` (with a browser tool), and `pipeline` (3+ URLs): if the harness can spawn subagents, run the mode in one. Inject the content of `modes/_shared.md` and `modes/{mode}.md` into the subagent prompt, plus the invocation-specific data. In Claude Code, use the `Agent` tool with `subagent_type="general-purpose"` and the description `agentic-job-hunt {mode}`. If the harness has no subagents, run the mode inline.

Execute the instructions from the loaded mode file.
