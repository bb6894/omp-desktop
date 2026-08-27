# CLAUDE.md

Windows-only Tauri 2 desktop shell for `omp` (oh-my-pi). The React UI is loaded
from `src/` by Tauri's asset server. **No bundler** — JSX is transpiled in the
WebView by the vendored `@babel/standalone`.

Rust does not spawn `omp` directly. Rust starts one verified Bun-compiled
Desktop Host per UI tab; that Host owns the pinned OMP Runtime 17.4.1 process
tree and speaks the bounded local framed protocol to Rust.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in `bb6894/omp-desktop` on GitHub. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, and `wontfix`. See
`docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context layout with `CONTEXT.md` and
`docs/adr/` at the repository root. See `docs/agents/domain.md`.

## Commands

| Task | Command |
|---|---|
| Install Tauri CLI | `npm ci` |
| Install Host dependencies | `bun install --cwd apps/desktop-host --frozen-lockfile` |
| Host tests | `npm run host:test` |
| Build Host sidecar | `npm run host:build` |
| Host fixture smoke | `bun tools/smoke-host-fixture.ts artifacts/omp-desktop-host.exe` |
| Dev | `npm run dev` |
| Windows bundle | `npm run build` |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml --locked` |
| Rust fmt | `cargo fmt --manifest-path src-tauri/Cargo.toml --all` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml --locked` |
| Full local verification | `npm run verify` |
| Frontend dependency check | `npm run frontend:check` |
| Architecture boundary check | `npm run architecture:test` |
| Fetch pinned Runtime | `npm run runtime:fetch` |
| Prepare bundle resources | `npm run prepare:bundle` |
| Full MSI/NSIS verification | `npm run verify:bundle` |

The bundled artifacts are `artifacts/omp-desktop-host.exe` and
`artifacts/omp-windows-x64.exe`. The Runtime hash must match
`apps/desktop-host/src/runtime-manifest.ts`. A system `omp` on `PATH` is not the
normal production path.

## Architecture

Three runtime layers:

1. **Rust/Tauri (`src-tauri/src/`)**
   - `lib.rs` exposes the narrow Tauri command surface.
   - `host.rs` implements `HostBridge`, owns one compiled Desktop Host per tab,
     translates framed responses into Tauri events, and rejects unbound paths or
     malformed renderer commands.
   - `process_supervisor.rs` attaches each Host/OMP process tree to a Windows Job
     Object so stop, window close, and process exit leave no orphan processes.

2. **Desktop Host (`apps/desktop-host/src/`)**
   - `contracts.ts` defines the closed local request/response DTO surface.
   - `session-service.ts` dispatches allowlisted session, Agent, interaction,
     read-only Harness inspection, and human-governed Harness mutation requests.
   - `agent-service.ts` and `rpc-bridge.ts` manage the official OMP RPC v2 path.
   - `harness-store.ts` is the read-only view of Harness state.
     `harness-mutation-service.ts` builds previews from Host-owned context and
     `harness-mutation-executor.ts` is the sole filesystem writer for approvals.
   - `omp-vendor.ts` is the only production module that imports `@oh-my-pi/*`.
   - OMP package and Runtime versions remain pinned exactly to `17.4.1`.

3. **Legacy no-bundler frontend (`src/`)**
   - `live.js` adapts Host events into per-tab renderer state.
   - `app/harness-client.js` exposes the read-only Harness command and the
     three explicit human-approval mutation commands.
   - `app-live.jsx` is the sole React root.
   - `src/design/**` is the authoritative live UI source.
   - `src/index.html` script order is the dependency graph.

## Session model

One UI tab owns one Rust `HostBridge` child. The compiled Desktop Host owns the
verified OMP Runtime process tree for that tab. Source terminal sessions remain
`history-readonly`; writable desktop work uses `desktop-owned` forks. Rust and
the UI never parse or rewrite OMP's private session files.

## Human-governed Harness review

`harness.preview`, `harness.apply`, and `harness.rollback` are the only
renderer-reachable Harness write surface:

- The renderer sends only `operation/title/content` (+`targetId` for replace);
  the Desktop Host derives `projectId`, `scope`, pinned compatibility,
  timestamps, static evidence, and the replace target from its fixed cwd and
  `HarnessStore.inspect()`. Renderer-supplied binding fields are rejected.
- `harness.apply` requires the exact Host-built preview plus a non-blank
  `{ approvedBy, reason }` from a human. The Host applies only previews from
  its bounded issued-preview cache (`APPLY_PREVIEW_UNISSUED` otherwise) and
  hands the cached original to `HarnessMutationExecutor`, the sole filesystem
  writer; it snapshots before every apply and rejects blank, forged, stale,
  policy-failing, or replayed requests with stable codes.
- Tauri exposes exactly three explicit commands (`preview_harness_memory`,
  `apply_harness_memory`, `rollback_harness`) that call `HostBridge::request`
  directly — never `send_command`, `agent.command`, or the Runtime RPC path.
- Approved proposals persist to local Harness state only. Source terminal
  session files are never written, no system `omp` binary is involved, and
  approved memories do not affect Runtime prompts (a later stage).

## Frontend load order (`src/index.html`)

Script order **is** the dependency graph:

1. Vendored libs: React, ReactDOM, Babel, `marked.min.js`, `highlight.min.js` + marked-wiring inline.
2. Tweaks: `tweaks/style.js`, `tweaks/use-tweaks.js` (plain, IIFE) → `tweaks/panel.jsx`, `tweaks/controls.jsx` (Babel; controls depends on panel).
3. UI primitives: `ui/icons.jsx` (defines `Icon`, `TOOL_META`) → `ui/sparks.jsx` → `ui/markdown.jsx` → `ui/plan-annotations.jsx`.
4. Chat: `chat/user-bubble.jsx` → `chat/eval-cell.jsx` → `chat/assistant-bubble.jsx` → `chat/tool-card.jsx` → `chat/ask-bubble.jsx` → `chat/chat-view.jsx`.
5. `design/composer.jsx`, `design/chrome.jsx`, `design/panels.jsx`, `design/harness/proposal-review.jsx`, `design/harness/inspector.jsx`.
6. Live data: `model-names.js` → `adapter.js` → `app/harness-client.js` → `live.js`.
7. App helpers: `app/constants.js` (plain, IIFE) → `app/use-bridge-snapshot.jsx`.
8. `app-live.jsx` last.

When adding a file, insert at the correct point — there is no resolver to catch ordering bugs.

### IIFE rule

Plain `<script>` tags share document top-level scope; Babel `type="text/babel"` scripts intersect with it via destructures. Every plain script declaring top-level `const`/`function`/`class` **MUST** be `(function(){ …; window.X = X; })();` — see `app/constants.js`, `tweaks/style.js`, `tweaks/use-tweaks.js`. Bare `window.X = {…}` assignments are fine (`model-names.js`). Babel-transformed files do not need wrapping.

## Authoritative source

`src/design/` is the live-wired copy. Root-level `design/` is a gitignored read-only prototype reference. **Never** regenerate `src/design/` from `design/` — it overwrites bridge wiring. Edit `src/design/` directly.

## God-file prevention

Soft caps:

| Kind | Cap |
|---|---|
| `.jsx` | ~250 lines |
| `.js` | ~400 lines |
| `.rs` | ~250 lines |
| `.css` | ~300 lines |

Guidelines, not hard limits. Cohesion matters more than count.

Rules:
1. Split by responsibility, not symbol count. Group component families (e.g. `chat/`); never alphabetic splits.
2. One component per file when it has its own non-trivial state/effects (e.g. `EvalCell`, `ScrubbableDiff`, `AnnotablePlan`).
3. Co-locate primitives only when one is a private helper of the other (`InlinePlan` with `AssistantBubble`).
4. CSS splits by visual layer, not component. Don't sub-split `chat.css` unless a layer exceeds ~150 lines.
5. Rust modules split by concern when there are multiple `pub` surfaces or a long private helper section.
6. After splitting, update `src/index.html` script order in dependency order — never append.
7. Don't extract for symmetry. Tightly-related layers (e.g. `chrome.jsx`) stay together.

Trigger: 6th major component in one file, or 4th unrelated concern in one Rust module → split before further growth.

## Things easy to break

- `omp --mode rpc`, **not** `omp --rpc` (latter falls through to TUI, floods stdout with ANSI).
- Host framed reader (`host.rs` `read_local_frame`): clean EOF is allowed only before a new 4-byte little-endian header (`Ok(0)` at offset 0); a partial header or payload must fail as `HOST_FRAME_TRUNCATED`, never silently break the reader loop.
- Window controls use document-level click delegation (React mounts after `DOMContentLoaded`); `querySelector` in `_setupWindowChrome` would miss it.
- `set_model` response **must** call `notify()` immediately, else next `turn_start` re-emits stale `state.model` and UI reverts.
- Long `if/else if` chains in `_handleResponse` (`live.js`): a single misplaced `}` cascades — `_handleResponse` never closes, IIFE syntax errors, `window.OMP_DATA` never set. Re-verify brace structure when inserting branches.
- Frameless window via DWM: `decorations: false` + `platform.css` strips outer padding/shadow under `.tauri-native`. CSS uses `color-mix(in oklab, …)` — needs WebView2 ≥ 101.
- Strict CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; …`. Asset protocol disabled. `tauri-plugin-shell` deliberately removed. Don't add CDN tags or `convertFileSrc()` without revisiting both.
- Thinking levels are RPC-driven. Cycle = `cycle_thinking_level` (response carries new level). Set = `set_thinking_level`. Valid: `off | minimal | low | medium | high | xhigh`. Never invent fallbacks like `auto`/`extended` — RPC silently ignores them.
- No CDN dependencies. React/ReactDOM/Babel/marked/hljs are vendored. App must work offline.

## Code style

**General:**
- Follow existing architectural patterns before introducing new ones. Optimize for clarity first, then allocation efficiency.
- Run fmt + lint locally before finalizing any change. Don't ship code that fails fmt or clippy.
- Only format files you actually modified. Never do bulk formatting-only rewrites.
- Prefer surgical `edit` over full-file `write` when the file already exists. Full rewrites only when (a) creating a new file, (b) >~70% of lines genuinely change, or (c) restructuring would require so many anchors that `edit` becomes brittle. Never rewrite a file just to change a few lines — it loses formatting, drops invariants you didn't notice, and bloats diffs.

**Rust:**
- `cargo fmt` (stable) before commit; nightly clippy `pedantic`+`nursery` clean, `-D warnings`.
- No `unwrap`/`expect` in production paths unless failure is provably unrecoverable.
- Prefer borrowing (`&str`, `&[T]`) over owned. `&str` for params unless ownership required. No needless `String`↔`&str` conversions.
- No `.clone()` to bypass borrowck unless duplication is intentional.
- No unnecessary `Arc`/`Mutex`/async primitives. Keep lifetimes simple and idiomatic — no complex lifetime abstractions without clear benefit.
- Iterators/slices over intermediate `Vec` collections. `Cow` only when it meaningfully reduces allocations.
- Minimize temporary allocations in hot paths (reader loop, per-line dispatch, IPC payload construction).
- Idiomatic Rust over clever abstractions. Preserve existing module/naming conventions.
- Module-level `#![allow(clippy::needless_pass_by_value)]` in `lib.rs` is intentional — Tauri `#[command]` requires owned types.

**Frontend:**
- Prettier for JS/TS; respect any present ESLint config. Host and frontend boundary checks run under Bun via `npm run host:test` (including the `omp-vendor.ts` production import boundary and the test-oracle allowlist). There is still no frontend bundler or linter pipeline.
- Don't reformat unrelated files. Preserve existing import ordering/style.
- Prefer TS types over `any` (when TS is present; this repo is JSX).

**Tauri:**
- Keep FE/BE boundaries explicit. Don't expose unnecessary commands.
- Validate/sanitise all inputs crossing the IPC boundary. Strongly typed payloads.
- No blocking ops inside async commands. Off-thread `kill+wait` (see `start_session`/`stop_session`).
- Isolate platform-specific logic (e.g. Windows Job Objects live in `process_supervisor.rs`; verified Host process creation lives in `host.rs`).

**Disallowed unless justified:** clone-heavy ownership; owned `String`/`Vec` params where borrows suffice; collecting only to iterate once; unneeded boxing; async tasks without lifecycle justification; large formatting-only rewrites; formatting unrelated files.

## Tests

All non-trivial code **must** have test coverage before committing. This is not optional.

**Rust:**
- Every pure/logic function gets a `#[cfg(test)] mod tests` block in the same file.
- Integration behaviour (spawn, IPC, reader) gets at least one test verifying the happy path and one for the main failure mode.
- Run `cargo test` before every commit. A commit that adds logic without tests is rejected.

**Frontend (JS/JSX):**
- Pure state-transformation functions (message mapping, event handlers, bridge methods) are extracted so they can be tested in isolation.
- Use the `eval` kernel (`===== js =====` cells) to exercise logic inline when no test framework is wired.
- Non-trivial `live.js` additions (new event handlers, new bridge methods) must be accompanied by a notebook-style proof-of-correctness cell or a note explaining why the function is too side-effectful to test directly.

**What counts:**
- A test that imports the function and asserts on its output counts.
- A test that only verifies the function doesn't throw does not count.
- Snapshot tests and "it renders" checks do not count as logic coverage.

## CI / release

- `.github/workflows/ci.yml` runs `npm run verify` on Windows.
- `.github/workflows/release.yml` fetches and verifies the pinned official OMP
  Runtime, runs the same verification gate, then builds Windows MSI and NSIS
  artifacts.
- Tauri `beforeBuildCommand` always rebuilds and smoke-tests the Host and writes
  `artifacts/bundle-evidence.json` before packaging.
- Bundle preparation requires the exact `.node-version`, `.bun-version`, and
  Rust toolchain; use the verified Node 24.19.0 probe directory on machines
  whose default Node version differs.

## Changelog workflow

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**During development:** every user-facing change goes into the `[Unreleased]` section at the top, grouped under `### Added`, `### Fixed`, or `### Changed`.

**On release** (triggered by the user saying "release X.Y.Z"):
1. Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today's date).
2. Insert a new empty `## [Unreleased]` section above it.
3. Bump `version` in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` to `X.Y.Z`.
4. Update `src-tauri/Cargo.lock`: `cargo update --manifest-path src-tauri/Cargo.toml --package omp-desktop`.
5. Commit: `git add CHANGELOG.md src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock && git commit -m "chore: release vX.Y.Z"`.
6. Tag: `git tag vX.Y.Z`.
7. Push: `git push origin master --tags`.
