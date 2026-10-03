---
name: agentic-job-hunt
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
argument-hint: "[scan | deep | pdf | oferta | ofertas | apply | batch | tracker | track | add | pipeline | contacto | training | project | update | postmortem]"
---

# agentic-job-hunt -- Claude Code entry point

The routing table, discovery menu, and context-loading rules live in `modes/_router.md` so every harness shares them. Read that file now, treat `{{mode}}` as `{mode}`, and follow it.
