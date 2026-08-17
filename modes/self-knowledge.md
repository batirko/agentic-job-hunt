# Mode: self-knowledge — Mastery Reference Report

Profile-wide, company-agnostic. Generates a self-audit and study reference the
candidate can review before any interview. Unlike interview-prep docs (which are
company-specific), this report maps the candidate's own knowledge landscape:
what they know deeply, what they know shallowly, and what a strong interviewer
would expose as a gap.

## When to run

Invoke when:
- The user runs `/job-hunt self-knowledge`
- cv.md has been updated
- A new entry reaches `Interview` status in `data/applications.md`
- A new interview-prep doc is added to `interview-prep/`

Always overwrite `interview-prep/self-knowledge-report.md` — the header timestamp is the version signal.

## Inputs (read all before generating)

| File | What you need from it |
|------|-----------------------|
| `cv.md` | Shipped work, experience timeline, verified metrics |
| `article-digest.md` | Detailed proof points with corrected verbs and number scope |
| `config/profile.yml` | Archetypes, target roles, narrative, superpowers |
| `modes/_profile.md` | Framing rules, contribution honesty rules, LLM bans |
| `interview-prep/story-bank.md` | Existing STAR+R stories — used for Section 6 coverage audit |
| `data/applications.md` | Active pipeline (status = 🎯 Interview) — used to prioritize Section 7 study plan |

## Output format

Write to `interview-prep/self-knowledge-report.md`. Use the structure below.

---

## Section 1: Domain Map

Produce a table with all domains from the candidate's history. Assign a confidence tier:

| Tier | What it means |
|------|--------------|
| **Deep** | Multiple shipped products with measurable outcomes; can discuss design tradeoffs, failure modes, and competitive landscape without preparation |
| **Solid** | At least one shipped product with outcomes; can handle most interview questions; known gaps exist but can navigate around them |
| **Shallow** | Adjacent experience or supporting contributor role; needs significant preparation for expert-level questions |
| **Emerging** | Intentional learning underway; can discuss the problem space but not implementation depth |

Table columns: Domain | Tier | Primary Evidence | Where It Appears in Job Market

---

## Section 2: Domain Deep Dives

For each domain at Solid tier or above, generate a block with five subsections:

```
### [Domain Name] — [Tier]

**What you've shipped**
Bullet list from cv.md + article-digest.md only. No generic claims.
If it is not in those files, it does not appear here.

**Core concepts and vocabulary**
8-12 terms an expert would use naturally. For each: one-sentence definition
in the candidate's own framing, not textbook definition. This is the study list.

**Likely interview questions**
3-5 questions a hiring manager in this domain would ask. Label each:
[tests depth] = you should know the answer cold
[tests judgment] = no single right answer, tests framework

**Knowledge gaps to close**
Honest audit of where a strong interviewer could probe thin. Label each:
[would block hire] / [would raise eyebrow] / [minor]
For each gap: one-line study prescription.

**Interview framing angle**
1-2 sentences: the narrative bridge for this domain. How to enter this
domain in an interview answer in a way that is accurate, confident, and
distinctive to this candidate's specific combination of experience.
```

---

## Section 3: Technology Audit

Table: Technology | Context (where used) | Confidence (1-5) | What Interviewers Probe | Risk Level (High/Medium/Low)

Confidence scoring:
- 5 = shipped production systems against this tech as PM
- 4 = worked with it meaningfully, understand the design tradeoffs
- 3 = used as consumer/user, can discuss at a conceptual level
- 2 = adjacent awareness, would not field detailed questions
- 1 = mentioned in passing, do not claim in interviews

Risk level = High if the technology commonly appears as a requirement in active pipeline JDs.

---

## Section 4: Cross-Domain Synthesis

### 4.1 Rare intersections
Identify 2-3 combinations of domains this candidate uniquely owns. For each:
- The intersection (Domain A + Domain B)
- Why it is rare in the PM market
- The evidence (specific shipped work)

### 4.2 Unique position sentence
One sentence that could open an interview answer to "what makes you different from other PMs with [primary domain] experience?" Grounded in the rare intersections above, not a generic "I'm a T-shaped PM" claim.

### 4.3 Interview framing
How to bring the cross-domain synthesis into answers without sounding like you're pivoting away from the role's domain.

---

## Section 5: Presentation Guide

### 5.1 Canonical metric language
List every verified metric from cv.md and article-digest.md as the exact phrase to use in interviews. Label each:
- [Verified] = appears verbatim in cv.md or article-digest.md
- [Derived] = honest calculation or approximation from the evidence; flag clearly when used

Never improvise these in interviews. Read this list before every call.

### 5.2 Phrases that signal expertise
Per domain: 2-3 phrases that a strong practitioner uses naturally and a weak practitioner wouldn't. Not jargon for its own sake — vocabulary that reveals you understand the problem deeply.

### 5.3 Things never to say
Specific overclaims, vague assertions, and known LLM patterns that would trigger skepticism in a technical interviewer. Derived from `modes/_profile.md` rules but reframed for verbal interviews.

### 5.4 Background questions to prepare for
3-4 questions an interviewer might ask about the non-obvious parts of the candidate's background (degree, career transition, location, timeline). For each: the honest framing, not a spin.

### 5.5 Opening 90 seconds
Two canonical versions of "walk me through your background":
- DevEx/Platform version (for IDP/DevEx/Platform PM roles)
- Technical AI PM version (for AI PM roles)
Each under 100 words. No LLM patterns, no essay openers.

---

## Section 6: Story Coverage Audit

Read `interview-prep/story-bank.md`. Identify standard behavioral interview themes:
- Conflict / stakeholder disagreement
- Saying no / prioritization under pressure
- Failure and learning
- Cross-org alignment
- Navigating ambiguity
- Data-driven decision (covered)
- Shipping something fast
- Influencing without authority

For each theme: is there a story in story-bank.md that covers it? If yes, note it. If no, identify the closest raw material from cv.md and write a one-line STAR+R sketch.

Table: Theme | Story in Bank | Strength (strong/thin/missing) | Gap Note

---

## Section 7: Gap Closure Roadmap

Synthesize the gaps from Sections 2 and 3. Cross-reference with active pipeline companies from `data/applications.md` (status = 🎯 Interview).

Table: Gap | Domain | Risk Level | Study Action | Time Est. | Priority Company

Order by: [would block hire] first, then [would raise eyebrow], then [minor]. Within tier, prioritize by whether the gap appears in active pipeline companies.

Each Study Action should be a specific, completable task — not "learn more about X".
