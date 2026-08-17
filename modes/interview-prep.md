# Mode: interview-prep — Company-Specific Interview Preparation

Run this when the user asks to prep for an interview, or when a tracker row moves to `🎯`.

This mode produces **strategic-conversation prep**, not a Q&A drill. Senior PM interviews test product judgment, market read and competitive taste. A list of Glassdoor questions with model answers is the wrong artifact and has never been what this project produces.

---

## Required reading, before writing a single line

Skipping these is the documented failure mode. An agent once wrote Datadog prep without opening the playbook and missed material the playbook already contained.

| File | Why |
|---|---|
| `interview-prep/seniority-playbook.md` | **Read first, every time.** Cross-company reference: the depth-1/2/3 probe mechanic, the four probe domains, the interviewer role map, the company-context lens, the objection counters, the story-to-probe map, and the answer architecture. Pull the role map for this specific stage and the context lens for this company type |
| `interview-prep/interview-feedback-log.md` | What actually went wrong in previous calls, and the standing rules for transcripts |
| `interview-prep/story-bank.md` | Existing STAR+R stories and which probe each one leads |
| `reports/{###}-{company}-*.md` | The evaluation: archetype, gaps, matched proof points, comp |
| `interview-prep/` (rest) | Existing docs for **this** company. Do not duplicate them. Position the new doc and demote the old ones explicitly |
| `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md` | Proof points and candidate context |

Cross-link the playbook from the new doc's companion-docs line.

---

## Step 1 — Choose the prep type

Three types. They are not interchangeable, and picking the wrong one wastes the runway.

| Type | Use when | Weighting |
|---|---|---|
| **A. Strategic prep doc** | The interviewer is known and the domain is familiar. The default for recruiter, hiring-manager, VP, panel and exec stages | Positioning and delivery |
| **B. Hiring-manager mastery doc** | A technical-platform company where the candidate is entering a partly new domain, and the hiring manager is known | 70-80% mastery, 20-30% prep |
| **C. Domain mastery guide** | A week or more of runway and the person or panel is **not yet known** | A study curriculum, built ground-up from zero |

Type C comes first when the runway is long; type A still follows later, once the interviewer is known. Override the choice only if the user explicitly asks for a Q&A drill.

---

## Type A — Strategic prep doc

Save to `interview-prep/{company-slug}-{stage-or-role}.md`.

Section spine. Reuse, expand or compress by stage, but never collapse the strategic frame into a generic question list.

1. **How to use this doc** — relationship to companion docs
2. **Company snapshot and thesis** — funding, stage, customers, founder pedigree, the "why now" for this hire
3. **Domain primer** — when the role assumes vocabulary the interviewer will not explain. Real explanation, not a glossary stub
4. **Product portfolio and strategic bets** — 2-4 bets with maturity and strategic role, plus where this hire likely lands
5. **Market and ICP** — two-buyer dynamics, switch triggers, where the company is structurally weaker
6. **Competitive map through a PM lens** — 4-7 competitors across positioning, pricing, differentiation, ecosystem posture; close with the 1-2 dominant narratives
7. **Pricing and business model** — pricing as a product decision, the central tension, the prioritization implication
8. **Acquisitions and strategic moves** — what it signals about the roadmap, mapped to specific proof points
9. **Strategic risks and open questions** — 5-7 the leader is genuinely worried about, never generic startup risks
10. **KPIs at this stage** — metrics mapped to bets, and what this hire might own
11. **Candidate angle** — honest fit ranking across the bets (strong / medium / stretch) with framing scripts
12. **Questions to ask** — grouped by theme; flag the single most important one to ask early
13. **Likely questions and how to handle** — the 6-8 most likely at this stage, including "what would you push back on"
14. **Story bank pulls** — question type → story to lead with → why
15. **Pre-call checklist** — day-before, hour-before, in-the-call

Length tracks stakes: roughly 300-400 lines for a VP or exec conversation, 150-250 for a recruiter or hiring-manager call.

---

## Type B — Hiring-manager mastery doc

The existing HR-prep doc usually covers behavioural ground already. This doc's job is **understanding**, not rehearsal.

**Required input first.** Ask for the hiring manager's full LinkedIn work-experience text if it is not fetchable. This is the highest-leverage input in the whole mode. The JD is marketing language; the LinkedIn arc reveals real team scope, what the manager cares about, and tone calibration. Without it the doc will misjudge the team boundary.

**Pre-write audits.** Do all four explicitly before drafting:

1. **Assumed-knowledge audit** — every concept the doc references that the user may not natively know. Plan a primer for each: storage and data model fundamentals, query and execution engine concepts, SDK/driver/API vocabulary, adjacent product names, IaC and lifecycle tooling, company-invented acronyms
2. **Overlap questions** — the 3-5 likeliest "what is the difference between X and Y" questions for the company's surfaces. Pre-answer as small comparison tables
3. **Competitive-frame shifts** — where the competitive set changes depending on which product is being positioned. Call these out explicitly
4. **Recent-news scan** — last 90 days: release notes, exec quotes, summit announcements, repo activity. Weave in-section, never as a standalone news block

