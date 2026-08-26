---
purpose: Project rules for AI agents
updated: 2026-08-22
source: generated-by-zcode-starterkit
---

# AGENTS.md

## Purpose

Windows desktop shell for `omp` (oh-my-pi): a Tauri 2 + Rust app that manages a Bun-compiled TypeScript Desktop Host, which talks to the pinned OMP runtime (`@oh-my-pi/*` 17.4.1) over RPC v2. This repo is the planning + implementation root; the app lives in `omp-desktop/` (its own nested git repo).

## Source of Truth

1. This `AGENTS.md`
2. `omp-desktop/CLAUDE.md` — authoritative for the app sub-repo (architecture, code style, tests, changelog)
3. `docs/superpowers/` — stage-0 design spec, implementation plan, red-team review, evidence report
4. `.zcode/memory/project/tech-stack.md`
5. Code and tests
6. Baseline / external catalogs only when they match this repo's stack

## Stack Snapshot

- **Language:** TypeScript (`apps/desktop-host/src/*.ts`), Rust 2021 (`omp-desktop/src-tauri/`), legacy no-bundler JSX (`omp-desktop/src/`)
- **Runtime / Framework:** Tauri 2 desktop app; Bun 1.4 for host build/test; React loaded unbundled via `@babel/standalone`
- **Package Manager:** bun (`apps/desktop-host`, `host:*` scripts) + npm (root `omp-desktop/package.json`, Tauri CLI) + cargo (`src-tauri`)
- **Detected Shape:** desktop app mono-root: planning docs at repo root, app sub-repo in `omp-desktop/`

## Core Coding Contract

- Read repo instructions, docs, configs, and nearby code before editing — start with `omp-desktop/CLAUDE.md` for any app change.
- Prefer existing patterns and the smallest correct diff.
- Preserve current public APIs, data shapes, and external side effects only when they are part of the current requirements; do not add backward-compatibility layers, migrations, or fallbacks for obsolete behavior.
- Do not add dependencies, frameworks, broad refactors, or generated churn unless the task requires them. OMP package versions are pinned exactly (`17.4.1`, no `^`/`~`/`latest`).
- Use the repo's actual formatter/linter/test/build commands (below); run the relevant ones after meaningful changes.
- Self-review the diff, including untracked files, and remove debug leftovers before completion.
- Report skipped verification with reasons instead of claiming unverified success.

### Engineering Principles (mandatory)

1. Do not preserve backward compatibility. Delete obsolete code directly; no compatibility layers, migrations, or fallbacks.
2. Choose the simplest implementation that satisfies the current requirements. Avoid speculative abstractions and unnecessary configuration layers.
3. Keep the system layered for the long term: make a minimal end-to-end version work first, then add complexity. Never dismantle working code for unfinished complexity.
4. Keep components modular and separate concerns.
5. Prefer mature, actively maintained libraries. Do not rewrite established capabilities without a clear reason (e.g. use official OMP `SessionManager`/`RpcFrameDecoder` — never re-implement OMP JSONL parsing or RPC reassembly).
6. Inspect what existing dependencies can already do before adding packages or writing custom code.
7. Make architecture decisions for the long term. No "we can replace this later" temporary solutions.
8. Study how mature products solve the same problem and use proven patterns; do not invent from scratch.

## Coding Standards (apply strictly)

- **Source:** agent-skills-standard fallback (LLM Wiki not loaded; re-run `/setup` with a wiki link to upgrade). Pinned commit `9f695e8e2c3e423dfcd420a0e6b80e0e99044088` of https://github.com/HoangNguyen0403/agent-skills-standard.

**TypeScript (distilled from `typescript-language`, `typescript-best-practices`, `typescript-security`):**

- Explicit types on public API params/returns; infer locals. No `any` — use `unknown` plus narrowing (avoid `!` non-null assertions).
- Discriminated unions with a literal `kind`/`type` field to narrow state (already the pattern in `contracts.ts`); `never` for exhaustiveness in switch. No runtime `enum` — literal unions or `as const`.
- Named exports only; `import type` for type-only imports; async/await over `.then()` chains.
- Validate at boundaries: every `HostRequest` crossing the Rust↔Host stdio protocol is decoded and checked against the declared command surface (`contracts.ts`); unknown commands return `UNKNOWN_COMMAND`, malformed frames return `LOCAL_PROTOCOL_ERROR` — never silently forwarded.
- Security: never interpolate user input into shell strings — static command + args array. No secrets, tokens, Authorization headers, or full environment dumps in logs or diagnostics; diagnostics must be redacted (脱敏).
- Never suppress with lint-disable or `as any` casts to make errors disappear; fix the root cause.

**Rust (no bundled standards pack exists; from repo `CLAUDE.md` + Core Coding Contract):**

- `cargo fmt` before commit; clippy `pedantic`+`nursery` clean with `-D warnings` (nightly) when available — CI gate is `cargo check --locked` + `cargo test --locked`.
- No `unwrap`/`expect` in production paths unless failure is provably unrecoverable. Prefer borrows (`&str`, `&[T]`) over owned types; no `.clone()` to bypass borrowck.
- Minimize temporary allocations in hot paths (reader loop, per-line dispatch, IPC payload construction).
- Validate/sanitize all input crossing the IPC boundary; strongly typed payloads; no blocking ops inside async Tauri commands.

**Review discipline (from `common-code-review`):** findings lead with severity (`[BLOCKER]`/`[MAJOR]`/`[NIT]`), each with file evidence and a stated risk; substance (logic, security, edge cases, tests) over style; "CI is green" does not replace review.

## Selected Guideline Packs

