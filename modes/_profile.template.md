
# User Profile Context -- agentic-job-hunt

## Working Preferences (MANDATORY)

### Always fetch the JD, never ask for a paste
When a job URL is available anywhere -- the tracker, the inbox, the triage table, or the message itself -- fetch it directly. Do not ask the user to paste the description. Use the browser tool ladder in `CLAUDE.md`; only ask for the text if every fetch path fails.

## Document Style & ATS Standards

### Formatting Rules (MANDATORY)
- **Single-Column Layout**: No tables, no columns. Linear flow only.
- **Header Format**: `[Company Name] | [Job Title] | [Dates] | [Location]` (Experience & Education).
- **Contact Row**: `email | linkedin | location | phone` (separated by pipes).
- **Product Context**: Every role starts with a `Product:` description line (italicized) before bullets.
- **Linear Skills**: Categorized domain lists (e.g., Tools: A, B, C) as text lines, not grids/tags.

### Content Optimization
- **Keyword Integration**: Map achievements to JD requirements naturally using the `humanize-ai-text` skill.
- **Metrics earn their place**: Keep only real outcome metrics (adoption %, conversion %, revenue share, deals unlocked, time saved, honest scale signals). See the **Numbers Discipline** rule below for the full banned list.
- **Hierarchy**: Summary → Experience → Skills → Education → Languages.
- **Authenticity over keyword stuffing**: Never sacrifice honest experience coverage for JD keyword matching. If the candidate didn't do aerospace testing, don't say "validation tooling for airborne systems" — say "internal developer tooling". The transfer is in the *skill*, not the domain. Match keywords only when they genuinely reflect the work.

### Numbers Discipline (MANDATORY)

A number stays only if (a) it is an outcome metric a recruiter cares about, or (b) it is an honest scale signal that genuinely helps the reader.

**Banned:**
- Internal counts: repos, services, components, microservices, teams onboarded, integrations shipped (when small).
- Activity counts: prototypes tested, PRDs written, A/B tests run, interviews conducted.
- Target thresholds dressed as achievements (">20% target", ">80% accuracy"). Targets are not outcomes.
- Any internal-confidential number (see the existing Privacy & Accuracy section).

**The bar:** name two or three real outcome metrics from your own history here, the ones a recruiter could contextualise without insider knowledge. Every other number on the CV has to match that quality or be omitted.

### Contribution Honesty (MANDATORY)

Use the most honest verb for the actual level of ownership:

| Verb | When to use |
|------|-------------|
| `Led X` / `Owned X` | Drove end-to-end with PM accountability for the outcome |
| `Drove a major part of X` | Significant contribution within a larger effort that had other leads |
| `Owned the product side of X` | PM ownership of use cases, interfaces, and adoption; engineering owned implementation and architecture |
| `Contributed to X` / `Shipped within X` | Team effort where the candidate was one of several contributors |

**Banned:**
- "Architected" (engineering term, overclaim for PM).
- "Orchestrated" (puffy, hides what was actually done).
- Solo verbs on team efforts ("singlehandedly", "personally drove").
- Casting collaboration as solo ownership in any form.

**The test:** if a former colleague read the bullet, would they nod, or would they squint?

## Application Package Structure (MANDATORY)

Every application must have its own folder in `output/`:
```
output/{company-slug}/
├── {Your Name} - {Role Title}.md       # Source for iteration
├── {Your Name} - {Role Title}.pdf      # Final CV
└── {Your Name} - Cover Letter.pdf      # Cover letter (when generated)
```

## CV Rules (MANDATORY)

### Always Return the Job Link (MANDATORY)

Whenever a CV is generated in a session, the chat response announcing it **must include the job posting URL** for that role. Not just the file paths — the link too, so the posting can be opened and applied to without digging through the tracker.

Source the URL from the evaluation report header (`**URL:**`), the tracker row in `data/applications.md` or `data/applications-archive.md`, or the URL originally pasted in the session. If none of those has it, say so explicitly in the response rather than silently omitting the link.

Applies to every CV: single generations, batches (one link per CV), and regenerations of an existing CV.

### Always State the Comp Number (MANDATORY)

