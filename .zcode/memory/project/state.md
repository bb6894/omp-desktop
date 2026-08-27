---
purpose: Current project state, active decisions, blockers, and position tracking
updated: 2026-07-20
---

# State

## Current Position

**Active Bead:** (none active)
**Status:** Ready for new work — install-integration harden designed, not implemented
**Started:** 2026-02-12
**Phase:** Scale

## Recent Completed Work

| Bead | Title                 | Completed | Summary                                           |
| ---- | --------------------- | --------- | ------------------------------------------------- |
| -    | Compaction + catalog limits (v1.7.15) | 2026-07-20 | Auto-compact before provider overflow; model limit migration |
| -    | Observation FTS5 path | 2026-07 | better-sqlite3 package + stale trigger drop + LIKE fallback |
| -    | Polish phase tasks    | 2026-02   | Error handling, docs, validation, UX improvements |
| -    | Extend phase commands | 2026-02   | Ship, plan, resume, handoff, status commands      |
| -    | MVP core features     | 2026-02   | Init command, template bundling, CLI prompts      |

## Active Decisions

| Date       | Decision          | Rationale                                  | Impact                          |
| ---------- | ----------------- | ------------------------------------------ | ------------------------------- |
| 2026-07-20 | Observation FTS5 ≠ Codebase-Memory graph | Agent "FTS5 index" complaints after install were MCP skip/strip + empty index, not broken better-sqlite3 | Future install harden; dual-stack docs in gotchas |
| 2026-07-20 | Queue non-destructive `--skip-*` | Skip currently strips healthy starterkit MCP entries on reinstall | Roadmap Scale item before code change |
| 2026-02-12 | Scale phase focus | Core complete, ready for advanced features | Plugin system, custom templates |

## Blockers

| Bead | Blocker | Since | Owner |
| ---- | ------- | ----- | ----- |
| -    | (none)  | -     | -     |

## Open Questions

| Question                         | Context                        | Blocking | Priority |
| -------------------------------- | ------------------------------ | -------- | -------- |
| What plugin system architecture? | Scale phase planning           | Yes      | High     |
| How to handle custom templates?  | User-defined templates feature | Yes      | High     |

## Context Notes

### Technical

- Node.js runtime required (>= 20.19.0)
- TypeScript strict mode enforced
- Build uses tsdown + rsync to bundle .zcode/ template
- oxlint for linting (fast, modern)

### Product

- Target: solo developers and teams
- Key differentiator: validated, ready-to-use templates
- Integration with beads_rust for task tracking

### Process

- Run `npm run lint:fix` before commits
- Validate with `npm run typecheck`
- Never modify dist/ directly

## Next Actions

1. [ ] Define plugin system architecture
2. [ ] Design custom template API
3. [ ] Create Scale phase implementation plan
4. [ ] Identify Scale phase beads

## Session Handoff

**Last Session:** 2026-02-12
**Next Session Priority:** Define plugin system architecture
**Known Issues:** None currently blocking
**Context Links:**

- AGENTS.md - Project rules
- .zcode/skill/ - Available skills
- .zcode/command/ - Available commands

---

_Update this file at the end of each significant session or when state changes._
_This file is the "you are here" marker for the project._