**Structure.**

- **Part A, orientation:** how to use this doc; hiring manager profile (full career arc, what each chapter says about how they think, tone calibration)
- **Part B, fundamentals:** 90-second history; technology in plain English; pre/post pivot story; financials and operating context
- **Part C, portfolio:** company portfolio map with team ownership signals; **the manager's team, one subsection per surface** — this is the centrepiece
- **Part D, strategy:** threads connecting the surfaces; open-source and standards posture; market and ICP; competition through the lens of the manager's surfaces
- **Part E, the role:** what the PM job actually looks like day to day; KPIs and the business-metric connection
- **Part F, selling yourself:** proof-point map; what the manager likely cares about; the N-minute playbook; pre-call checklist

Each surface in Part C gets: what it is, persona, where it sits in the dev journey, recent updates, friction points, the comparable competitor surface, and **one opinion the candidate is prepared to defend**.

Scale with portfolio scope. Seven surfaces ran to roughly 620 lines. Do not pad.

---

## Type C — Domain mastery guide

A study curriculum that raises real knowledge, built from zero regardless of stated experience.

- **Mental map first** — show how every study area is one layer of a single stack
- **One section per knowledge area**, each opening with a "what mastery looks like" line pitched at depth 3: name the alternatives, name the costs, name what would change your mind
- **Curated real materials**, each tagged **GO-TO** (canonical, consume fully) or **EXAMPLE** (one instance of a genre, find more like it), plus **[DO]** hands-on exercises that are feasible on a MacBook with Claude Code
- **Per area: an opinion to hold, and the steel-man of the opposite.** That pair is what survives a depth-3 probe
- **A build-track project** threading the areas together, a day-by-day plan, and a self-test of depth-3 questions

Research with parallel agents returning verified primary sources. Front-load the biggest stated gap. Date fast-moving material and flag a re-check for the week of the interview.

---

## Step 2 — The delivery contract

Every prep doc, of every type, restates this. It is the difference between prep that works and prep that adds content to a problem that is not content.

**Four companies have now rejected after crediting the technical depth.** The judgment is real and the transmission is broken. Producing more material is the wrong direction.

**The canonical structure is the six-beat answer in `interview-prep/seniority-playbook.md` section 13.** Do not invent competing structures, and do not paraphrase it into a different beat count. Beats 1 (principle) and 2 (customer) are the ones that collapse under pressure, because both feel like preamble. They are not: beat 1 is the differentiation, beat 2 is the thread.

Two rules that carry most of the weight:

- **Never open an example with a system, a product state or an org size.** For internal platform work, "internal engineering teams, not customers" is correct precision and must not become permission to skip the human
- **Put the rejected option in the same sentence as the decision, unprompted:** "I chose X over Y." This single move forces the principle out front and fixes buried insight, activity-summary and length at once

**The recognition gap is pre-work, not live habit.** Decisions get stored as facts about the system ("we narrowed to GitHub Actions") rather than as choices against alternatives ("I said no to four approaches"). So the rejected-option beat is missing at the encoding level. Excavate the decision and its rejected alternative for each lead story before the call, using `interview-prep/rejected-option-excavation.md`.

**Push for reps over documents.** The playbook prescribed 90 seconds and named detail-flooding as an anti-signal before two of these rejections landed. It was never rehearsed out loud. When the choice is another prep doc or a timed recorded drill, recommend the drill and point at `interview-prep/voice-drill-briefing.md`.

---

## Step 3 — Research

Fill gaps the existing docs do not cover. Extract structured data, not summaries, and cite every claim.

Company strategy, product surfaces, recent moves, competitive position, and the interviewer's own background and public writing. Process mechanics (rounds, format, timeline) are worth capturing when findable, but they are the least valuable output here and must never become the document's spine.

- **Never invent a question and attribute it to a source.** Inferred questions are labelled `[inferred from JD]`
- **Never fabricate ratings, metrics or statistics.** Cite only verifiable sources and note the source inline. If the data is not there, write that it is not there
- If the company is small and yields little, say the intel is sparse rather than padding

---

## Writing rules

- **A PM-relevance line closes every technical concept.** One sentence on why it matters to the role. A floating fact is weaker than the same fact tied to scope
- **Bridge new concepts to what the candidate already knows** — Backstage, IDP, MCP, SCM connectors, CI/CD patterns, the Python ecosystem. The right analogy collapses three paragraphs into one sentence
- **One defensible opinion per product surface.** Senior interviews reward reasoned opinions, not recitation
- **Peer-level voice.** Write as if briefing a senior PM, not coaching a candidate
- **Specific over generic.** Every section names the actual company. If a paragraph would survive a find-and-replace of the company name, cut it
- **Honest about gaps.** Never paper over a weakness; the objection counters in the playbook exist for exactly this
- **No em dashes, en dashes or double hyphens** in generated content. Use commas, colons, parentheses. Final pass to strip them
- Generate in the language of the JD, English by default

---

## After delivering

1. Name the story gaps found in the story-bank mapping and offer to draft them
2. Recommend a timed out-loud drill over any further reading
3. If the domain research was thin, suggest `deep` mode
