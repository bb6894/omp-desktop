# Legacy Renderer Bridge Characterization

Status: read-only characterization for Product Reset Plan 1.  Observed from
`src/live.js`, `src/app/harness-client.js`, `src-tauri/src/lib.rs`,
`src-tauri/src/host.rs`, and `apps/desktop-host/src/session-service.ts`.

## Boundary summary

The legacy renderer has one public browser seam: `window.OMP_BRIDGE`. In Tauri
mode it sends ordinary Agent commands through the Rust `send_command` command;
Rust wraps those JSON objects as Host `agent.command` requests. Dedicated
session and Harness operations use explicit Rust commands, which call
`HostBridge::request` directly. The renderer never parses local frames or raw
OMP RPC frames.

## Public Bridge surface

The following table is the complete `window.OMP_BRIDGE` literal. “Notify” means
the method mutates the in-memory snapshot and calls subscribers; an Agent
response or event may cause additional notifications later.

| Method | Request / local action | Return | Notify / emitted effects |
|---|---|---|---|
| `isConnected` | Read Tauri presence + active session | boolean | none |
| `send(text, images?)` | `agent.command` → `prompt`, optimistic user message | void | notify; Agent events update chat |
| `abort()` | `agent.command` → `abort` | void | Agent events may stop streaming |
| `followUp(text)` | `agent.command` → `follow_up` | void | Agent response/events |
| `steer(text)` | `agent.command` → `steer` with empty images | void | notify; Agent events |
| `setModel(model)` | `agent.command` → `set_model` | void | response updates model |
| `cycleModel()` | `agent.command` → `cycle_model` | void | response updates model |
| `cycleThinking()` | `agent.command` → `cycle_thinking_level` | void | response updates effort |
| `compact()` | Adds pending compact marker; `agent.command` → `compact` | void | notify; compact response marks done/error |
| `newSession()` | `agent.command` → `new_session` | void | response resets and refetches state |
| `exportHtml()` | `agent.command` → `export_html` | void | Agent response only |
| `refreshModels()` | Sends `get_state`, `get_messages`, `get_available_models` | void | responses notify |
| `inspectHarness(sessionId?)` | dedicated `inspect_harness` Rust command | Promise<inspection> | no local mutation |
| `previewHarnessMemory(payload, sessionId?)` | dedicated preview command; payload is validated by harness client | Promise<preview> | no local mutation |
| `applyHarnessMemory(preview, approval, sessionId?)` | dedicated apply command with exact preview + human approval | Promise<outcome> | no local mutation; UI refreshes separately |
| `rollbackHarness(reason, sessionId?)` | dedicated rollback command | Promise<outcome> | no local mutation; UI refreshes separately |
| `getLoginProviders()` | `agent.command` → `get_login_providers`, correlated by id | Promise<data> | no state mutation |
| `login(providerId)` | `agent.command` → `login`, 5-minute timeout | Promise<data> | OAuth events may open browser |
| `answerAsk(id, value)` | Marks pending ask answered; `agent.command` → `extension_ui_response` | void | notify; response event completes request |
| `addAssistantMessage(text)` | Appends a local completed assistant message | void | notify |
| `openSession(cwd?)` | Registers tab; Rust `start_session`, optional git watch; activates | Promise<sessionId> | tab/session notifications |
| `activateSession(id)` | Switches active tab, tears down old listeners, refetches | Promise<void> | notify; future events use new listener set |
| `closeSession(id)` | Rust `stop_session` + git watch stop; removes tab/snapshot | Promise<void> | notify; may activate remaining tab |
| `pickFolder()` | Rust `open_project` native picker | Promise<string|null> | none |
| `onUpdate(callback)` | Registers callback and immediately sends current snapshot | unsubscribe function | callback receives every `notify()` snapshot |
| `getState()` | Reads live in-memory state object | state object | none |

`send`, `steer`, `answerAsk`, and `compact` make local optimistic changes;
`getState` returns the mutable internal object by reference. The newer Harness
methods reject a request whose explicit session id is not the current active id
with `HARNESS_SESSION_CHANGED` before invoking Tauri.

## Top-level Host operation surface

This is deliberately separate from the nested Runtime command list. These are
the operations handled by `SessionService` and reachable through dedicated
Rust request helpers or the local Host protocol:

