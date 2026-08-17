# Mode: postmortem — Session Analysis

After each application session (evaluate → report → CV → cover letter), run this analysis to identify patterns and optimize agent instructions.

## When to Use

Trigger with `/job-hunt postmortem` after:
- A full pipeline execution (JD → evaluation → PDF → cover letter)
- Multiple feedback iterations on the same application

## Analysis Steps

### 1. Identify User Feedback

Review conversation for:
- Explicit corrections ("never say JD", "Portfolio Management is redundant")
- Implicit preferences (what they asked about, what they changed themselves)
- Quality signals (what worked, what needed iteration)

### 2. Compare Against Existing Rules

For each piece of feedback:
1. Check if it's already covered in `modes/_shared.md` or `modes/_profile.md`
2. If NOT covered → this is a new rule to add

### 3. Document New Rules

Add to the appropriate file:

| Rule Type | Add To |
|-----------|--------|
| CV content/format | `modes/_profile.md` (under CV Rules) |
| Cover letter style | `modes/_profile.md` (under Cover Letter Rules) |
| Pipeline/tool behavior | `modes/_shared.md` (under Tools or PDF Pipeline) |
| New command | `.claude/skills/job-hunt/SKILL.md` |

### 4. Pattern Detection

Look for recurring themes:
- **Vocabulary avoidance**: Words that sound generated ("JD", corporate-speak)
- **Content preferences**: What they add/remove in their own edits
- **Formatting rules**: Specific layout or structure preferences
- **Tool quirks**: PDF generation, humanization, etc.

## Output Format

Provide a summary:

```markdown
## Session Analysis: {company} {role}

### Feedback Identified
| Feedback | New Rule? | Add To |
|----------|-----------|--------|
| "Portfolio Management redundant" | ✅ Yes | _profile.md (CV Rules) |
| "Don't say JD" | ✅ Yes | _profile.md (Cover Letter) |
| {Employer} subtitle fix | ✅ Yes | _profile.md (Naming) |
| Humanization | ❌ Already covered | - |

### Pattern Detection
- Generated language triggers: "JD", corporate phrasing
- CV content preferences: concise product subtitles
- Tool behavior: PDF regeneration after MD edits

### Changes Made
- Added: Skills rule, JD avoidance rule, PDF pipeline note
- Updated: {Employer} product subtitle in cv.md

### Suggested Follow-ups
- Check other existing CVs for same issues
- Test new rules in next session
```

## Common Feedback → Rule Mappings

| Feedback Pattern | Likely Rule Location |
|------------------|---------------------|
| "Never use [word]" | _profile.md → Tone/Word Choice |
| "[Something] is redundant" | _profile.md → Skills |
| "Always use [format]" | _profile.md → Naming/Formatting |
| "[Tool] needs [change]" | _shared.md → Tools/PDF Pipeline |
| "Generated sound" | _profile.md → Humanization |

## Notes

- If feedback IS already covered, acknowledge that in output (user may not have noticed)
- Focus on actionable rules, not just observations
- After adding rules, update the relevant source files (cv.md, templates, etc.) if needed