Whenever a CV is generated in a session, the chat response announcing it **must also carry the compensation to state for that role**, in both forms:

- **Single number** — the one figure to type when a form or a recruiter demands exactly one. Sit it near the top of the range, not in the middle.
- **Range** — the band to say out loud when there is room for a conversation.

Derive both per posting, never from a default. Inputs: the region's floor in `config/profile.yml` → `compensation.floors_by_region`, any band the posting itself publishes, and the employer's pay scale (funding, stage, global vs. local band). Name the floor you applied so the number is auditable. Full method and worked examples: `interview-prep/comp-expectations-2026-07.md`.

Three anchors that override the naive read:

- Never state above a band the posting published. Take its ceiling, then ask separately whether it flexes.
- An employer on a global or US-funded pay scale is judged on that scale, not the local median.
- Use the regional floor from `config/profile.yml`, not your headline number. They are different for every market.

Applies to every CV: single generations, batches (one comp line per CV), and regenerations.

### Length (MANDATORY)

**Default: 2 pages A4.** Every CV in `output/` is 2 pages and that is the target, not an accident of content.

Check the page count in the `generate-pdf.mjs` output before reporting the CV as done. If it comes out at 3 pages, cut rather than shrink type: drop the Personal Projects section first, then the oldest role's bullets down to one line each. If it comes out at 1.5 pages, the tailoring has cut too much and the base CV's proof points should come back.

Do not reduce font sizes or margins in the template to force a fit. The template's sizing is fixed across applications so the CVs stay visually consistent.

### Pre-save Checklist (verify before every PDF or CV save)

Run `node cv-lint.mjs <file>` — it checks all of the below automatically. Review each:

- [ ] No internal scale numbers (engineer/component/system/repo counts)
- [ ] No overclaimed technical work ("standardized auth", "defined integration contracts", "without custom auth or logging")
- [ ] No clichés: "architected", "leveraged", "spearheaded", "passionate about", "seamless", "robust"
- [ ] No em-dash continuation pattern ("-- [verb]ing") — use commas
- [ ] No em-dashes or en-dashes in markdown source
- [ ] Job title is "Senior Product Manager" only — no product names appended
- [ ] Every role has an italic `Product:` subtitle
- [ ] "Portfolio Management" not in Skills
- [ ] No ownership claim broader than the Ownership Accuracy rules below allow
- [ ] No closing oversell sentences ("Strong match for", "directly applicable to")

### Skills
- **Never use "Portfolio Management"** in skills — it's redundant. Use only: Roadmap Planning, Technical Discovery, etc.

### Privacy & Accuracy
- **Never disclose internal numbers.** Headcounts, component counts, system counts and any internal metric are confidential. They also mean nothing to a reader outside the company.
> **FILL IN:** per-employer accuracy constraints. One line each, stating the limit of what you owned and the exact wording that overclaims it. These exist to stop a generative pass from quietly promoting you. Examples of the shape:
> - *Never claim ownership of the whole {platform}: you owned {specific areas}, not the platform.*
> - *{Employer} was office-based in {city}, not remote.*


### Naming Conventions
- **File naming:** always `{Your Name} - {Standard Title}` for CV files, regardless of the company or the specific posting. One filename, every time, so the recruiter's download folder stays legible.
- **Job titles:** use your real title only. Never append the product or domain to make it match the posting.
- **Product subtitles:** product names and descriptions go only in the italicised `Product:` line, never in the job title.
- **Every role gets a subtitle**, including the oldest ones. A role with no product context reads as filler.


### Tone & Word Choice
- **Avoid overreach**: Do NOT use "architected" — use "defined" or "delivered".
- **Concise subtitles**: product subtitles are short and factual, naming the product and its scope in under ten words. No adjectives.
- **Skills cleanup**: Do NOT use specific tech qualifiers in parentheses like (REST/SQL) or (Terraform) — use clean terms like "API Design" and "Infrastructure-as-Code".
- **No conceptual groupings**: Bullet point headers should represent actual scopes/products managed, not abstract concepts like "Trust & Governance", "Modern Connectivity", or "Technical Product Leadership".
- **Never oversell**: Do NOT add closing sentences like "Strong match for the role...", "directly applicable to...", or "experience transferable to...". Let the recruiter decide fit.
- **Avoid the em-dash explanation pattern**: Never use "-- [verb]ing..." as a continuation. Use commas instead: "X, centralizing Y..." not "X -- centralizing Y...".

