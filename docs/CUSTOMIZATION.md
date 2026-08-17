# Customization Guide

## Profile (config/profile.yml)

This is the single source of truth for your identity. All modes read from here.

Key sections:
- **candidate**: Name, email, phone, location, LinkedIn, portfolio
- **target_roles**: Your North Star roles and archetypes
- **narrative**: Your headline, exit story, superpowers, proof points
- **compensation**: Target range, minimum, currency
- **location**: Country, timezone, visa status, on-site availability

## Target Roles (modes/_profile.md)

The archetype table in `_profile.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
4. **tracked_companies**: Companies to check directly

## CV Template (templates/cv-template.html)

The HTML template uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

To customize fonts/colors, edit the CSS in the template. Update font files in `fonts/` if switching fonts.

## Negotiation Scripts (modes/_shared.md)

The negotiation section provides frameworks for salary discussions. Replace the example scripts with your own:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses

## Hooks (Optional)

Career-ops can integrate with external systems via Claude Code hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Career-ops session started'"
      }]
    }]
  }
}
```

Save hooks in `.claude/settings.json`.

## States (templates/states.yml)

The canonical states rarely need changing, and adding one is more work than it
looks: the emoji/alias map is duplicated across four JS files and the Go
dashboard. Only `analyze-patterns.mjs`, `followup-cadence.mjs`, `retire-stale.mjs`
and `sort-tracker.mjs` read `states.yml` at runtime (via `states-core.mjs`);
everything else carries its own copy. If you add a state, update all of these:

**Definition**
1. `templates/states.yml` — the canonical entry (id, label, aliases, emoji, dashboard_group)
2. `states-core.mjs` — `FALLBACK_STATES`, and `classifyOutcome` if the state needs its own outcome bucket

**Scripts** (each has an independent hardcoded copy)
3. `sort-tracker.mjs` — add the canonical id to a group in `GROUPS` (and pick its `by` rule: `priority` for decision queues, `date` for chase queues), or the state silently lands in "unapplied". `test-all.mjs` §3b fails on any state with no group
4. `merge-tracker.mjs` — `STATUS_EMOJIS`, `STATUS_ALIASES`, the `isStatus` regex
5. `verify-pipeline.mjs` — `STATUS_EMOJIS`, `CANONICAL_STATUSES`, `ALIASES`, and `APPLIED_STATUSES` if the state implies an application was sent. **This is the CI gate**: an unregistered status makes `test-all.mjs` exit 1
6. `normalize-statuses.mjs` — `EMOJI` and the `labels` map
7. `dedup-tracker.mjs` — `STATUS_RANK` (decide where it sits in the advancement order)
8. `analyze-patterns.mjs` — `funnelOrder`, or the state is dropped from the printed funnel
9. `followup-cadence.mjs` — `ACTIONABLE_STATUSES` if follow-ups apply to it

**Dashboard (Go)**
10. `dashboard/internal/data/career.go` — `NormalizeStatus`, `StatusPriority`, the two active-app filters, the funnel numerator
11. `dashboard/internal/ui/screens/pipeline.go` — `statusOptions`, `statusGroupOrder`, `statusColorMap`, `statusLabel`

**Docs**
12. `CLAUDE.md` — §"Status Emojis" table and §"Sort Order"
13. `data/applications.md` — the preamble legend and sort-order line
14. `modes/tracker.md`, `modes/patterns.md`, `modes/followup.md`, `modes/_profile.md`

**Guard** — `test-all.mjs` scans every file above for each emoji in `states.yml`
and fails until they all agree.
