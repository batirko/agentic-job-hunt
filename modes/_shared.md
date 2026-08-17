# System Context -- agentic-job-hunt

<!-- ============================================================
     THIS FILE IS AUTO-UPDATABLE. Don't put personal data here.
     
     Your customizations go in modes/_profile.md (never auto-updated).
     This file contains system rules, scoring logic, and tool config
     that improve with each agentic-job-hunt release.
     ============================================================ -->

## Sources of Truth

| File | Path | When |
|------|------|------|
| cv.md | `cv.md` (project root) | ALWAYS |
| article-digest.md | `article-digest.md` (if exists) | ALWAYS (detailed proof points) |
| profile.yml | `config/profile.yml` | ALWAYS (candidate identity and targets) |
| _profile.md | `modes/_profile.md` | ALWAYS (user archetypes, narrative, negotiation) |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md.**
**RULE: Read _profile.md AFTER this file. User customizations in _profile.md override defaults here.**

---

## Scoring System

Every evaluation produces **three labeled scores** plus a composite Priority stored in the tracker.

### Fit/5 — "Do I qualify?"
Pure match between candidate background and role requirements. Ignores comp, company quality, and location.

| Component | Weight |
|-----------|--------|
| North Star alignment (target archetype match) | 40% |
| CV Match (proof points, skills, domain coverage) | 40% |
| Level fit (seniority match — no over/under leveling) | 20% |

### Odds/5 — "Will they pick me?"
Start from Fit, then apply penalties that affect hiring probability:

| Condition | Adjustment |
|-----------|-----------|
| Hard blocker (language req, mandatory degree, visa) | −1.5 per blocker |
| Significant gap (required domain entirely missing) | −0.5 per gap |
| Soft gap (nice-to-have skill missing) | −0.2 per gap |
| High competition (200+ applicants on posting) | −0.3 |
| Floor | 0.5 (never 0 — unlikely ≠ impossible) |

### Opportunity/5 — "Is this worth pursuing?" (intermediate, not stored)

| Component | Weight |
|-----------|--------|
| Compensation vs candidate target (profile.yml) | 30% |
| Company tier (FAANG/unicorn → unknown/red flags) | 30% |
| Location fit (see location tiers below) | 20% |
| Growth trajectory (leveling up → dead end) | 20% |

**Location fit** is tiered, not penalised. Read the tier table from `config/profile.yml` → `location.tiers`; each tier carries the score to use. Resolution order is explicit country, then the EU catch-all, then the wider-Europe catch-all, then global remote. A posting listing several locations takes its **best** tier.

**Location tier is desirability, never work authorization.** Whether an employer can legally hire the candidate is an Odds question and belongs to the hard-blocker row above. Read `location.work_authorization` in profile.yml and assess per posting. A top-tier location does not imply an easy hire.

### Priority/5 — "Should I focus here?" (stored in tracker)

**Priority = Fit × 0.40 + Odds × 0.30 + Opportunity × 0.30**

| Priority | Interpretation |
|----------|---------------|
| 4.5+ | Apply immediately |
| 4.0–4.4 | Worth applying |
| 3.5–3.9 | Only with specific reason |
| < 3.5 | Skip (see Ethical Use in CLAUDE.md) |

## Posting Legitimacy (Block G)

Block G assesses whether a posting is likely a real, active opening. It does NOT affect the 1-5 global score -- it is a separate qualitative assessment.

**Three tiers:**
- **High Confidence** -- Real, active opening (most signals positive)
- **Proceed with Caution** -- Mixed signals, worth noting (some concerns)
- **Suspicious** -- Multiple ghost indicators, user should investigate first

**Key signals (weighted by reliability):**

| Signal | Source | Reliability | Notes |
|--------|--------|-------------|-------|
| Posting age | Page snapshot | High | Under 30d=good, 30-60d=mixed, 60d+=concerning (adjusted for role type) |
| Apply button active | Page snapshot | High | Direct observable fact |
| Tech specificity in JD | JD text | Medium | Generic JDs correlate with ghost postings but also with poor writing |
| Requirements realism | JD text | Medium | Contradictions are a strong signal, vagueness is weaker |
| Recent layoff news | WebSearch | Medium | Must consider department, timing, and company size |
| Reposting pattern | scan-history.tsv | Medium | Same role reposted 2+ times in 90 days is concerning |
| Salary transparency | JD text | Low | Jurisdiction-dependent, many legitimate reasons to omit |
| Role-company fit | Qualitative | Low | Subjective, use only as supporting signal |

**Ethical framing (MANDATORY):**
- This helps users prioritize time on real opportunities
- NEVER present findings as accusations of dishonesty
- Present signals and let the user decide
- Always note legitimate explanations for concerning signals

## Archetype Detection

Classify every offer into one of these types (or hybrid of 2):

| Archetype | Key signals in JD |
|-----------|-------------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

