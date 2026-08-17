# agentic-job-hunt

An opinionated job search pipeline that runs inside [Claude Code](https://claude.com/claude-code).

It scans job boards for free, triages the results by reading titles, evaluates
the survivors against your actual background, writes tailored CVs and cover
letters, tracks every application, and tells you whether your scoring predicts
anything.

Forked from [career-ops](https://github.com/santifer/career-ops) and rebuilt
across roughly 350 applications and 270 evaluations.

## What is different here

| | career-ops | agentic-job-hunt |
|---|---|---|
| Tracker | one file | open rows and an archive, both read by analysis and dedup |
| Between inbox and evaluation | nothing | a triage layer that costs no tokens |
| Outcomes | status only | a separate record of how deep each conversation went |
| Apply decision | one gate | effort lanes, calibrated against your own results |
| Location | preferred hubs | tiers, kept strictly separate from work authorization |
| Interview prep | one intel doc | a seniority playbook, three prep-doc types, a debrief protocol |

The one that matters most is **outcomes**. A tracker status collapses "rejected
after the CV screen" and "rejected after four rounds" into the same symbol.
Recording them separately is what lets `analyze-scoring.mjs` tell you whether a
score you assigned before applying predicted anything at all. On the search this
was built from, the answer was mostly no, and finding that out changed the
strategy more than any feature did.

## How it works

```
scan          zero-token sweep of Greenhouse, Ashby, Lever, Comeet,
              Workable and public LinkedIn        →  data/pipeline.md
triage        title-only screening, still zero tokens
                                                  →  data/triage.md
evaluate      full A-G report against your profile →  reports/
apply         tailored CV, cover letter, form answers
                                                  →  output/{company}/
track         one row per role, open or archived   →  data/applications.md
calibrate     did the scores predict conversations? →  analyze-scoring.mjs
```

Scanning and triage never call a model, so the expensive step only ever runs on
roles that survived two free filters.

## Setup

You need Node 18+ and Claude Code. Go 1.21+ is optional, for the dashboard.

```bash
git clone https://github.com/batirko/agentic-job-hunt.git
cd agentic-job-hunt
npm install
npx playwright install chromium
```

Then open the folder in Claude Code and say `set me up`. The agent will walk you
through it. If you would rather do it by hand, read [docs/SETUP.md](docs/SETUP.md).

Three files decide how well this works:

1. **`cv.md`** is the source of truth for everything generated. Nothing is ever
   invented that is not in here.
2. **`config/profile.yml`** holds targets, location tiers and compensation
   floors by region. Copy it from `config/profile.example.yml`.
3. **`modes/_profile.md`** is the judgment layer: your archetypes, your
   deal-breakers, the boundaries of what you actually owned. Copy it from
   `modes/_profile.template.md` and fill in every block marked **FILL IN**.

The third one is the work. The template ships the method and leaves the identity
blank, because the identity is the part only you can write.

## The parts worth stealing even if you use something else

**Effort lanes.** Not every role above the bar deserves the same work. A gate
plus lanes lets you send a tailored package to the roles that justify one and a
base CV to the rest, without pretending the difference does not exist.

**Tier is not work authorization.** Where you want to live and where someone can
legally hire you are different questions. Collapsing them corrupts both scores.

**Comp is location indexed.** A role in a low cost market that clears its
regional floor is a good offer. Judging it against your highest floor produces
false rejections.

**The record is two files.** Split by whether a row can still change. The apply
queue is a handful of rows, and a few hundred closed ones on top make it useless
for the one question it exists to answer.

**Rejection feedback is the highest value input in the system.** Record the exact
words. Feedback across three or four processes tends to converge on one specific,
coachable thing, and the convergence is invisible from any single rejection.

## Interview preparation

The part that is hardest to rebuild from scratch, and the reason this fork
exists in the shape it does.

- **[seniority-playbook.md](interview-prep/seniority-playbook.md)** covers how
  seniority is actually detected: the depth-1/2/3 probe mechanic, the four probe
  domains, what each interviewer role is privately afraid of, how company type
  changes the game, and the six-beat answer architecture.
- **[modes/interview-prep.md](modes/interview-prep.md)** picks between three
  prep types, because a recruiter screen, a hiring-manager conversation in a new
  technical domain, and a two-week runway with no named interviewer are three
  different jobs.
- **[modes/interview-debrief.md](modes/interview-debrief.md)** runs after the
  call: sweep the transcript for material that exists nowhere else, then grade
  the delivery A to F across seven dimensions.

## Ethics

This is built for fewer, better applications, not for volume. The agent will
not submit anything on your behalf: it fills forms, drafts answers and generates
PDFs, then stops and waits for you. It argues against applying below your gate.
Every application a human reads costs someone's attention.

## License

MIT. Derivative of [career-ops](https://github.com/santifer/career-ops) by
Santiago Fernández de Valderrama, whose copyright is retained in
[LICENSE](LICENSE).