### Ownership Accuracy (MANDATORY)

The single most valuable block in this file, and the one only you can write.

> **FILL IN:** for each significant piece of work, the boundary between what you
> owned and what engineering or another team owned. Write the banned phrasing
> explicitly, not just the correct version. A generative pass will otherwise
> reach for the most impressive available verb.
>
> The shape that works:
> - *You owned {use cases, interfaces, strategy}. You did NOT own {the technical implementation}. Do not write "{overclaiming phrase}", "{another one}" — engineers did that.*
> - *The {X} bullet covers {broad ownership}. Do not frame a single project as the entire scope. Lead with the ownership, then the specific initiative.*


### Humanization Rules
- **Avoid clichés**: No "I don't just build features; I build ecosystems" or similar generic statements.
- **Specific over generic**: Always pair insights with concrete examples from your own experience.
- **Avoid AI-bio openings**: Do not start with "I have spent X years..." — lead with a direct insight or problem statement.

## Cover Letter Rules (MANDATORY)

### Length (MANDATORY)

**Default: 180-220 words of body text.** Header block and drafting notes do not count.

This is the length that actually gets sent. Letters that run 350+ words get cut roughly in half before they go out, so write to the target instead of drafting long and trimming. A short letter also forces the real decision: which single angle carries the application.

**What survives a short letter, in priority order:**

1. The opening claim or angle, one to three sentences
2. One proof paragraph with real metrics
3. The honest gap sentence, when there is a gap worth naming
4. The company-specific reason
5. Relocation or visa line when the role location requires it
6. The close

**What gets cut first:** secondary proof points, second and third gap concessions, comparative framing about the market or other roles, and any sentence that characterises the strength of the match instead of showing it.

**Only exceed 220 words when:** the application has no CV attached and the letter is carrying the whole case, or the form explicitly asks for something longer.

**Never concede more than one stated must-have gap in writing.** One reads as calibrated honesty. Two reads as a self-rejection, especially with a recruiter screening before the hiring manager. Hold the second one for the conversation.

### Humanization
- **Always run humanization** on cover letter drafts before finalizing. Use `.skills/humanize-ai-text/scripts/detect.py` to check AI probability, then `.scripts/compare.py` to transform. Target: LOW probability (under 15 issues, under 2% density).
- The script auto-fixes: markdown, copula avoidance, filler phrases, curly quotes.
- Manual cleanup needed for: em dash overuse, negative parallelisms ("not only...but also"), forced rule-of-three.

### Drafting

**Lead with something at stake** — the best opening isn't a proof point list. It's a belief about the problem, a personal connection to the company's mission, or something specific they're building that the candidate has been thinking about. The Helsing letter is the template: personal, mission-driven, authentic angle first. Proof points follow to back it up.

Avoid clichés specific to AI PM letters: "the biggest opportunity in AI isn't the model itself, it's the infrastructure" and "not a feature, it was a first-class product surface" are overused. Replace with something specific to the company's domain or product challenges.

### Language
- **Never use "JD"** — it sounds generated. Use "the position", "the role", or "this opportunity" instead.

### Structure

**Three beats, always in this order: role, then company, then background.** Same spine as the application form answers (see "Application Form Free-Text Answers"), at cover letter length.

1. **Role, why this is interesting to me.** Name the specific stream, surface, or problem from the posting. Anchor it to what you want from your career, not to what the company needs. Open with the interest itself: no warm-up sentence, no general industry observation, no description of your current scope. Current scope is beat 3 material.
2. **Company, why this company is relevant to me.** The space they operate in, what is specific about how they operate, and an opinion about it. This beat is what stops the letter from being paste-able into a competitor's form.
3. **Background, how my experience supports it.** The exact items that map to the role, or the closest adjacent work when there is no exact match. Say which of the two it is. Never inflate adjacent into exact.

The honest gap sentence and the practical closer (relocation, visa, notice period) sit after beat 3 as flat one-liners. They are exempt from the three beats.

