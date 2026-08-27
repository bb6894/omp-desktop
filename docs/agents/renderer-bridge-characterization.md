# Renderer Bridge Characterization

Status: current shipping characterization for the Vite/React workbench. The
legacy no-bundler renderer was removed in the Session Workbench v1 cutover.

## Boundary summary

`renderer-next/src/bridge/tauri-product-bridge.ts` is the only renderer
transport. Dedicated session, workspace, and Harness operations call explicit
Tauri commands. Agent controls use the existing `send_command` wrapper with a
nested `agent.command` payload. The renderer submits session ids and
project-relative workspace paths; Host and Rust own file-path derivation and
validation.

## ProductBridge surface

The typed `ProductBridge` in `renderer-next/src/bridge/product-bridge.ts`
exposes session listing and metadata, paged messages, event subscription,
session creation/fork/restore, composer controls, interaction responses,
abort, and bounded workspace status/diff reads. The fixture transport and
cross-tree product-contract aliases were removed at cutover; tests inject
Tauri seams instead.

## Top-level Host operation surface

These operations are handled by `SessionService` and reachable through the
local Host protocol or dedicated Rust request helpers:

| Operation | Accepted shape | Result / failure behavior |
|---|---|---|
| `session.list` | `{ requestId, type }` | read-only session records |
| `session.messages` | `sessionId`, nullable `cursor`, numeric `limit` | paged history; stale cursor is stable error |
| `get_messages_page` | `sessionId`, cursor, limit | paged message history via Runtime RPC v2; stable `MESSAGES_PAGE_*` error codes |
| `session.fork` | `sessionId` | creates a `desktop-owned` child; source remains read-only |
| `session.views` | `{ requestId, type }` | Host-assembled session views + metadata/prune counts, or stable `SESSION_METADATA_*` code |
| `session.metadata.set` | `sessionId` (target), patch (`archived` / `pinned` / `lastViewedAt`) | merged record or stable validation/lock code |
| `session.open_runtime` | `sessionId` (target desktop copy) | `{ sessionId, state:"ready" }` after Host-internal switch |
| `harness.inspect` | `{ requestId, type }` | read-only Harness inspection or stable Harness code |
| `harness.preview` | operation/title/content, optional targetId | Host-bound read-only proposal |
| `harness.apply` | exact preview + `{ approvedBy, reason }` | human-governed mutation outcome |
| `harness.rollback` | non-blank reason | rollback outcome |
| `agent.start` | `sessionId`, prompt | starts the Host Agent service |
| `agent.stop` | `sessionId` | stops the Host Agent service |
| `interaction.respond` | session, interaction id, value | answers a pending interaction |
| `agent.command` | session + closed nested command object | only separately allowlisted Runtime command types |
| `workspace.status` | `{ requestId, type }` | bounded changed-file list or `WORKSPACE_*` code |
| `workspace.diff` | `path` (project-relative) | bounded diff result or stable validation code |
| `events.replay` | `sessionId`, `afterSeq` | journaled timeline events after `afterSeq`; `dropped=true` requires message re-hydration |
| `approval.rules.list` | `sessionId` | `{ session, project }` grant lists for the routed session |
| `approval.rules.add` | `sessionId`, `tool`, `scope`, `sourceInteractionId` | grant outcome; tool charset/scope validated, duplicates return `created:false` |
| `approval.rules.remove` | rule `id` (`session:<tool>` / `project:<tool>`) | `{ removed }`; idempotent |
| `host_tool.call` | `sessionId`, `tool`, `action`, optional `text`/`image` | clipboard read/write text or images; fails `CLIPBOARD_UNAVAILABLE` when not wired |

Unknown top-level names, malformed shapes, extra fields, and duplicate request
ids fail closed. The nested `agent.command` names are owned by Agent/RPC tests
and are not part of this table's top-level assertion.

## Session and event lifecycle

The workbench maintains a canonical session id to Host-route registry. It tears
down both `agent://line/<id>` and `agent://exit/<id>` listeners before arming
listeners for another session. Persisted messages hydrate through
`session.messages`; live Runtime events are folded by the pure timeline
reducer. Terminal histories remain `history-readonly` and can continue only
through the verified fork path.

## Security and ownership

The renderer never imports OMP packages, reads session files, or writes Harness
state directly. Harness mutation remains explicit human approval through the
three dedicated commands; the Host-issued preview cache and mutation executor
enforce the write boundary. Workspace paths are validated Host-side and are
bounded before any diff output reaches the renderer.
