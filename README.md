# OMP Desktop | OMP 桌面应用

OMP Desktop is a Windows Tauri 2 workbench for the pinned
[oh-my-pi](https://github.com/can1357/oh-my-pi) Runtime 17.4.1. It combines
project-scoped sessions, streamed agent work, model/thinking controls, safe
forking of terminal history, bounded workspace context, and human-governed
Harness memory review in one offline-capable desktop app.

OMP Desktop 是一个 Windows Tauri 2 桌面工作台，使用固定版本 17.4.1 的
[oh-my-pi](https://github.com/can1357/oh-my-pi) Runtime。它把项目内会话、实时
Agent 输出、模型与思考级别控制、终端历史安全分叉、受限工作区上下文，以及
需要人工确认的 Harness 记忆评审整合到一个可离线运行的桌面应用中。

## Download | 下载

GitHub Releases publishes a Windows NSIS `.exe` installer and an `.msi`
package. The verified Runtime is bundled; a separate `omp` installation is
not required for the normal path.

GitHub Releases 会发布 Windows NSIS `.exe` 安装包和 `.msi` 安装包。已验证的
Runtime 已内置，正常使用不需要另外安装系统级 `omp`。

## Product model | 产品模型

- **Project | 项目** — shared cwd, files, configuration, and session list.
- **Session | 会话** — the primary work unit: history, context, run state,
  events, approvals, recovery, and switching.
- **Terminal history | 终端历史** — always read-only; continue through a
  Host-verified desktop-owned fork.
- **Harness review | Harness 评审** — preview, inspect, explicitly approve,
  and rollback project-scoped memory changes. The Host derives binding fields
  and the executor is the sole filesystem writer.

## Development | 开发

Requirements: Windows, Node 24.19.0, Bun 1.4.x, and Rust/Cargo.

```powershell
npm ci
bun install --cwd apps/desktop-host --frozen-lockfile
npm run next:install
npm run dev
```

Useful checks:

```powershell
npm run host:test
npm run frontend:check
npm run architecture:test
npm run verify
npm run build
```

The shipping renderer lives in `renderer-next/` and is built into
`renderer-next/dist`; the legacy no-bundler renderer and fixture transport have
been removed.

## Safety boundaries | 安全边界

- Source terminal session files are never rewritten.
- Renderer code never imports OMP packages or reads private session files.
- Runtime and Host binaries are hash-verified before launch.
- Tauri/Rust owns process supervision and prevents orphaned process trees.
- Harness writes require an explicit human `{ approvedBy, reason }` and a
  Host-issued exact preview.

## License | 许可证

MIT
