---
purpose: Footguns, edge cases, and warnings discovered during development
updated: 2026-07-20
---

# Gotchas

Track unexpected behaviors, edge cases, and warnings here. Update when you hit something surprising.

## LLM Coding (Harness Problem)

The edit tool (`str_replace`) is the #1 source of failures in LLM coding. Models fail at reproducing content with exact whitespace/encoding, not at understanding tasks.

### Edit Tool Failures

- **Whitespace mismatch** — Tabs vs spaces, trailing spaces, line endings (CRLF vs LF)
- **Content changed** — File modified since last read
- **Multiple matches** — Same string appears twice, edit fails
- **Stale context** — Editing from memory instead of fresh read

### Mitigation Strategies

1. **Always read fresh** before editing — no assumptions
2. **Use LSP tools** to locate symbols precisely (goToDefinition, findReferences)
3. **Include unique context** — 2-3 lines before/after for uniqueness
4. **Prefer smaller files** — <400 lines reduces edit complexity
5. **Verify after edit** — read back to confirm success

### File Size Guidance

| Size          | Strategy                                   |
| ------------- | ------------------------------------------ |
| < 100 lines   | Full rewrite often easier than str_replace |
| 100-400 lines | Structured edit with good context          |
| > 400 lines   | Strongly prefer structured edits           |

**Use the `structured-edit` skill for reliable edits.**

### Context Hygiene

- Compress completed work phases before moving on
- Use `/dcp sweep` after a closed phase to remove stale noise
- Token budget: <50k start → 50-100k mid → >150k restart session
- Subagent outputs can leak tokens — compress completed phases and sweep stale subagent noise

## ZCode Config

- **Managed model metadata is canonical**: `vc-codex` model limits and modalities come from `baseline/config.json` and are replaced as a complete catalog during install/setup. Keep `limit.context` as the full OpenAI window, `limit.input` as the input ceiling, and `limit.output` as the generation ceiling; do not lower context to tune compaction.
- **`experimental` key invalid**: Not in schema. Remove if present.
- **`tools` key invalid**: Not in schema. Remove if present.
- **`formatter` valid but undocumented**: Works but missing from schema (schema incomplete).

## Memory System

- Subagents (explore, scout, review) should NOT write to memory - only leader agents
- Use `observation: false` and `memory-update: false` in agent configs to enforce

### Two different "memory" stacks (do not conflate)

| Stack | MCP / surface | Storage | Failure mode agents mislabel as "FTS5" |
| --- | --- | --- | --- |
| **Observation memory** | `zcode-starterkit-tools` (`memory-search`, hooks) | project `.zcode/memory.db` + `observations_fts` | real SQLite/FTS5 backend issues |
| **Codebase-Memory** | `codebase-memory-mcp` (`search_graph`, `trace_path`, …) | global `~/.cache/codebase-memory-mcp/` graph index | MCP unregistered, binary missing, or **never indexed** |

Fixes for observation FTS5 (`better-sqlite3`, stale-trigger drop, LIKE fallback) do **not** register or index Codebase-Memory. Agents still get "Codebase-Memory first" instructions from `prompt-leverage` / `code-navigation`, so a missing MCP entry or empty index often gets narrated as "bộ nhớ / chỉ mục FTS5 lỗi".

### Install: Codebase-Memory is mandatory (fixed in 1.7.17+)

Historically `--skip-codebase-memory` was destructive: reinstall with that flag stripped `mcp["codebase-memory-mcp"]` even when the binary remained on PATH. Public CLI now **ignores** `--skip-codebase-memory` / `--no-codebase-memory`, install merge is **non-destructive** (skip no longer deletes MCP entries), and install auto-runs a fast `index_repository` for the **install cwd only** when the binary is available.

### What gets indexed when?

| Action | Indexes |
| --- | --- |
| `npx zcode-starterkit` / `install` | **Only cwd of the install command** (if it looks like a project). Global MCP + binary. |
| `/setup` in a repo | **That project root** (ensure MCP registered first; install binary/MCP if missing; then index if `nodes` is 0). |

Install does **not** crawl the machine for every git repo. Opening a new project without `/setup` (or a manual `index_repository`) leaves that project out of `list_projects` → agents say graph tools are “broken”.

Still true:

- Empty index (`list_projects` → no entry for this root) makes agents report "Codebase-Memory broken" even when MCP is registered.
- Observation FTS5 (`memory-search`) is a separate stack — do not diagnose empty graph as FTS5.
- If graph tools fail after reinstall: restart ZCode, confirm `~/.zcode/cli/config.json` → `mcp.servers["codebase-memory-mcp"]`, run a direct initialize/tools-list health probe, then `codebase-memory-mcp cli list_projects`.

## Build System

- `dist/` is generated - never edit directly
- Build copies `.zcode/` to `dist/template/` via rsync
- Run `npm run build` to regenerate

## Beads

- Only leader agents (build, plan) should modify beads state
- Subagents read with `br show <id>`, report findings back