- **Strong matches:** `typescript/typescript-language`, `typescript/typescript-best-practices`, `typescript/typescript-security`, `common/common-best-practices`, `common/common-code-review`, `common/common-context-optimization`
- **Medium matches:** `typescript/typescript-tooling` (bun/vitest tooling guidance; this repo uses `bun test`, no eslint pipeline yet)
- **Ignored packs:** react/frontend packs for the legacy `src/` UI (`omp-desktop/CLAUDE.md` already governs it authoritatively); all other language families
- **Rust:** no bundled `rust/*` category exists in the catalog — Rust rules above come from the Core Coding Contract + repo `CLAUDE.md` tooling; recorded instead of inventing a pack path.

## Stack-Specific Rules

- Only `apps/desktop-host/src/omp-adapter.ts` may import `@oh-my-pi/*` packages — enforced by `apps/desktop-host/tests/vendor-boundary.test.ts`. UI and Rust never touch raw OMP frames or credentials.
- All session writes go through `desktop-owned` forks under `<profile>/desktop-sessions/`; terminal history is `history-readonly` — never create/migrate/modify source session files.
- Local Host protocol uses 4-byte little-endian length-prefixed frames, 16 MiB max; OMP RPC v2 uses 1 MiB physical / 64 MiB reassembled frames via the official `RpcFrameDecoder`.
- Rust manages the process tree with Windows Job Objects (`process_supervisor.rs`); `stop`/exit/window-close must leave no orphan `omp` processes.
- Legacy frontend (`omp-desktop/src/`): script order in `index.html` **is** the dependency graph (no resolver); plain scripts must be IIFE-wrapped; `src/design/` is authoritative, never regenerate from root `design/`.

## Repo-Specific Rules

- Verify after every meaningful change: `npm run host:test` (21 tests) and `cd omp-desktop/src-tauri && cargo check --locked` (plus `cargo test --locked` for Rust logic).
- Every user-facing change goes into `omp-desktop/CHANGELOG.md` `[Unreleased]` (Keep a Changelog).
- `omp` must be on PATH (`omp --mode rpc`, **not** `omp --rpc`); runtime binary hash must match `RUNTIME_MANIFEST` before launch.
- Non-trivial logic requires test coverage before commit (Rust `#[cfg(test)] mod tests` in-file; TS tests under `apps/desktop-host/tests/`).
- Two nested git repos: root repo (planning docs, branch `codex/stage0`) and `omp-desktop/` (app, own history). Commit app changes inside `omp-desktop/`, docs at root.
- Only format files you actually modified; surgical edits over full-file rewrites.

## Boundaries / Gotchas

- Never auto-approve OMP interaction requests; timeouts return `INTERACTION_EXPIRED`.
- Strict CSP (`script-src 'self' 'unsafe-inline' 'unsafe-eval'`), asset protocol disabled, no CDN dependencies — app must work offline; React/Babel/marked/hljs are vendored.
- Thinking levels are RPC-driven (`off|minimal|low|medium|high|xhigh`); never invent fallbacks like `auto` — RPC silently ignores them.
- Reader blank-line handling (`agent/reader.rs`): EOF vs blank line distinction — don't revert to `reader.lines()` with blanket `_ => break`.
- Stage 0 hard gates: source session files must never be rewritten; credentials never logged; no orphan processes — any of these is an automatic failure.

## Verified Commands

- `cd omp-desktop && npm run host:test` — Bun host test suite (21 pass)
- `cd omp-desktop/src-tauri && cargo check --locked` — Rust CI gate (pass)
- `cd omp-desktop/src-tauri && cargo test --locked` — Rust tests (2 pass)
- `cd omp-desktop && npm run host:install` / `host:build` — bun install / compile host exe
- `cd omp-desktop && node test-rpc.mjs` — omp RPC probe (requires `omp` on PATH)
- Nightly clippy (`cargo +nightly clippy … -D warnings`): not run — nightly toolchain not installed on this machine (stable only).

## Code Example

```ts
// apps/desktop-host/src/contracts.ts — stable domain DTOs; everything depends on these,
// never on raw OMP objects
export type WriteMode = "history-readonly" | "desktop-owned";
export type HandoffState = "none" | "stopped-for-terminal" | "terminal-owned" | "reclaimable";

export type SessionRecord = {
  id: string;
  sourcePath: string;
  displayName: string;
  projectPath: string;
  updatedAt: string;
  writeMode: WriteMode;
  sourceSessionId: string | null;
  parentSessionId: string | null;
  owner: "none" | "desktop" | "terminal";
  handoffState: HandoffState;
  // ...
};
```

## Synthesis Notes

- **Rule translation:** typescript packs → boundary-validation and no-`any` rules mapped onto the Host protocol decode path; security pack → redacted-diagnostics and no-shell-interpolation rules mapped onto runtime spawn; no bundled Rust pack → fell back to repo `CLAUDE.md` tooling rules.
- **Source notes:**
  - Local wiki: not loaded (user skipped; `LLM Wiki: skipped (no link provided)`)
  - External catalog: agent-skills-standard snapshot at `<core-plugin>/standards/agent-skills-standard/`, commit `9f695e8e2c3e423dfcd420a0e6b80e0e99044088` (2026-07-14); packs read: `skills/typescript/{typescript-language,typescript-best-practices,typescript-security}/SKILL.md`, `skills/common/common-code-review/SKILL.md`
  - Repo docs: `omp-desktop/CLAUDE.md`, `docs/superpowers/plans/2026-08-22-omp-stage-0-feasibility.md`
- **Open questions:** whether to adopt an ESLint/Prettier pipeline for the host TS code (currently only `bun test`); whether nightly clippy should be installed locally or left to CI.

---

_Keep this file concise, additive, and specific to the current repository._
