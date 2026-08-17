# Mode: interview-debrief — After the Call

Run this whenever the user shares an interview transcript, a recording, or their own account of how a call went. Also run it when they report feedback from a company, with or without a transcript.

The rules themselves live in `interview-prep/interview-feedback-log.md` under "Two standing rules for every interview transcript". Read that file first. This mode exists because nothing previously routed a transcript to it, so the rules were followed only when someone remembered them.

---

## Step 1 — Sweep for intel, before analysing performance

**Do this as a distinct pass, and do it first.** The analysis instinct goes straight to delivery, and the intel dies with the transcript.

A transcript is the only place the user tells his own stories out loud, unrehearsed. Those tellings contain named counterparty arguments, costs, metrics and honest codas that are written down nowhere else. The 2026-08-06 Constructor call is the proof: three depth-2 and depth-3 facts about a story already in the bank were said out loud and existed nowhere in the corpus.

Use the routing table in the feedback log. In summary: new story beats and metrics go to `interview-prep/story-bank.md`; stated preferences, deal-breakers and working principles go to `config/profile.yml` or `modes/_profile.md`; company facts and on-the-record commitments go to that company's prep doc and the tracker note.

**Report what was harvested and where it went.** When a transcript yields nothing new, say so explicitly rather than staying silent.

---

## Step 2 — Grade the delivery A to F

Seven dimensions plus an overall grade, using the rubric and the band definitions in the feedback log: opening, compression, question fidelity, decision visibility, calibration, questions asked, signals received.

- **Grade honestly, including when the outcome signals were good.** A call can produce warm reactions and real intel and still be a C on delivery. Those are different measurements
- **Name the specific moment behind each grade.** Never score in the abstract. "C on compression" is useless; "C on compression, the platform answer ran four minutes and got cut off" is the finding
- Never substitute a table of answer durations for a grade. That measures one failure mode and misses question substitution and over-disclaiming

---

## Step 3 — Append to the record

Add an entry to `interview-prep/interview-feedback-log.md` under Entries, with the date, company, stage, interviewer, and how the transcript was obtained (full transcript, interviewer audio only, or reconstructed from the user's account).

Then re-derive the synthesis. Four rejections have already converged on one finding, and the value of the log is the trend, not the individual entries. If a new entry moves the pattern, say what changed.

---

## Step 4 — Update the record elsewhere

1. **Tracker.** Update the row's status, and record what stage the process reached
2. **`data/outcomes.tsv`.** Any call with a human is a real response and needs a row: first-contact date, stages passed, furthest stage from the ladder in `templates/states.yml`, outcome, stated reason. The tracker's `❌` collapses "rejected at the CV screen" and "rejected after four rounds" into the same symbol; this file is the only place the depth is recorded
3. **Rejection feedback is the highest-value input in the whole system.** When a company states a reason, record the exact words in the log. Paraphrase loses the diagnosis

---

## Rules

- The sweep comes first. Performance analysis without the sweep is a partial job, and the user should be told when only half ran
- Do not tell the user a delivery problem is "delivery, not seniority". He has pushed back on that framing and he is right: clarity, prioritization under time pressure and customer framing **are** senior competence. From the interviewer's chair, unheard judgment is indistinguishable from absent judgment
- Recommend out-loud timed drills over further reading. See `interview-prep/voice-drill-briefing.md`
- No em dashes, en dashes or double hyphens in generated content
