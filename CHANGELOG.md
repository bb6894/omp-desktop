# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Desktop-side approval rules engine (codex-style amend semantics):
  desktop-owned runtimes now spawn with `--approval-mode write` instead of
  silently inheriting the Runtime's `yolo` default, so exec-tier tools ask
  before running while read/write work stays friction-free. Approval cards
  offer 「本会话内放行此类」 and 「项目内记住放行」 grants; granted prompts are
  answered by the Host in place and surface as a system note instead of a
  phantom ask card. Rules are created only by explicit user action, match
  exclusively the Runtime's `Allow tool: <name>` Approve/Deny prompt shape,
  and project-scoped rules persist atomically beside per-project session
  metadata. The 详情 tab lists active rules with revoke buttons; three new
  allowlisted ops (`approval.rules.list/add/remove`) back the surface.
- Structured plan cards: the todo tool now renders as phase-grouped
  checklists with status marks (○ ▶ ✓ ⨯ ⛔) instead of an opaque output
  block, and eval runs show their source as a language-tagged code block.
  Both are extracted at the Host translation boundary with hard caps and
  drop silently on malformed shapes.
- Per-file review marks in the 变更 panel: toggle ○/✓ on each changed file,
  an n/total counter, mark-all action, persisted per session across
  restarts.
- Fixed a first-real-session fatal bug on clean machines: the Bun-compiled
  Host resolves `pi_natives.win32-x64-*.node` at runtime, and the bundle did
  not ship it — the first agent turn died with MODULE_NOT_FOUND behind a
  perpetual "正在加载会话…" screen (red-team attack 2, now closed).
  `prepare:bundle` stages the exact-version natives from
  `@oh-my-pi/pi-natives-win32-x64` (version-checked against the Runtime pin),
  records its SHA-256 in `bundle-evidence.json`, and the installers carry it
  beside the Host binary.
- `prepare:bundle` accepts `BUNDLE_NODE_EXE` to point the Node 24.19.0 probe
  at an explicit portable install without touching system PATH.
- The compiled-Host fixture smoke now drives the journaled timeline protocol
  (domain kinds + `response` patch answers) and is hang-proof via a race
  deadline instead of relying on inbound frames to tick the timeout.
- Added mid-turn steering: while the agent is running the composer stays live
  and sending injects a `steer` message instead of queueing a new prompt.
- Live command registry: the palette merges desktop-structured commands with the Runtime's `available_commands_update` stream, showing source chips (builtin/skill/mcp/extension) and argument hints; runtime commands execute via `prompt('/name args')` with output rendered as system notes.
- Full OMP terminal slash surface: `ALLOWED_AGENT_COMMANDS` grows 17 → 36, exposing `bash`, `branch`, `handoff`, `set_fast_mode`, `set_auto_compaction`, `set_steering_mode`, `set_follow_up_mode`, `set_interrupt_mode`, `abort_and_prompt`, and others — the renderer can now invoke any Runtime slash command the terminal supports.
- Bang shell `!cmd` in the composer: dispatches to the Runtime as a bash prompt (gated through the approval engine at exec tier).
- Queue counter badge: when the agent is mid-turn, sending a new prompt queues as followUp and the badge shows the queued count; the user can see pending messages without losing them.
- Right-panel 运行开关: toggles for fast mode, auto-compaction, and steering/follow-up/interrupt modes driven by live `WorkbenchState` fields fetched from the Runtime (`tokensPerSecond`, `contextUsage.percent`, `queuedMessageCount` surfaced too).
- Added a slash-command palette in the composer (`/new`, `/compact [说明]`,
  `/export`, `/stats`) with prefix filtering and keyboard navigation; commands
  map 1:1 onto the Host-allowlisted Runtime command surface.
- Tool cards now show Chinese tool labels alongside protocol names.
- Fixed `set_model`: the Runtime contract requires `{provider, modelId}` — the
  previous bare `{model}` frame silently no-opped, and the available-models
  list was flattened to an empty array. The model picker now carries
  provider/model pairs from `get_available_models`.