**Difference from the form answers rule:** a cover letter may concede one stated must-have gap. A form free-text box may not, because it is read before anyone has met him.

- **Opening**: Lead with a direct insight about developer platforms, the "programmatic contract", or a key technical challenge. Avoid standard bio openings.
- **Current Role Framing**: Use "I lead the user-facing interface of our Internal Developer Platform" — not "I lead our Internal Developer Platform" or "I lead core product areas".
- **Closing**: Be direct. No "Thank you for your consideration" — use "I look forward to discussing..." instead.

### Tone
- **Senior and selective**: Frame the candidate as someone choosing this company for specific technical reasons, not broadcasting to every opening.
- **Proof over affirmation**: Show impact through concrete examples drawn from the Proof-Point map below, rather than generic claims. Use the proof points from `article-digest.md` as the source — they are already verb-corrected and number-scrubbed.
- **Technical but accessible**: mention your technical vocabulary naturally, as part of solving a problem, never as a checklist. Anything not in the CV skills section does not belong in a cover letter either.
- **Human over polished**: if the candidate is fluent but non-native, say so here and lean into it. Avoid perfectly balanced constructions, uniform sentence rhythm, and overly smooth prose. Short sentences mix better than uniform length. Direct statements beat wind-up openers.

### LLM Pattern Bans (MANDATORY — apply before every draft is finalised)
- **No "not X, but Y" constructions**: "adoption and friction, not features shipped", "designed in, not added at the end", "customers I own, not teams I serve" — all recognisable LLM patterns. Cut or rephrase every instance.
- **No essay-like openers**: Don't open with "Something I've noticed...", "One thing I've learned...", or similar wind-up hooks. Start with the statement itself.
- **No paragraph wrap-up sentences**: Don't end a paragraph by restating what it just proved ("That framing applies directly to..."). Let the proof land without a summary.
- **No JD-flagging**: Don't call out a section of the posting as "catching your attention" or "standing out". Address it directly instead.
- **No argument-building structure**: Cover letters are not essays. Avoid three-part parallels and thesis-evidence-conclusion rhythm per paragraph.

### Canonical Framings

> **FILL IN.** When you have a sentence that says something well and in your own
> voice, record it here verbatim and instruct the agent not to paraphrase it.
> Paraphrase is how a distinctive line becomes a generic one.
>
> Shape: *When writing about {recurring theme}, use this framing (your own
> words): "{the sentence}". Do not substitute.*

### Numbers & Contribution Honesty in Cover Letters
- **Same rules as CVs apply.** No internal counts, no target thresholds, no projected metrics. Only real outcome metrics that a recruiter can verify or contextualise externally.
- **Same verb ladder applies.** No "architected", no "built X" when you owned the product side. Use "drove the product side of", "owned use cases and interfaces for", "drove a major part of" consistently with how it reads in the CV. A cover letter that uses stronger verbs than the CV creates a discrepancy that careful readers notice.

## Application Answers & Hiring-Manager Messages (MANDATORY)

Applies to every short free-text field in an application: form questions ("Why us?", "What excites you about this role?") **and free-form "message to the hiring manager" boxes**. A blank message box is still a prompt to answer, not a blank canvas.

**Answer first. Always.** Structure is:

1. **Direct answer** (1 sentence) — answer the literal question immediately, naming the specific scope or product from the posting.
2. **Supporting context** (1 paragraph) — one claim from his experience, with concrete detail. One claim, not three.
3. **Conclusion** (1-2 sentences) — land it, ideally tying back to the opening.

**Current scope, credentials, and product description are supporting context, never the opening.** Opening a message with "I lead X at {Employer}, which includes A, B and C" is scene-setting. Say what you want and why, then prove it.

Target 150-180 words unless the form states a limit or he asks for short. All cover-letter LLM pattern bans apply here too.

**This differs from cover letters,** which lead with something at stake rather than a direct answer. Do not merge the two rules.


## Your Target Roles

