# Mode: track — Quick Add to Tracker

Fetches LinkedIn job URLs, extracts basic info, and adds to `data/applications.md` with empty status (no evaluation).

**Input:** One or more LinkedIn job URLs

## Steps

1. **Fetch each URL** via webfetch (markdown format)

2. **Extract from page:**
   - Company name
   - Job title
   - Location

3. **Score the role** (quick Priority 1-5):
   - Compare against strategy: IDP, DevEx, AI Platforms, AppSec
   - Rate alignment: 5=perfect, 4=strong, 3=moderate, 2=weak, 1=poor
   - This is the Priority score only — Fit and Odds are not calculated in quick-add mode

4. **Insert row into** `data/applications.md` **maintaining sort order**:
   - Sort by: Status > Priority (descending) > Date (descending)
   - Insert in correct position among existing Pending entries by Priority score
   - Use `-` for Fit and Odds (not evaluated in quick-add mode)
   ```
   | {date} | {Company} | {Role} | - | - | {priority}/5 |  | - | - | {Location} | {reasoning} | {URL} |
   ```

5. **Confirm** with summary table of added jobs

## Notes

- Use today's date (YYYY-MM-DD)
- Reasoning: Brief 1-2 sentence alignment note
- Skips A-F evaluation, report generation, and PDF creation
- For full evaluation later, use `auto-pipeline` or `pipeline` mode