---
purpose: Tech stack, constraints, and integrations for AI context injection
updated: 2026-08-22
---

# Tech Stack

This file is automatically injected into ALL AI prompts via `config.json` instructions[].

## Framework & Language

- **App:** Tauri 2 desktop shell (frameless window via DWM, WebView2 ≥ 101 required)
- **Backend:** Rust 2021 (`src-tauri/`, edition 2021, cargo 1.98) — process supervision, git watcher, IPC
- **Frontend:** Plain JS/JSX in `src/` — NO bundler; vendored React UMD + `@babel/standalone` transpile in-browser
- **Host runtime:** Bun + TypeScript ESM (`apps/desktop-host/`), compiles to `artifacts/omp-desktop-host.exe`

## Key Dependencies

- **Tauri:** tauri 2, tauri-plugin-dialog 2 (`src-tauri/Cargo.toml`)
- **Rust:** serde/serde_json, notify 6, gix 0.83, open 5, windows-sys 0.59 (JobObjects/Threading for process-tree supervision)
- **Host vendor:** `@oh-my-pi/pi-coding-agent`, `pi-natives-win32-x64`, `pi-utils` — all pinned at 17.4.1, imports allowed ONLY in `apps/desktop-host/src/omp-vendor.ts`
- **Root npm:** `@tauri-apps/cli` ^2 only

## Build & Tools

- **Dev:** `npm run dev` (tauri dev) / **Prod:** `npm run build` (tauri build)
- **Host:** `npm run host:install` / `host:test` / `host:build` (bun; `tools/build-host.ts`)
- **Rust lint gate:** nightly clippy `pedantic`+`nursery` `-D warnings` must stay clean; `cargo fmt` before commit
- **No JS lint/test pipeline for `src/`** — deliberate; don't introduce ESLint/Jest unprompted

## Testing

- **Host:** `bun test` under `apps/desktop-host/tests/` (21 tests, 9 files)
- **Rust:** `cargo test --locked` in `src-tauri/` (`#[cfg(test)] mod tests` in-file)
- **CI:** `.github/workflows/ci.yml` — cargo check+test on win/linux/mac; `release.yml` — tauri build bundle

## Key Constraints

- App must work offline: strict CSP, no CDN, asset protocol disabled, no `tauri-plugin-shell`
- Script order in `src/index.html` IS the frontend dependency graph; plain scripts must be IIFE-wrapped
- `omp` binary must be on PATH (`%LOCALAPPDATA%\omp\omp.exe` on Win); spawn `omp --mode rpc`, never `omp --rpc`
- Root uses npm (package-lock.json); `apps/desktop-host` uses bun (bun.lock) — do not switch managers
- cargo lives at `~/.cargo/bin` — add to PATH in fresh Git Bash shells

## Active Integrations

- **ZCode:** starterkit core plugin 1.9.9; Codebase-Memory MCP indexed (nodes=2520, edges=5636)
- **Beads CLI:** beads_rust (br 0.2.16), `.beads/` initialized in-repo
- **LLM Wiki:** skipped (no link provided 2026-08-22) — bundled agent-skills-standard fallback in use

---

_Update this file when tech stack or constraints change._
_AI will capture architecture, conventions, and gotchas via the `observation` tool as it works._