> **FILL THIS IN.** Archetypes are the backbone of the whole system: the scanner
> matches on them, evaluation scores against them, and CV tailoring pulls proof
> points per archetype. Name two to four. Fewer than two and the scoring cannot
> discriminate; more than four and every role matches something.

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **{Archetype 1}** | {the two or three themes that recur in these postings} | {the outcome an employer is hiring for, in one sentence} |
| **{Archetype 2}** | | |
| **{Archetype 3}** | | |

Keep "what they buy" written from the employer's side, not yours. It is what
makes the archetype usable for scoring a posting you have never seen.

## Strategic Preferences

- **Scoring Focus:** state what you optimise for when two roles are close. Role match and company quality, or comp, or location, or stage. Pick an order and keep it.

### Location Tiers

Tier values, the precedence rule and the out-of-scope rule live in
`config/profile.yml` under `location.tiers`, which is also what `scan-core.mjs`
reads. Read them there. Restating the table in prose is how the two copies drift
apart.

What the table cannot express, and what belongs here:

**Tier feeds the Location component of Opportunity only.** It does not gate
evaluation. Every tiered role still gets scored and reported.

> **FILL IN:** any tier that is a personal preference rather than a market fact,
> and say so explicitly. A tier set by taste should not be argued away later
> because the pay is strong or the JD is in your language.

### Compensation Is Location-Indexed (MANDATORY)

Canonical values live in `config/profile.yml` → `compensation.floors_by_region`.
Your minimum is a number for **one region**, never a global one. Set the index
so each band reflects what the role should pay where it sits.

Three rules carry most of the value here. They are method: keep them.

**The Comp component asks "is this good money HERE", not "does this reach my
headline number".** A role in a low-cost market that clears its regional floor
comfortably should score well. Judging it against your highest-cost floor
produces false skips, and has done so before.

**International pay scales override the index.** A remote-first employer paying
one global band, or an EOR arrangement on a higher band, keeps the higher
baseline wherever the role nominally sits. Judge by the pay scale the posting
uses, not the office address.

**Do not double-penalise.** A location can sit low on *preference* while its
comp is still indexed normally. Tier and comp are separate axes, the same way
tier and work authorization are.

### Title and Function: Comp-for-Region Can Outweigh Them

A role that reads as coordination, or carries a title below your target level,
is **not** an automatic skip when compensation is strong for its region. Score
the function honestly in Fit, then let good regional comp carry Opportunity
rather than treating the title as disqualifying.

This narrows any "no real ownership" deal-breaker: it still fires for pure
delivery roles with no ownership anywhere in the posting, but a hybrid role
paying well locally goes to **manual decision**, not auto-skip.

### Work Authorization Is a Separate Axis (MANDATORY)

**Never collapse location tier into work authorization.** Tier answers "do I
want to be there". Work authorization answers "can they actually hire me". A
country can be highly desirable *and* require sponsorship; those facts belong in
different scores.

> **FILL IN:** where you can work with no restriction, and where you need a
> permit or sponsorship.

Assess sponsorship **per posting**, not by blanket rule: does the employer state
sponsorship, do they have a local entity, do they hire through an EOR? Apply a
hard visa penalty only when the posting itself demands authorization you do not
hold. A desirable location never implies an easy hire, and an undesirable one
never implies a visa problem.

> **FILL IN, if it applies:** any country where a residency or citizenship
> process in progress justifies a softened visa penalty rather than the full
> one. Say what the process is and roughly when it completes.

## Archetype Priority & Scoring Weights

> **FILL THIS IN.** Weights express which archetype you actually want, not which
> you are most qualified for. Those differ, and conflating them is how a search
> drifts toward the past.

| Archetype | Weight | Priority |
|-----------|--------|----------|
| {Archetype 1} | 1.3 | Primary — {why} |
| {Archetype 2} | 1.2 | Strong secondary — {why} |
| {Archetype 3} | 0.7 | Tertiary — {why} |

Co-primary archetypes must score as peers. A role that matches one strongly
should never be down-ranked for failing to use the other's vocabulary.

### North Star Alignment — Calibration Rule (MANDATORY)

**Promote matches, don't punish mismatches.** The scoring signal comes from
elevating archetype-matched roles, not from bottoming out domain mismatches.
This rule is method, not preference: keep it.

