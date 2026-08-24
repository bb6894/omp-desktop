# Oh My Pi Desktop | OMP 桌面应用

A Tauri 2 desktop shell for [oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`). Wraps the `omp --mode rpc` coding agent as a verified child process and serves the React UI as a connected, live interface — no browser, no Electron, ~8 MB binary.

[OMP 桌面应用](#) 是 [oh-my-pi](https://github.com/can1357/oh-my-pi) (`omp`) 的 Tauri 2 桌面外壳。将 `omp --mode rpc` 编码代理作为受验证的子进程运行，并提供实时连接的 React UI——无浏览器、无 Electron、约 8 MB 安装包。

---

## Features | 功能特性

**Chat & sessions | 聊天与会话**
- Per-tab session isolation — each tab owns its own `omp --mode rpc` process
  按标签页隔离会话——每个标签页拥有独立的 `omp --mode rpc` 进程
- Full session snapshots: switch tabs, state is preserved including in-flight streams
  完整会话快照：切换标签页时保留状态，包括正在进行的流式输出
- `/new` command starts a fresh session (history kept on disk)
  `/new` 命令开启全新会话（历史记录保留在磁盘）
- Model picker with two-view command bridge; cycle or pick directly from the status bar
  模型选择器带双视图命令桥；直接从状态栏切换或选择
- Thinking-level control: cycle through `off / minimal / low / medium / high / xhigh` (per-model — omp picks the supported subset)
  思考级别控制：循环切换 `off / minimal / low / medium / high / xhigh`（按模型支持情况）
- Streaming token display with tokens/sec sparkline and context-window gauge
  流式 Token 显示，带 tokens/sec 火花图和上下文窗口仪表盘

**Plan mode | 计划模式**
- Activates a draft-before-write workflow entirely in the chat window
  在聊天窗口内激活先写草稿的工作流
- First message is wrapped in an intent framing prompt; subsequent sends steer the plan
  首条消息包裹意图提示；后续发送引导计划方向
- Inline plan annotations: click any paragraph to leave a comment before approving
  内联计划批注：点击任意段落批注后再审批
- Approve button sends all annotations as a single feedback prompt and opens the kanban
  审批按钮将所有批注作为单次反馈发送并打开看板
- Kanban panel auto-populates from the agent's `todo_write` tool calls (running / done)
  看板面板从代理的 `todo_write` 工具调用自动填充

**Tool cards | 工具卡片**
- Live streaming output for `eval` (JS/Python kernel) and `bash` tool calls
  `eval`（JS/Python 内核）和 `bash` 工具调用的实时流式输出
- Syntax-highlighted code blocks (highlight.js, atom-one-dark) once a cell completes
  单元格完成后显示语法高亮代码块
- Scrubbable unified diff viewer for `edit` calls with animated line reveal
  `edit` 调用支持可拖拽的统一 Diff 查看器
- Search preview, read summary, task board for the respective tools
  各工具分别提供搜索预览、读取摘要、任务看板

**Minimap | 缩略图**
- Dense cell grid (one cell per message) replacing the old bar stack — fits 200+ messages
  密集单元格网格（每条消息一个单元格），替代旧条形堆叠——可容纳 200+ 条消息
- Token heatmap: assistant cells brightness log-scaled by tokens used
  Token 热力图：助手单元格亮度按 Token 用量对数缩放
- Hover a cell → corresponding chat bubble highlights with an accent ring
  悬停单元格 → 对应聊天气泡高亮显示
- Click a cell → chat scrolls smoothly to that message
  点击单元格 → 聊天平滑滚动到该消息

**Native shell | 原生外壳**
- Tauri 2, Rust backend, no Electron, no CDN dependencies
  Tauri 2、Rust 后端、无 Electron、无 CDN 依赖
- Frameless window with custom traffic-light / drag region on Windows and macOS
  无框窗口，Windows 和 macOS 自定义红绿灯/拖拽区域
- Native folder picker for opening projects
  原生文件夹选择器用于打开项目
- Strict CSP; asset protocol disabled; no shell plugin surface
  严格 CSP；资产协议已禁用；无 Shell 插件接口

**Harness governance | Harness 治理**
- Read-only Harness Inspector: view project memories, proposals, and state
  只读 Harness 检查器：查看项目记忆、提案和状态
- Human-governed proposals: preview → approve → apply or rollback
  人工治理提案：预览 → 审批 → 应用或回滚
- Source terminal sessions remain read-only; desktop work uses writable forks
  源终端会话保持只读；桌面工作使用可写副本

![Chat](screenshots/1.jpg)
![Tools](screenshots/2.jpg)
![Minimap](screenshots/3.jpg)
![Harness Inspector](harness-empty-state.png)

---

## Architecture | 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri WebView  (src/)                                          │
│                                                                 │
│  app-live.jsx ──► OMP_BRIDGE ──► live.js                       │
│       │                │                                        │
│  React state    RPC event handlers                              │
│  (messages,     (turn, message, tool,                          │
│   model, ctx,    extension_ui, sparkline)                       │
│   kanban…)             │                                        │
│                  adapter.js (pure transforms)                   │
└────────────────────────┬────────────────────────────────────────┘
                         │  Tauri IPC (invoke / events)
┌────────────────────────▼────────────────────────────────────────┐
│  Rust  (src-tauri/src/)                                         │
│                                                                 │
│  HostBridge                                                     │
│    spawn  compiled Desktop Host (TypeScript)                    │
│    stdin  ◄── framed requests (4-byte length prefix)            │
│    stdout ──► framed responses                                  │
│    supervise  process tree (Windows Job Object)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │  stdio framed protocol
┌────────────────────────▼────────────────────────────────────────┐
│  Desktop Host (apps/desktop-host/)                              │
│                                                                 │
│  - Compiled TypeScript sidecar (Bun)                            │
│  - Verifies OMP Runtime 17.4.1 by SHA-256 hash                  │
│  - Spawns `omp --mode rpc` as verified child process            │
│  - Manages session lifecycle, forks, read-only history          │
│  - Harness inspection + human-governed mutations                │
└────────────────────────┬────────────────────────────────────────┘
                         │  stdin/stdout pipes
┌────────────────────────▼────────────────────────────────────────┐
│  omp Runtime  (omp-windows-x64.exe, pinned 17.4.1)              │
│    JSON-line RPC protocol                                       │
│    streams AgentSessionEvents to stdout                         │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions | 关键决策**

| 决策 | 说明 |
|------|------|
| 捆绑 Runtime | 固定 OMP Runtime 17.4.1，通过 SHA-256 校验，不依赖系统 PATH |
| TypeScript Host | 协议层移至 TypeScript，Rust 仅负责系统生命周期管理 |
| 会话隔离 | 源终端会话只读；桌面副本可写，互不影响 |
| 人工治理 | Harness 修改需人工审批，支持快照和回滚 |
| 中文优先 | 界面首先本地化为中文，技术术语保留原文 |

---

## Requirements | 系统要求

| Tool | Version |
|------|---------|
| [Rust](https://rustup.rs/) | stable (1.77+) |
| [Node.js](https://nodejs.org/) | 18+ |
| [Bun](https://bun.sh/) | latest (for Host build) |
| [Tauri CLI](https://tauri.app/start/prerequisites/) | 2.x (`npm install`) |

**No system `omp` required.** The bundled Runtime is verified by hash before launch.

无需系统安装 `omp`。捆绑的 Runtime 在启动前会通过哈希验证。

---

## Getting Started | 快速开始

```bash
# Clone | 克隆
git clone https://github.com/bb6894/omp-desktop
cd omp-desktop

# Install dependencies | 安装依赖
npm install
bun install --cwd apps/desktop-host --frozen-lockfile

# Fetch pinned Runtime | 获取固定版 Runtime
npm run runtime:fetch

# Dev mode — hot-reloads frontend, rebuilds Rust on backend changes
# 开发模式——前端热重载，后端 Rust 更改时自动重建
npm run dev

# Production build | 生产构建
npm run build

# Full local verification | 本地完整验证
npm run verify
```

---

## Project Structure | 项目结构

```
omp-desktop/
├── src/                        # Frontend (served by Tauri asset server)
│   ├── index.html              # Entry point — declares script load order
│   ├── app-live.jsx            # React root: state + handlers + render
│   ├── live.js                 # Tauri IPC bridge + OMP_BRIDGE + OMP_DATA
│   ├── adapter.js              # Pure RPC→UI data transforms (no side effects)
│   ├── model-names.js          # Model ID → display name lookup table
│   ├── platform.css            # Tauri-native overrides (no padding/shadow/radius)
│   ├── react.development.js    # React 18 (local, no CDN)
│   ├── react-dom.development.js
│   ├── babel.min.js            # @babel/standalone for JSX transform
│   ├── marked.min.js           # Markdown renderer
│   ├── highlight.min.js        # Syntax highlighting (atom-one-dark theme)
│   ├── highlight-theme.css
│   │
│   ├── app/                    # App-root helpers (extracted from app-live.jsx)
│   │   ├── constants.js        # TWEAK_DEFAULTS, NULL_MODEL, framing strings
│   │   └── use-bridge-snapshot.jsx  # Custom hooks: bridge subscription, theme, ⌘K
│   │
│   └── design/                 # UI components, split by domain
│       ├── ui/
│       │   ├── icons.jsx           # OMP Icon Pack v1 + TOOL_META
│       │   ├── sparks.jsx          # Sparkline, TokenGauge, ActivityRadar
│       │   ├── markdown.jsx        # MarkdownContent (marked + hljs)
│       │   └── plan-annotations.jsx # AnnotablePlan + CommentForm
│       ├── chat/
│       │   ├── user-bubble.jsx
│       │   ├── assistant-bubble.jsx # AssistantBubble + InlinePlan
│       │   ├── eval-cell.jsx        # Syntax-highlighted kernel cell
│       │   ├── tool-card.jsx        # ToolCard + ScrubbableDiff
│       │   └── chat-view.jsx        # Auto-scroll wiring + bubble routing
│       ├── tweaks/
│       │   ├── style.js             # __TWEAKS_STYLE template
│       │   ├── use-tweaks.js        # useTweaks hook
│       │   ├── panel.jsx            # TweaksPanel + TweakSection + TweakRow
│       │   └── controls.jsx         # Slider/Toggle/Radio/Select/etc.
│       ├── layout/                  # CSS by visual layer (chained @import)
│       │   ├── _index.css
│       │   ├── chrome.css           # App + window chrome + Tabs
│       │   ├── stage.css            # Stage layout + session column
│       │   ├── chat.css             # Chat surface, inline plan, tool cards
│       │   ├── composer.css         # Composer + slash palette
│       │   ├── rail.css             # Status bar + ambient rail + minimap
│       │   └── overlays.css         # ⌘K bridge + kanban + plan annotations
│       ├── chrome.jsx               # WindowChrome, TabBar, StatusBar, AmbientRail, SessionMinimap
│       ├── composer.jsx             # Composer + CommandBridge (⌘K palette)
│       ├── panels.jsx               # PlanKanban (kanban view)
│       ├── layout.css               # Single @import → layout/_index.css
│       └── styles.css               # Visual tokens (colours, spacing, type)
│
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs             # Binary entry point
│   │   ├── lib.rs              # Tauri setup, command registration
│   │   ├── host.rs             # HostBridge: one compiled Desktop Host per tab
│   │   ├── process_supervisor.rs # Windows Job Object for process tree cleanup
│   │   └── local_frame.rs      # Framed protocol (4-byte length prefix)
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Window config + strict CSP
│   └── capabilities/
│       └── default.json        # Tauri capability grants
│
├── apps/desktop-host/          # TypeScript Desktop Host (compiled to exe)
│   ├── src/
│   │   ├── main.ts             # Entry point, serves framed protocol
│   │   ├── contracts.ts        # Request/response DTOs
│   │   ├── session-service.ts  # Allowlisted request dispatch
│   │   ├── agent-service.ts    # OMP runtime management
│   │   ├── harness-*.ts        # Harness inspection + mutation
│   │   ├── runtime.ts          # Runtime verification (SHA-256)
│   │   └── omp-vendor.ts       # Only module that imports @oh-my-pi/*
│   └── tests/                  # Host boundary and fixture tests
│
├── docs/
│   ├── agents/                 # Agent skill documentation
│   │   ├── issue-tracker.md    # GitHub Issues conventions
│   │   ├── triage-labels.md    # Triage label vocabulary
│   │   └── domain.md           # Repository structure conventions
│   ├── adr/                    # Architecture Decision Records
│   └── plans/                  # Design documents
├── screenshots/                # README assets
├── .gitattributes
├── .gitignore
├── README.md
├── CLAUDE.md                   # Development guide (detailed)
└── package.json
```

---

## RPC Protocol | RPC 协议

The frontend communicates with `omp` exclusively through the Tauri IPC bridge. `live.js` sends JSON commands via `invoke("send_command", { sessionId, json })` and receives `agent://line` events emitted by the Rust stdout reader.

前端通过 Tauri IPC 桥接与 `omp` 通信。`live.js` 通过 `invoke("send_command")` 发送 JSON 命令，并通过 Rust stdout 读取器接收 `agent://line` 事件。

### Commands sent | 发送的命令

| Command | When | 触发时机 |
|---------|------|----------|
| `get_state` | On `ready`, after each `turn_end` | 就绪后、每轮结束后 |
| `get_messages` | On `ready` | 就绪后 |
| `get_available_models` | On `ready` | 就绪后 |
| `prompt` | User sends a message | 用户发送消息 |
| `abort` | User clicks abort | 用户点击中止 |
| `set_model` | User picks a model in ⌘K bridge | 用户在 ⌘K 桥中选择模型 |
| `cycle_model` | User clicks `/model` command | 用户运行 `/model` 命令 |
| `cycle_thinking_level` | User cycles thinking in composer | 用户在编辑器循环思考级别 |
| `compact` | User runs `/compact` | 用户运行 `/compact` |
| `export_html` | User runs `/export` | 用户运行 `/export` |
| `get_session_stats` | After each `turn_end` | 每轮结束后 |
| `extension_ui_response` | Auto-cancel for interactive UI requests | 自动取消交互式 UI 请求 |

### Events received | 接收的事件

| Event | Handler | 处理 |
|-------|---------|------|
| `ready` | Bootstraps initial data fetches | 初始化数据获取 |
| `turn_start` / `turn_end` | Streaming state, TPS calculation, cost accumulation | 流式状态、TPS 计算、费用累积 |
| `message_start` | Creates user/assistant bubbles; stamps model name | 创建气泡、标记模型 |
| `message_update` | Updates streaming bubble from accumulated content | 更新流式气泡 |
| `message_end` | Finalises bubble (`streaming: false`) | 完成气泡 |
| `tool_execution_start` | Creates running tool card | 创建运行中工具卡片 |
| `tool_execution_end` | Finalises tool card with result/diff/output | 完成工具卡片 |
| `extension_ui_request` | Interactive types auto-cancelled; others ignored | 交互式类型自动取消 |
| `agent_start` / `agent_end` | Re-fetches session state | 重新获取会话状态 |

---

## Key Design Decisions | 关键设计决策

**`omp --mode rpc` not `omp --rpc`** — `--rpc` is not a valid flag; omp falls through to interactive TUI mode and outputs ANSI escape codes instead of JSON. Confirmed from source.

`omp --mode rpc` 而非 `omp --rpc`——`--rpc` 不是有效标志；omp 会回落到交互式 TUI 模式并输出 ANSI 转义码而非 JSON。

**Bundled Runtime with hash verification** — The OMP Runtime binary (`omp-windows-x64.exe`) is pinned to version 17.4.1 and verified by SHA-256 before launch. This eliminates PATH dependency and ensures consistent behavior.

**捆绑 Runtime 带哈希验证**——OMP Runtime 二进制文件固定为 17.4.1 版本，启动前通过 SHA-256 验证。消除了 PATH 依赖并确保行为一致。

**Source sessions read-only** — Terminal sessions remain `history-readonly`; desktop work uses `desktop-owned` forks. The Rust and UI never parse or rewrite OMP's private session files.

**源会话只读**——终端会话保持 `history-readonly`；桌面工作使用 `desktop-owned` 副本。Rust 和 UI 从不解析或重写 OMP 的私有会话文件。

**Human-governed Harness** — The only renderer-reachable Harness write surface is the explicit three-command flow: `preview` → `apply` (with human approval) → `rollback`. The Desktop Host builds all proposal context; the renderer cannot inject binding fields.

**人工治理 Harness**——渲染器可访问的 Harness 写入表面仅有明确三步流程：`preview` → `apply`（需人工审批）→ `rollback`。Desktop Host 构建所有提案上下文；渲染器无法注入绑定字段。

**Blank line = skip, not EOF** — The Rust stdout reader uses `Ok("") => continue`, `Err(_) => break` so blank lines from omp don't kill the reader thread silently.

**空行 = 跳过，非 EOF**——Rust stdout 读取器使用 `Ok("") => continue`，`Err(_) => break`，这样 omp 的空行不会静默终止读取线程。

---

## Tauri Commands | Tauri 命令

| Command | Signature | Description |
|---------|-----------|-------------|
| `start_session` | `(sessionId: String, cwd: String) → Result<()>` | 为新标签页启动 omp 会话 |
| `stop_session` | `(sessionId: String) → ()` | 终止该标签页的 omp 进程 |
| `send_command` | `(sessionId: String, json: String) → Result<()>` | 向该会话的 omp stdin 写入 JSON |
| `session_status` | `(sessionId: String) → Option<String>` | 返回缓存的启动错误（如有） |
| `open_project` | `() → Result<Option<String>>` | 原生文件夹选择对话框 |
| `start_git_watch` | `(sessionId: String, path: String) → Option<String>` | 监听 .git/HEAD 变化 |
| `stop_git_watch` | `(sessionId: String) → ()` | 停止 git 监听 |
| `preview_harness_memory` | `(sessionId: String, payload: Value) → Result<Value>` | 预览 Harness 修改提案 |
| `apply_harness_memory` | `(sessionId: String, preview: Value, approval: Value) → Result<Value>` | 应用已审批的提案 |
| `rollback_harness` | `(sessionId: String, reason: String) → Result<Value>` | 回滚到上次快照 |
| `inspect_harness` | `(sessionId: String) → Result<Value>` | 查看 Harness 状态（只读） |
| `open_url_external` | `(url: String) → Result<()>` | 在系统浏览器中打开 URL |

---

## Frontend State Flow | 前端状态流

```
omp stdout
  └─► agent://line Tauri event
        └─► handleLine(rawLine)
              ├─► _handleResponse(resp)   — RPC 响应处理
              │     ├── get_state         → _applyRpcState() → notify()
              │     ├── get_available_models → state.models → notify()
              │     ├── set_model         → state.model + current flags → notify()
              │     └── cycle_model       → state.model + thinkingLevel → notify()
              └─► _handleEvent(ev)        — AgentSessionEvent 处理
                    ├── turn_start/end    → isStreaming, TPS, cost
                    ├── message_*         → streamingBubble 生命周期
                    ├── tool_execution_*  → tool 卡片管理
                    └── extension_ui_request → 交互式 UI 自动取消

notify()
  ├─► subscribers (OMP_BRIDGE.onUpdate 回调)
  │     └─► React setState 调用 (app-live.jsx)
  └─► window.OMP_DATA 同步（供直接读取全局量的组件使用）
```

---

## Tweaks | 调校

Open the Tweaks panel (the floating panel in the bottom-right) to adjust:

打开调校面板（右下角浮动面板）进行调整：

| Setting | Options | 设置项 | 选项 |
|---------|---------|--------|------|
| Theme | aurora · phosphor · daylight | 主题 | 极光 · 荧光终端 · 日光 |
| Density | cozy · compact · dense | 密度 | 舒适 · 紧凑 · 密集 |
| Accent colour | 6 presets + custom | 强调色 | 6 种预设 + 自定义 |
| Mono chat font | toggle | 聊天等宽字体 | 开关 |
| Font size | 75%–150% | 字体大小 | 75%–150% |
| Layout | rail · split · focus | 布局 | 侧栏 · 分屏 · 专注 |

---

## Development Notes | 开发说明

**No bundler** — JSX is transpiled in the WebView by the vendored `@babel/standalone`. Script load order in `src/index.html` **is** the dependency graph.

**无打包器**——JSX 由 vendored 的 `@babel/standalone` 在 WebView 中转译。`src/index.html` 中的脚本加载顺序**就是**依赖图。

**Windows 11 target** — Uses `color-mix(in oklab, …)` which requires WebView2 ≥ 101 (Windows 11 default). The frameless window (`decorations: false`) relies on DWM for corner rounding.

**Windows 11 目标平台**——使用 `color-mix(in oklab, …)`，需要 WebView2 ≥ 101（Windows 11 默认）。无框窗口（`decorations: false`）依赖 DWM 实现圆角。

**Strict CSP** — `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Asset protocol disabled. `tauri-plugin-shell` deliberately removed. Don't add CDN tags or `convertFileSrc()` without revisiting both.

**严格 CSP**——`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'`。资产协议已禁用。`tauri-plugin-shell` 已刻意移除。添加 CDN 标签或 `convertFileSrc()` 前需重新评估。

**Authoritative frontend source** — `src/design/` is the live-wired copy. Root-level `design/` is a gitignored read-only prototype reference. Edit `src/design/` directly; never regenerate from `design/`.

**前端权威来源**——`src/design/` 是实时连接的副本。根目录的 `design/` 是 gitignored 的只读原型参考。直接编辑 `src/design/`；不要从 `design/` 重新生成。

---

## 20-Point Acceptance Matrix | 验收矩阵

| # | Workflow | Status |
|---|----------|--------|
| 1 | Install and launch | 已验证 |
| 2 | Send first message | 已验证 |
| 3 | View streaming tokens | 已验证 |
| 4 | Switch between tabs | 待验收 |
| 5 | Open existing project | 已验证 |
| 6 | Use plan mode | 待验收 |
| 7 | View tool cards | 已验证 |
| 8 | Use minimap | 待验收 |
| 9 | Export session as HTML | 待验收 |
| 10 | Cycle thinking level | 待验收 |
| 11 | Change model | 待验收 |
| 12 | Run compact | 待验收 |
| 13 | Inspect Harness state | 已验证 |
| 14 | Apply Harness proposal | 已验证 |
| 15 | Rollback Harness change | 已验证 |
| 16 | Login via OAuth | 待验收 |
| 17 | Restore session from history | 待验收 |
| 18 | Use fork session | 待验收 |
| 19 | Handle abnormal termination | 待验收 |
| 20 | Tray icon / quick access | 未开始 |

---

## License | 许可证

MIT
