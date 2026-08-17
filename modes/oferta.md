# Mode: oferta — Full A-G Evaluation

When the candidate pastes an offer (text or URL), ALWAYS deliver all 7 blocks (A-F evaluation + G legitimacy):

## Step 0 — Archetype Detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If it is a hybrid, indicate the 2 closest ones. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

**Odds Breakdown** (include as a sub-section after the table): List every penalty applied when computing the Odds score. Format:

```
Odds = Fit {X/5} − penalties:
- [penalty name]: −X.X (reason)
- ...
= {Odds final}/5
```

This makes the recruiter-side reasoning traceable. If no penalties apply, state "No penalties — Odds = Fit".

## Block B — Match with CV

Read `cv.md`. Create a table with each JD requirement mapped to exact lines from the CV.

**Adapted to archetype:**
- If FDE → prioritize proof points for fast delivery and client-facing
- If SA → prioritize systems design and integrations
- If PM → prioritize product discovery and metrics
- If LLMOps → prioritize evals, observability, pipelines
- If Agentic → prioritize multi-agent, HITL, orchestration
- If Transformation → prioritize change management, adoption, scaling

**Gaps** section with mitigation strategy for each. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (phrase for cover letter, quick project, etc.)

## Block C — Level and Strategy

1. **Detected level** in the JD vs **candidate's natural level for that archetype**
2. **"Sell senior without lying" plan**: specific phrases adapted to the archetype, concrete achievements to highlight, how to position founder experience as an advantage
3. **"If I get downleveled" plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp and Demand

Use WebSearch for:
- Current salaries for the role (Glassdoor, Levels.fyi, Blind)
- Company's compensation reputation
- Role demand trend

Table with data and cited sources. If there is no data, say so instead of inventing.

## Block E — Customization Plan

| # | Section | Current State | Proposed Change | Why |
|---|---------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 changes to the CV + Top 5 changes to LinkedIn to maximize match.

## Block F — Interview Plan

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Selected and framed according to archetype:**
- FDE → emphasize delivery speed and client-facing
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption, organizational change

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g.: "why did you sell your company?", "do you have a team of reports?")

## Block G — Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

### Signals to analyze (in order):

**1. Posting Freshness** (from the browser page read, already captured in Step 0):
- Date posted or "X days ago" -- extract from page
- Apply button state (active / closed / missing / redirects to generic page)
- If URL redirected to generic careers page, note it

**2. Description Quality** (from JD text):
- Does it name specific technologies, frameworks, tools?
- Does it mention team size, reporting structure, or org context?
- Are requirements realistic? (years of experience vs technology age)
- Is there a clear scope for the first 6-12 months?
- Is salary/compensation mentioned?
- What ratio of the JD is role-specific vs generic boilerplate?
- Any internal contradictions? (entry-level title + staff requirements, etc.)

**3. Company Hiring Signals** (2-3 WebSearch queries, combine with Block D research):
- Search: `"{company}" layoffs {year}` -- note date, scale, departments
- Search: `"{company}" hiring freeze {year}` -- note any announcements
- If layoffs found: are they in the same department as this role?

**4. Reposting Detection** (from scan-history.tsv):
- Check if company + similar role title appeared before with a different URL
- Note how many times and over what period

**5. Role Market Context** (qualitative, no additional queries):
- Is this a common role that typically fills in 4-6 weeks?
- Does the role make sense for this company's business?
- Is the seniority level one that legitimately takes longer to fill?

### Output format:

**Assessment:** One of three tiers:
- **High Confidence** -- Multiple signals suggest a real, active opening
- **Proceed with Caution** -- Mixed signals worth noting
- **Suspicious** -- Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed with its finding and weight (Positive / Neutral / Concerning).

**Context Notes:** Any caveats (niche role, government job, evergreen position, etc.) that explain potentially concerning signals.

### Edge case handling:
- **Government/academic postings:** Longer timelines are standard. Adjust thresholds (60-90 days is normal).
- **Evergreen/continuous hire postings:** If the JD explicitly says "ongoing" or "rolling," note it as context -- this is not a ghost job, it is a pipeline role.
- **Niche/executive roles:** Staff+, VP, Director, or highly specialized roles legitimately stay open for months. Adjust age thresholds accordingly.
- **Startup / pre-revenue:** Early-stage companies may have vague JDs because the role is genuinely undefined. Weight description vagueness less heavily.
- **No date available:** If posting age cannot be determined and no other signals are concerning, default to "Proceed with Caution" with a note that limited data was available. NEVER default to "Suspicious" without evidence.
- **Recruiter-sourced (no public posting):** Freshness signals unavailable. Note that active recruiter contact is itself a positive legitimacy signal.

---

## Post-evaluation

**ALWAYS** after generating blocks A-G:

### 1. Save report .md

Save full evaluation in `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Fit:** {X/5} | **Odds:** {X/5} | **Priority:** {X/5}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**PDF:** {path or pending}

---

## A) Role Summary
(full content of block A)

## B) Match with CV
(full content of block B)

## C) Level and Strategy
(full content of block C)

## D) Comp and Demand
(full content of block D)

## E) Customization Plan
(full content of block E)

## F) Interview Plan
(full content of block F)

## G) Posting Legitimacy
(full content of block G)

## H) Draft Application Answers
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted Keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### 1b. Score Breakdown

Before registering in the tracker, show the score arithmetic explicitly:

```
| Score      | Value | Basis |
|------------|-------|-------|
| Fit        | X/5   | North Star X/5 · CV Match X/5 · Level X/5 |
| Odds       | X/5   | Fit X/5 − [list any penalties applied] |
| Opportunity| X/5   | Comp X/5 · Company tier X/5 · Location X/5 · Growth X/5 |
| **Priority** | **X/5** | Fit×0.40 + Odds×0.30 + Opportunity×0.30 |
```

The **Priority** value is what goes into the tracker Score column.

**Guard rules (apply all, take the lowest result):**
- **Formula cap:** Priority = Fit×0.40 + Odds×0.30 + Opportunity×0.30 — compute this first.
- **Fit ceiling:** Priority cannot exceed Fit + 0.4. High Opportunity (prestige, location, comp) cannot compensate for weak archetype match.
- **Hard floor rule:** If Fit < 3.0, Priority cannot exceed 3.0. If Fit < 3.5, Priority cannot exceed 3.5.
- Document any cap applied in the breakdown row: `Priority: X/5 (capped from Y/5 — Fit ceiling)`.

### 2. Register in tracker

**ALWAYS** register in `data/applications.md` via TSV in `batch/tracker-additions/`. The tracker has **two score columns**: Fit and Priority.

- Next sequential number
- Current date
- Company
- Role
- **Fit** score (X.X/5 — "Do I qualify?")
- **Odds** score (X.X/5 — "Will they pick me?")
- **Priority** score (X.X/5 — "Should I focus here?")
- Status: `Evaluated`
- Output: relative link to output folder (e.g.: `[📁](../output/company-slug)`) or `-`
- Report: relative link to the report .md (e.g.: `[001](../reports/001-company-2026-01-01.md)`)
- Location
- Reasoning: one-line summary
- URL

**Tracker format:**

```markdown
| Date | Company | Role | Fit | Odds | Priority | Status | Output | Report | Location | Reasoning | URL |
```
