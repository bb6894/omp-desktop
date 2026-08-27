---
purpose: Native ZCode automation recipes for recurring project maintenance
updated: 2026-08-07
---

# Automation Recipes

This file defines intent, cadence, permission level, and approval gates. Native ZCode automations own actual schedule, recurrence, dispatch count, and run history. Manage them with `/loop`.

## health-sweeper

- body: `/health`
- schedule: every weekday at 09:00 (`0 9 * * 1-5`)
- level: L1 (read-only report)
- gate: none; never change files, Git, or external services
- prompt: Run the complete `/health` command for the current workspace. Inspect configured starterkit resources and report actionable drift with evidence. Do not mutate files, install tools, commit, push, or publish.

## weekly-gc

- body: `/gc`
- schedule: every Friday at 15:00 (`0 15 * * 5`)
- level: L1 (report-only dry run)
- gate: user approval before any cleanup edit, commit, or PR
- prompt: Run the diagnostic and prioritization phases of the complete `/gc` command for the current workspace. Report P0-P3 findings and proposed cleanup tasks. Do not edit files, commit, push, open a pull request, or delete anything.

## ship-loop

- body: `/lfg <bead-id>`
- schedule: on-demand
- level: L2 (local implementation allowed)
- gate: user approval at every commit, Bead closure, push, PR, deploy, or other external action
- prompt: Replace `<bead-id>` with an explicitly provided Bead ID, then run the complete `/lfg` composition in the current workspace. Honor all canonical command checkpoints. Stop before any commit, Bead closure, push, pull request, deploy, or external publication unless the user has approved that specific action.

## Recipe Rules

- Use five-field cron in the user's local timezone.
- Keep scheduled prompts self-contained; they cannot depend on prior conversation.
- Reuse canonical commands or skills as bodies; never copy their internals here.
- Start code-changing automation at L1 or L2. L3 requires explicit authorization.
- Use `/loop list` to inspect native state. Do not add timestamps or execution logs to this file.