| Role type | North Star floor |
|-----------|-----------------|
| Strong archetype match | 4.0-5.0 |
| Adjacent domain | 3.2-3.8 |
| Legitimate role in your function, domain mismatch | 3.0-3.2 |
| Wrong function, or a hard blocker | < 2.5 → AUTO-SKIP |

**Floor rule:** alignment never drops below 3.0 for a legitimate role in your
own function, even on a full domain mismatch. The guard "Fit < 3.0 → Priority
≤ 3.0" fires only for wrong-function roles and hard blockers.


## Deal-Breakers & Soft Signals

> **FILL THIS IN.** Be strict about what belongs here. A hard deal-breaker skips
> evaluation entirely, so a wrong entry makes roles invisible without ever
> telling you. If you would look at it on a good day, it is a soft signal.

### Hard Deal-Breakers (auto-SKIP, do not evaluate)
- {function you will not take}
- {language you do not have at working level}
- {company stage or size that never works for you}

### Soft Signals (downgrade Priority, but still evaluate)
- {domain that bores you}
- {company shape that usually disappoints}

### Local-language requirements (method, keep this)

Two failure modes, in opposite directions. Both have produced real mistakes.

**A posting silent on language is not proof the role is English-speaking.**
Employers whose product or customers are local-language often post in English
with no language line, and the requirement surfaces after you have built a CV.
When the employer's market is local-language, check the careers page or the
local-language version of the posting before investing, and note the residual
risk in the report.

**When the posting states a language line, take it at face value.** "Excellent
English, {local language} a plus" means it is a plus. Do not infer a hard
requirement from the language the posting happens to be written in. Score the
practical day-to-day risk as a gap in Odds and say so. That inference has
produced false skips.


## Company Tier Preferences

> **FILL THIS IN.**

**Target:** {stage, culture and company shape you want}

**Avoid:** {the shape that looks right on paper and is wrong in practice}


## Proof-Point to Archetype Map

> **FILL THIS IN, and keep it current.** This is the single highest-leverage
> table in the file. Evaluation uses it to judge Fit, CV generation uses it to
> pick which work leads, and the interview modes use it to choose a story. Each
> row is one piece of work you can defend three questions deep.

| Proof point | Primary archetype | Secondary |
|---|---|---|
| {project, and where you did it} | {archetype} | {archetype} |
| | | |

Add a row whenever a new piece of work becomes defensible. Remove one when you
can no longer answer follow-up questions about it.

## Tracker Management (MANDATORY)

### Mechanics live in CLAUDE.md
The two-file split, the 12-column schema, the status emojis, the sort order and
the merge/archive/retire scripts are all specified in `CLAUDE.md`. Do not
restate them here — a second copy drifts, and the copy that used to live in this
file had gone stale against `sort-tracker.mjs`. This section covers judgment
only: which roles get effort, and how they are scored.

### Adding New Roles
1. Score using your archetypes from the Target Roles table above
2. Apply the effort-lane rule below
3. Carry the posting's own publication date into the notes as `Posted YYYY-MM-DD`. The scanners capture it into `data/pipeline.md`; it must survive promotion, because the unapplied queue ranks on it

### Effort Lanes — the apply decision (MANDATORY)

> **CALIBRATE THIS.** The numbers below are a starting default, not a finding.
> Once you have roughly 20 recorded conversations in `data/outcomes.tsv`, run
> `node analyze-scoring.mjs` and replace them with your own. Record the date and
> the sample size you calibrated against, so the next revision knows what it is
> overriding.

| Priority | Lane | What gets produced | Measured contact rate |
|---|---|---|---|
| ≥ 4.0 | **Full effort** | Tailored CV, cover letter, researched comp number, form answers | _(not yet measured)_ |
| 3.5-3.9 | **Light effort** | Base CV, no cover letter, no comp research | _(not yet measured)_ |
| < 3.5 | **Do not apply** | Nothing. Requires an explicit override, stated in the tracker notes | _(not yet measured)_ |

**Default gate is 4.0.** Start strict. A gate is far easier to loosen once you
can see what the lower lane actually returns than to tighten after months of
volume. When your own data says otherwise, move it and write down why.

**Never generate a CV for a below-gate role without asking first.** State the
score, state that it is below the gate, and wait.