After detecting archetype, read `modes/_profile.md` for the user's specific framing and proof points for that archetype.

## Global Rules

### NEVER

1. Invent experience or metrics
2. Modify cv.md or portfolio files
3. Submit applications on behalf of the candidate
4. Share phone number in generated messages
5. Recommend comp below market rate
6. Generate a PDF without reading the JD first
7. Use corporate-speak
8. Ignore the tracker (every evaluated offer gets registered)

### ALWAYS

0. **Cover letter:** If the form allows it, ALWAYS include one. Same visual design as CV. JD quotes mapped to proof points. 1 page max.
1. Read cv.md, _profile.md, and article-digest.md (if exists) before evaluating
1b. **First evaluation of each session:** Run `node cv-sync-check.mjs`. If warnings, notify user.
2. Detect the role archetype and adapt framing per _profile.md
3. Cite exact lines from CV when matching
4. Use WebSearch for comp and company data
5. Register in tracker after evaluating
6. Generate content in the language of the JD (EN default)
7. Be direct and actionable -- no fluff
8. Native tech English for generated text. Short sentences, action verbs, no passive voice.
8b. Case study URLs in PDF Professional Summary (recruiter may only read this).
9. **Tracker additions as TSV** -- NEVER edit applications.md directly. New rows always go to the live tracker; closed rows live in `data/applications-archive.md` and move there via `node archive-tracker.mjs`, never by hand. Write TSV in `batch/tracker-additions/`:
    - Format: `num\tdate\tcompany\trole\tfit\todds\tpriority\tstatus\toutput\treport\tlocation\treasoning\turl`
    - Columns: num | date | company | role | **fit** (X.X/5) | **odds** (X.X/5) | **priority** (X.X/5) | status | output | report | location | reasoning | url
    - **NO header row** — start directly with the data row
    - Report link format: `[###](../reports/###-{slug}-{date}.md)` (include closing parenthesis)
    - After writing, run: `node merge-tracker.mjs [--sort]`
    - If sorting needed: `node merge-tracker.mjs --sort`
    - **After updating status** (e.g., marking Applied): ALWAYS run `node merge-tracker.mjs --sort` to re-sort the table
10. **Include `**URL:**` in every report header.**

### Tools

| Tool | Use |
|------|-----|
| WebSearch | Comp research, trends, company culture, LinkedIn contacts, fallback for JDs |
| WebFetch | Fallback for extracting JDs from static pages |
| Built-in Claude browser (`mcp__Claude_Browser__*`) | **Preferred** for verifying offers + extracting JDs: `navigate` (in a `tabs_create` tab) + `get_page_text`/`read_page`. Renders LinkedIn public pages without login. See CLAUDE.md → "Offer Verification -- MANDATORY". |
| chrome-devtools MCP (`mcp__chrome-devtools__*`) | Second-choice browser: `navigate_page` + `take_snapshot`. **NEVER run 2+ browser-driving agents in parallel** (single shared browser). |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | Temporary HTML for PDF, applications.md, reports .md |
| Edit | Update tracker |
| Canva MCP | Optional visual CV generation. Duplicate base design, edit text, export PDF. Requires `canva_resume_design_id` in profile.yml. |
| Bash | `node generate-pdf.mjs` |

### PDF Pipeline
- **generate-pdf.mjs requires HTML input** (not Markdown). Convert MD → HTML → run the script.
- Always regenerate PDF after any MD edits.

### Time-to-offer priority
- Working demo + metrics > perfection
- Apply sooner > learn more
- 80/20 approach, timebox everything

---

## Professional Writing & ATS Compatibility

These rules apply to ALL generated text that ends up in candidate-facing documents: PDF summaries, bullets, cover letters, form answers, LinkedIn messages. They do NOT apply to internal evaluation reports.

### Avoid cliché phrases
- "passionate about" / "results-oriented" / "proven track record"
- "leveraged" (use "used" or name the tool)
- "spearheaded" (use "led" or "ran")
- "facilitated" (use "ran" or "set up")
- "synergies" / "robust" / "seamless" / "cutting-edge" / "innovative"
- "in today's fast-paced world"
- "demonstrated ability to" / "best practices" (name the practice)

### Unicode normalization for ATS
`generate-pdf.mjs` automatically normalizes em-dashes, smart quotes, and zero-width characters to ASCII equivalents for maximum ATS compatibility. But avoid generating them in the first place.

### Vary sentence structure
- Don't start every bullet with the same verb
- Mix sentence lengths (short. Then longer with context. Short again.)
- Don't always use "X, Y, and Z" — sometimes two items, sometimes four

### Prefer specifics over abstractions
- "Cut p95 latency from 2.1s to 380ms" beats "improved performance"
- "Postgres + pgvector for retrieval over 12k docs" beats "designed scalable RAG architecture"
- Name tools, projects, and customers when allowed