- Added a journaled timeline protocol as the single renderer↔Host live-event
  contract (`protocol/domain.ts`): the Desktop Host now translates raw OMP
  Runtime frames into domain events (`message.*`, `tool.*`,
  `interaction.requested`, `run.state`), assigns per-session monotonic
  sequences, and replays them through the new `events.replay` command.
  Switching back to a session no longer loses in-flight tool cards or the
  streaming bubble — buffered live events merge with the journaled replay, and
  sequence gaps fail visible (re-hydration) instead of silently dropping state.
- Fixed a wire-contract bug in interaction answers: the Runtime resolves
  dialogs by reading TOP-LEVEL `confirmed` / `value` / `cancelled` fields of
  the whole `extension_ui_response` frame, so the previous nested-value answer
  made every confirm dialog silently resolve as "deny". Answers are now
  validated (`InteractionResponse`) and spread at the Host boundary.
- Added method-aware interaction cards: permission confirms show the action
  description with 允许/拒绝, selects render their options, inputs carry
  placeholders (editor falls back to a textarea), and every card offers an
  explicit cancel that resolves the Runtime dialog with its default.
- Runtime-side dialog cancellations now close the matching ask card, and
  fire-and-forget notifications render as level-tagged system notes instead of
  phantom question cards. Non-interactive side-channel UI methods no longer
  reach the timeline.
- The workspace Changes/Diff panel colorizes unified-diff rows (add/delete/
  hunk/meta) instead of rendering a plain pre block.
- Failed sessions expose a 重新绑定运行时 recovery action alongside 重试上一条指令.
- Added the Stage 3C human-governed Harness review flow in the desktop UI: author a project-scoped memory proposal, inspect the Host-built preview, then apply it with an explicit approver name and reason (an automatic pre-write snapshot makes every apply reversible) or roll back to the latest snapshot. Approved proposals persist in Harness state only — they do not affect Runtime prompts yet — and global scope remains unsupported.
- Added the Stage 2 read-only Harness Inspector path from the renderer bridge through Tauri to the compiled Host. Harness state lives outside OMP session files and is rejected when malformed, incompatible, oversized, project-mismatched, schema-invalid, or secret-bearing.
- Added a Chinese-first, read-only Harness Inspector dialog with project compatibility, collection counts, bounded entry previews, explicit empty/error states, and session-bound async results.

### Changed

- Completed the Session Workbench v1 cutover: the Vite/React `renderer-next`
  bundle is now the only shipping UI, with real Tauri transport and no legacy
  no-bundler renderer, fixture transport, or paused task-model surface.
- Renamed the workbench's organization metadata and listing surface around
  sessions (`session.views` and `session.metadata.*`); session identity remains
  the primary product model.

- Localized the live desktop interface for Chinese-first use, while keeping model, tool, command, and protocol identifiers in their original form with Chinese hover explanations.
- Localized the tuning panel labels and option descriptions without changing their persisted values or behavior.
- Configured the NSIS installer to use Simplified Chinese on Windows.
- Windows bundles now rebuild and smoke-test the compiled Desktop Host, verify the pinned official OMP Runtime, and record the exact packaged hashes before producing MSI or NSIS installers.
- `runtime:fetch` now downloads the pinned OMP Runtime binary from this repository's own `runtime-v17.4.1` release instead of the third-party upstream release, so fresh clones and the release pipeline no longer depend on `can1357/oh-my-pi` staying public. Pinned SHA-256, file name, and hash verification are unchanged.

### Fixed

- Synchronized the Windows application package version with the `v0.1.4` release tag so generated installer filenames and upgrade metadata report the published version.

- Tab switch drops all tool cards from chat — `get_messages` returns only text entries; tool/ask/compact cards live exclusively in live event state. Fixed by merging `get_messages` ground-truth text into the existing snapshot (preserving tool cards in-place) instead of replacing `state.messages` wholesale. `activeToolCards` indices are rebuilt after merge so in-flight `tool_execution_update` events continue landing correctly.
- Minimap cell stuck pulsating after tab switch — `streamingBubble` restored from snapshot was never cleared when `get_state` reported `isStreaming: false` (turn completed while away); `_applyRpcState` now retires the bubble and strips `streaming: true` entries from `state.messages` immediately, before `get_messages` arrives.

## [0.1.2] - 2026-05-11

### Fixed

- macOS freeze (spinning beach ball + high CPU) when opening a project folder via the + button — `blocking_pick_folder` was called from a command-handler thread, deadlocking against the main RunLoop; switched to callback-based `pick_folder` with an async command and `spawn_blocking` channel bridge