**Do not rank inside a lane by score.** Once a role is over the gate the
decimals rarely carry information, and ranking on them buries fresh postings
under stale high scorers. Rank by what decays: posting freshness first, then
applicant count where the posting shows it. `sort-tracker.mjs` does this
automatically for the unapplied group.

### Scoring Criteria

Three scores are produced per evaluation. The **Priority** score goes in the tracker.

| Score | Meaning (Fit) | Meaning (Odds) | Meaning (Priority — apply?) |
|-------|--------------|----------------|----------------------------|
| 5.0 | Every required qualification met | No gaps, no blockers | Must apply — prestigious + perfect fit |
| 4.5–4.9 | All required met, some preferred missing | Minor soft gaps only | Apply immediately |
| 4.0–4.4 | All required met, several preferred missing | 1–2 soft gaps | Worth applying |
| 3.5–3.9 | One required qualification missed | Significant gaps | Apply, light effort only |
| < 3.5 | Two or more required missed, or a hard blocker | Multiple gaps or hard blocker | Do not apply without an override |

### Fit — score the requirements, not the vibe (MANDATORY)

Fit answers one question: **would a recruiter reading the requirements section see a qualified candidate?** It is not a measure of how interesting the role is, how well the archetype matches, or how good the story would be. Those belong to Opportunity and Priority.

Rules:

- Score Fit **only against the JD's stated REQUIRED qualifications.** Preferred, nice-to-have and bonus lines never raise Fit above what the required list supports; they can only break a tie inside a band.
- **A missed hard requirement caps Fit at 3.0.** Two or more caps it at 2.5. A hard requirement is one the posting states as a number, a credential, or a non-negotiable ("5+ years owning X", "fluent German", "must hold Y"). Transferable-experience language in the posting softens this to a −0.5 penalty instead of a cap.
- Name every required line you are failing in the report, with the exact wording. A Fit score with no named gaps is not a score, it is an impression.

**Why this changed.** Measured 2026-08-10: Fit averaged 3.97 across 174 applications with a standard deviation of 0.47, so nearly every evaluated role scored about 4. It had no spread, and once Odds was known it added no predictive value at all (within odds < 3.5, high-Fit roles did marginally *worse*). A score that reads 4.0 for everything is a constant. Scoring against the required list is what makes it a variable again.

### Salary Anchoring
- Use previous negotiation data from the same company to inform salary expectations
- Reference prior offer/range negotiations when setting expectations for similar roles at the same company

### Status and sort order
See the Status Emojis and Sort Order sections of `CLAUDE.md`, and
`templates/states.yml`. Emoji only, never the word. Re-sort with
`node sort-tracker.mjs` after every change, and never hand-edit `✅` to `👻` —
that is what `node retire-stale.mjs` is for.

### After Applying
When application is submitted:
1. Update Status: (empty/Pending) → `✅`
2. Add Output folder link if `output/{company-slug}/` exists
3. Add Report link if evaluation report exists

## Apply Trigger — "Applying to [Company]"

When user says they want to apply to a company, execute this workflow:

