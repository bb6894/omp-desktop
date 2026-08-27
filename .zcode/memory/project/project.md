---
purpose: Project vision, success criteria, and core principles
updated: 2026-08-22
---

# omp-desktop

## Vision

A personal Windows desktop app that wraps the `omp` (oh-my-pi) coding agent in a native Tauri 2 shell: one tab = one verified `omp --mode rpc` process, with a bundler-free React chat UI that works fully offline.

## Success Criteria

- [x] Stage0 host runtime established — verified omp runtime + session boundaries (`apps/desktop-host`)
- [x] Tauri connected to the verified omp host; agent process trees supervised on Windows (no orphans)
- [x] Host lifecycle proven with an offline fixture (21 bun tests green)
- [ ] Stage1 UI (zh) — current branch `codex/stage1-ui-zh`
- [ ] Installable release bundle via `tauri build` (release workflow)

## Target Users

- **Primary:** the owner — single-user personal tool ("个人用")

## Core Principles

1. **Offline by design** — vendored libs only, strict CSP, no CDN, no shell plugin
2. **Verified runtime** — host pins and hash-verifies the bundled omp runtime before spawning
3. **Layered minimalism** — Rust shell / TS host / vendored-React UI stay separated; minimal end-to-end first, then complexity
4. **No backward compatibility** — delete obsolete code directly; no compat layers or fallbacks
5. **Tested before commit** — every non-trivial change carries Rust or bun test coverage

## Tech Stack

See [tech-stack.md](./tech-stack.md) — Tauri 2 + Rust 2021 backend, Bun/TS host, no-bundler React frontend.

## Architecture

```
src-tauri/src/          # Rust backend: agent/ (AgentBridge), host.rs, process_supervisor.rs, git_watcher.rs
apps/desktop-host/src/  # Bun/TS host: session-service, agent-service, rpc-bridge, omp-vendor (vendor boundary)
src/                    # Frontend: index.html (script order = dep graph), live.js (bridge), app-live.jsx (React root), adapter.js, design/
artifacts/              # Built host binaries (omp-desktop-host.exe)
```

Three layers: Rust spawns/supervises the host runtime; `src/live.js` bridges Tauri events ↔ per-session state (`window.OMP_BRIDGE`); React renders via `useBridgeSnapshot`. Full details: `CLAUDE.md` (authoritative) and `AGENTS.md`.

## Key Files

| File          | Purpose                                        |
| ------------- | ---------------------------------------------- |
| CLAUDE.md     | Authoritative repo rules (architecture, style) |
| AGENTS.md     | Agent rules + coding standards (this setup)    |
| package.json  | Root scripts (tauri, host:*)                   |
| src-tauri/Cargo.toml | Rust backend manifest                    |
| apps/desktop-host/package.json | Host runtime manifest (bun)      |

---

_Update this file when vision, success criteria, or principles change._