## [0.1.1] - 2026-05-10

### Added

- `/login` command with OAuth provider picker (fetches providers via `get_login_providers` RPC)
- Ask tool rendered as inline chat bubble with `rpc-ui` mode support _(requires [can1357/oh-my-pi#994](https://github.com/can1357/oh-my-pi/pull/994) to be merged)_

### Performance

- Fixed 13×13 minimap grid (169 cells); oldest row of 13 messages evicted at turn boundary once the grid is full, keeping memory and render cost bounded in long sessions
- `React.memo` on all bubble components (UserBubble, AssistantBubble, ToolCard, AskBubble, CompactRow); only the live streaming tail re-renders per token — stable history bails out
- Stable `_id` stamped on every message object in `live.js`; bubbles keyed by `_id` instead of array index, eliminating remount/fade-in blink when the oldest row is evicted
- `useCallback` on `handleAnnotate` and `handleAskAnswer` in App to stabilize function-prop refs and preserve memo bailouts for AssistantBubble and AskBubble

## [0.1.0] - 2026-05-10

### Added

- Initial Tauri 2 shell: spawns `omp --mode rpc` per tab, no bundler, JSX transpiled in-browser via `@babel/standalone`
- GitHub Actions CI (cargo check + cargo test on win/linux/mac) and release pipeline
- Per-tab omp process isolation — one process per tab, preserved across switches via session snapshots
- Model picker as a separate bridge view with on-load fetch and refresh button
- Markdown rendering with syntax highlighting (marked v12 + highlight.js) in chat
- Plan mode: full intent → drafting → review → running → done lifecycle with inline block annotations
- Slash command palette with arrow-key navigation, fuzzy filter, and Enter execution
- `/new` command to start a fresh omp session in the current tab
- Steer: send a message to the agent mid-turn without waiting for completion
- Compact tool cards: full expand/collapse card showing live progress and final result
- Task/quick_task tool cards: collapsible subagent panel with live-stream view on row click
- Eval cell tool cards: stream code and output live; syntax highlight on completion
- Auto-scroll chat to bottom as the agent streams output
- Minimap: dense grid heatmap with chat-bubble cross-highlight and per-kind tooltips
- Long paste collapse into `[paste #N +K lines]` inline tokens in the composer
- macOS-style traffic light window controls on Windows (DWM frameless)
- Autosave toggle button in the status bar
- Font size slider in the tweaks panel (75–150%, step 5)
- Git branch chip in the title bar via `gix` + `notify`
- OMP icon pack v1 as app icons across all platforms
- MIT license

### Fixed

- Black screen on startup — disable Tauri CSP hash injection, remove Google Fonts CDN link
- Git HEAD watcher — watch `.git/` directory instead of `HEAD` file to survive atomic rename on Linux/macOS
- Window drag — replaced custom handler with `data-tauri-drag-region`
- Diff block overflow — contained within chat column width
- Composer textarea: single-line default via `field-sizing: content`; focus restored after send; textarea stays enabled during streaming for steer input
- Phantom textarea scrollbar hidden at min-height
- Window control symbols: always colored red/yellow/green, no hover background bleed
- Tweaks panel: persist settings to `localStorage`; retheme to use app CSS variables
- Token and context gauge percentages truncated to one decimal place
- Stream line accumulation — handle in-place growing lines without duplication
- ToolCard: remove duplicate `return` statement; expand individual subagent rows, not the card header
- Plan annotations always reaching the prompt; `sendFeedback` working with annotations and no body text
- Plan running→done state transition
- Message history preserved across tab switches
- Tab name retained from folder path when `omp sessionName` is absent
- `_handleResponse` in `live.js` — missing closing brace caused silent IIFE syntax error
- Thinking level values aligned to valid RPC set (`off | minimal | low | medium | high | xhigh`)
- Rust agent: race-safe sessions, lock-free per-session stdin writes, no orphan child processes on hot-reload

### Changed

- Project renamed from `omp-desktop` to `Oh My Pi Desktop`
- Split large files into focused modules: `agent.rs` → `agent/`, `app.jsx` → `app-live.jsx` + `src/app/`, monolithic CSS and chat/UI/tweaks components into dedicated directories
- Plan mode moved from a dedicated side panel into the chat timeline