### Step 1: Check
1. Check `data/applications.md` AND `data/applications-archive.md` — is the entry present in either? A prior rejection or skip lives in the archive and changes the answer
2. Check `output/{company-slug}/` — does CV exist?
3. If this is 2nd+ role at same company: reuse existing CV (don't regenerate)

### Step 1b: Confirm CV Status
- If user says "only cover letter needed" or "CV is done" → confirm and skip CV step
- Don't regenerate CV without asking

### Step 2: Generate CV Immediately
- Create `output/{company-slug}/{Your Name} - {Standard Title}.md`
- Tailor to JD using archetypes and adaptive framing
- Generate PDF from MD
- **Do not wait for user confirmation on CV**
- **Include the job posting URL in the response** (see "Always Return the Job Link")

### Step 3: Cover Letter Phased Workflow
**Phase 1: Ask Clarifying Questions**
- "Want a cover letter for this role?"
- If yes, ask about:
  - Why this company specifically?
  - Personal stake/motivation
  - Most interesting aspect of the role
  - Any prior relevant experience
  - Transition angle

**Phase 2: Propose .md Text**
- Draft cover letter as .md file first
- **Always run humanization** before saving
- Show user the .md content for review
- Wait for user confirmation before proceeding

**Phase 3: Generate PDF After Confirmation**
- Only generate PDF after user explicitly confirms .md content is good
- Do NOT generate PDF automatically

### Step 4: Update Tracker
- Status: `Pending` → `Applied` (or add new entry if missing)
- PDF: `✅` (CV done)
- Add Report link if evaluation report exists

### Step 5: Confirm Before Submission
- Show user the files
- Let them review CV and cover letter
- Wait for explicit "applied" confirmation before marking done

## Adaptive Framing

> **FILL IN.** One row per archetype. This is what the agent consults when the
> same career has to be presented three different ways without inventing
> anything.

| If the role is... | Emphasize about you... | Proof point sources |
|-------------------|------------------------|---------------------|
| {Archetype 1} | {the three or four themes that lead for this archetype} | cv.md + article-digest.md |
| {Archetype 2} | | cv.md + article-digest.md |
| {Archetype 3} | | cv.md |

## PDF Generation Requirements

When generating tailored CVs:

1. **article-digest.md is REQUIRED** — Read it for exact product names and metrics:
   - Use exact names: "Agent Gateway" not "AI assistant"
   - Include thresholds: ">20% tool-call target", ">80% accuracy"
2. **Mirror JD language** — If JD says "bias toward building and iterating quickly", reflect that in closing summary
3. **Source proof points** — Use specific achievements from article-digest.md, not generic descriptions


## Your Exit Narrative

> **FILL THIS IN.** You will be asked why you are leaving in almost every first
> call. Write the answer once, honestly, and keep it to three sentences. A
> narrative invented live sounds invented.

{Why you are leaving, what you are moving toward, and what you are not willing
to repeat. Forward-looking, never bitter, and true.}

## Your Cross-cutting Advantage

> **FILL THIS IN.** The one thing you have that most candidates for these roles
> do not. Not a skill list: a claim you can defend with the proof points above.

{One or two sentences.}

## Application Form Free-Text Answers (MANDATORY)

Covers the open box at the end of an application form when there is no cover letter upload and no "other documents" field: "Anything you would like to share with us?", "Why do you want to work here?", "Tell us anything else", "Message to the hiring manager". These are prompts to answer, not blank canvases.

### Structure: role, then company, then background

Three beats, always in this order.

**1. Role — why this is interesting to me.**
What in the actual job pulls him toward it. Name the specific surface, product, or problem from the posting. Anchor it to what he wants from his career, not to what the company needs. Concrete: interesting problems, the kind of user, the technical surface, the scope on offer.

**2. Company — why this company is relevant to me.**
The space they operate in, the problem they are solving at large, why that space still matters in five years, and anything specific they are doing that he has an opinion about. This beat is what stops the answer from being paste-able into a competitor's form.

**3. Background — how my experience supports it.**
Either the exact items that map to the role, and why each one is relevant, or the closest adjacent work when there is no exact match. Say which of the two it is. Never inflate adjacent into exact.

### Rules

- **150-180 words of body**, unless the form states a limit or the user asks for shorter. Same target as the answer rule above.
- **Beat 1 opens with the interest itself.** No warm-up sentence, no general principle, no industry observation, no description of your current scope. Current scope is beat 3 material.
- **One claim per beat.** A second supporting example belongs in the interview, not the form.
- **Never concede a stated must-have gap here.** Free-text boxes are read before anyone has met him. Hold the gap for the recruiter call. This overrides the "name a real gap" line in the general answer rule, which applies to direct questions such as "why are you a fit".
- **Practical closers are exempt from the three beats.** A relocation, visa, notice period, or time zone line can sit after beat 3 as a flat one-liner when the posting's location requires it.
- **Source the material from the evaluation report**, Block E for the angle and Block F for the story. Do not invent a new framing that the CV does not support.
- All Cover Letter Rules for tone and LLM pattern bans apply, along with the no-dash rule and the humanization pass.

### Where it lives

Save every one to `output/{company-slug}/application-answers.md` with the posting URL and date in the header, one `## Q:` heading per field.
