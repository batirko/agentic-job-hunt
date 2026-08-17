# Mode: tracker — Application Tracker

Reads and displays the tracker. **The tracker is two files:**

- `data/applications.md` — open rows: _(blank)_ evaluated, `🎯`/`📬`/`💰` live conversation, `✅` sent
- `data/applications-archive.md` — closed rows: `⏭️` skip, `❌` rejected, `🚫` discarded, `👻` ignored

Same 12 columns in both. **Read both for anything about the history or the funnel** — totals, status breakdowns, averages, "have I applied here before". Read the live file alone only when the question is "what should I do next".

`node archive-tracker.mjs --apply` moves newly-closed rows to the archive. Never cut and paste rows between the files by hand.

**Tracker format:**
```markdown
| Date | Company | Role | Score | Status | Output | Report | Location | Reasoning | URL |
```

Status emojis:
- `✅` = Applied
- `🎯` = Interview
- `💰` = Offer
- `❌` = Rejected
- `🚫` = Discarded
- `👻` = Ignored (applied, never got a response, retired)
- `⏭️` = SKIP
- (empty) = Pending

If the user asks to update a status, edit the corresponding row in whichever file holds it. A status change that closes a row (`⏭️` `❌` `🚫` `👻`) leaves it in the live file until `archive-tracker.mjs` moves it — that is fine, and `sort-tracker.mjs` still ranks it correctly in the meantime.

Also show statistics:
- Total applications
- By status
- Average score
- % with Output folder created
- % with report generated