| Operation | Accepted shape | Result / failure behavior |
|---|---|---|
| `session.list` | `{ requestId, type }` | read-only session records |
| `session.messages` | `sessionId`, nullable `cursor`, numeric `limit` | paged history; stale cursor is stable error |
| `session.fork` | `sessionId` | creates a `desktop-owned` child; source remains read-only |
| `harness.inspect` | `{ requestId, type }` | read-only Harness inspection or stable Harness code |
| `harness.preview` | operation/title/content, optional targetId | Host-bound read-only proposal |
| `harness.apply` | exact preview + `{ approvedBy, reason }` | human-governed mutation outcome |
| `harness.rollback` | non-blank reason | rollback outcome |
| `agent.start` | `sessionId`, prompt | starts the Host Agent service |
| `agent.stop` | `sessionId` | stops the Host Agent service |
| `interaction.respond` | session, interaction id, value | answers a pending interaction |
| `agent.command` | session + closed nested command object | only the separately allowlisted Runtime command types |

Unknown top-level names, malformed shapes, extra fields, and duplicate request
ids fail closed. The nested `agent.command` names are not part of this table's
allowlist assertion; they are owned by the Agent/RPC tests.

## State and event shapes

`onUpdate` snapshots contain `messages`, `isStreaming`, `model`,
`thinkingLevel`, `ctx`, `kanban`, `planMeta`, `models`, `activity`,
`sparkline`, `sessions`, and `activeSessionId`. Messages are renderer-adapted
objects: user/assistant text, streaming assistant bubbles, tool cards, ask
bubbles, and compact markers. The adapter also provides `projects` in the
initial data defaults, but the update snapshot is the authoritative shape
listed above.

Runtime events arrive as JSON lines from Rust's `agent://line/<sessionId>`
event and are reduced into the snapshot. Important lifecycle events are
`turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`,
`tool_execution_start/update/end`, `extension_ui_request`, `agent_start`, and
`agent_end`. `turn_end` refreshes session stats and state; `get_messages`
reconciles persisted text with live-only tool/ask/compact entries.

Responses correlated by an id resolve/reject `_sendWithResponse` promises.
Uncorrelated successful responses update state for `get_state`,
`get_messages`, model commands, `new_session`, and compact markers. Failed
uncorrelated responses are ignored except compact, which records an error.

## Ownership, switching, and staleness

`sessionRegistry` maps tab ids to project metadata. Each tab maps to one Rust
`HostBridge` entry and one compiled Desktop Host process. Rust assigns a
generation to each start and only lets the matching stdout reader remove the
session, so a stale process exit cannot remove a replacement. Host request
ids are unique and pending responses time out after 30 seconds.

Concrete ids observed in the existing wiring and fixtures are `default`,
`terminal-1`, and `desktop-1`; `openSession()` also generates ids of the form
`session-<epoch-milliseconds>`. The current boundary proves non-empty strings
up to 128 characters, but does not justify a narrower character whitelist.

The renderer stores one `activeSessionId`, tears down old event listeners before
installing `agent://line/<id>` and `agent://exit/<id>` listeners, snapshots
per-tab UI state, then refetches state/messages/models. Harness calls perform
an explicit active-session equality check; stale calls fail closed. Ordinary
`send_command` requests carry the active id at invocation time, so callers must
not retain a stale Bridge operation across a tab switch.

## Observed session-id format (Task 1 evidence)

Real session files live under
`%USERPROFILE%\.omp\agent\sessions\<sanitized-project-dir>\`; desktop forks sit
in the same tree under `desktop-sessions\`. The file-name stem is the session
id. Concrete examples observed on this machine (2026-08-24):

- `2026-08-21T14-35-29-102Z_01a024bf-8fce-7606-9084-25af26d20c37.jsonl`
  (terminal source session)
- `2026-08-23T10-49-39-845Z_01a02e3d-8904-7000-86d6-344782e8deb7.jsonl`
  (terminal source session)
- `2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8.jsonl`
  (desktop-owned fork)

Structure: `<ISO-8601 timestamp, ":" replaced by "-">Z_<UUIDv7>` — the UUID's
third group begins with `7` (time-ordered version). Typical stem length is
61 chars; charset stays inside `[A-Za-z0-9._-]`. Task 2's `taskId` guard
should therefore enforce charset + length (≤128, never empty) only; do not
hard-code the `<timestamp>_<uuid>` split, since OMP owns the id shape and may
change it between runtime versions.

## Sharp edges retained for the reset

- `src/index.html` script order is the dependency graph; there is no module
  resolver and every plain script follows the IIFE rule.
- Source terminal history is read-only. Writable work is a desktop-owned fork;
  no UI operation may rewrite the source session file.
- Rust/Tauri is the only local-frame and process-supervision boundary. The UI
  must not import OMP packages, parse RPC frames, or add direct Runtime access.
- The current legacy renderer is no-bundler and Babel-transpiled. A new shell
  must remain branch-only until a separately gated cutover.
- Startup errors are queried through `session_status` after listeners attach;
  process-exit events and stale cursors must be surfaced without echoing
  untrusted payloads into diagnostics.
- Harness mutation is explicit human approval, Host-bound, and separate from
  `send_command`; it does not alter Runtime prompts in this stage.
