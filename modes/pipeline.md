# Mode: pipeline — URL Inbox (Second Brain)

Processes job offer URLs accumulated in `data/pipeline.md`. The user adds URLs at any time and then runs `/job-hunt-pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in the "Pending" section.
2. **For each pending URL**:
   a. Calculate the next sequential `REPORT_NUM` (read `reports/`, take the highest number + 1).
   b. **Extract JD** using the built-in Claude browser (`mcp__Claude_Browser__*`) → chrome-devtools MCP → WebFetch → WebSearch. See CLAUDE.md → "Offer Verification -- MANDATORY".
   c. If the URL is not accessible → mark as `- [!]` with a note and continue.
   d. **Run full auto-pipeline**: A-F Evaluation → Report .md → PDF (if score >= 3.0) → Tracker.
   e. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`.
3. **If there are 3+ pending URLs**, launch agents in parallel (Task tool) to maximize speed.
4. **When finished**, show summary table:

```
| # | Company | Role | Score | PDF | Recommended Action |
```

## pipeline.md Format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Intelligent JD Detection from URL

1. **Built-in Claude browser (preferred):** `mcp__Claude_Browser__navigate` (in a `tabs_create` tab) + `get_page_text`/`read_page`. Works with SPAs. See CLAUDE.md → "Offer Verification -- MANDATORY" for the full tool ladder.
2. **chrome-devtools MCP (second):** `mcp__chrome-devtools__navigate_page` + `take_snapshot`.
3. **WebFetch (fallback):** For static pages or when both browsers are unavailable.
4. **WebSearch (last resort):** Search secondary portals indexing the JD.

**Special cases:**
- **LinkedIn**: The built-in Claude browser renders LinkedIn *public* job pages without login (title + JD + Apply + freshness + applicant count). Only if a browser is genuinely unavailable, mark `[!]` and ask the user to paste the text.
- **PDF**: If the URL points to a PDF, read it directly using the Read tool.
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`.

## Automatic Numbering

1. List all files in `reports/`.
2. Extract number from the prefix (e.g., `142-company...` → 142).
3. New number = maximum found + 1.

## Source Sync

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If there is a desync, warn the user before continuing.
