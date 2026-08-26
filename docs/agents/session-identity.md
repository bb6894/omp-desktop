# Session Identity & Lifecycle — Phase 0 Evidence

Status: **T0.1–T0.4 COMPLETE.** Automated proof:
`apps/desktop-host/tests/session-identity.test.ts` — 3 pass / 0 fail against
the pinned bundled runtime (sha256 manifest-verified, RPC v2 negotiated through
the production `OmpRpcBridge`). Raw frames:
`docs/agents/evidence/runtime-session-identity.json` (credential-redacted).
Probe tool: `tools/rpc-session-probe.ts`.

## Binding table (the normative triangle)

| Side | Identifier | Stability | Role |
|---|---|---|---|
| Tauri route | tab/session id string (`start_session(session_id, cwd)`) | per project window | routes framed requests to the right Desktop Host child |
| Host `SessionRecord.id` | **canonical OMP UUID** (`SessionInfo.id`) = UUID component of the stem `<ISO>_<uuid>.jsonl` | durable, 1:1 with file | product-facing session identity |
| Runtime `get_state().sessionFile` | absolute path to that `.jsonl` | durable anchor | THE join key |
| Runtime `get_state().sessionId` | live-instance id | **NOT a join key**: minted fresh on first load of a file, persisted opportunistically, restored on re-load (proven A→B→A returns the identical id; first-load ids differ from the file's stored uuid) | informational only |

**Rules that follow (binding-safe):**

1. The renderer speaks only Host `SessionRecord.id`s.
2. The Host resolves id → `SessionRecord.sourcePath` → Runtime
   `switch_session { sessionPath }`. Renderer never sees or submits paths.
3. Restore assertions compare FILE PATHS (`get_state().sessionFile === target`),
   never `sessionId` equality.
4. `switch_session` with a bad path fails honestly
   (`success:false, error:"EPERM: operation not permitted, mkdir '\\'"`) — no
   silent fallback; surfaces as a stable error to the caller.

## Creation laziness (finding)

`new_session` does **not** create a file: sessions are in-memory until the
first persisted turn entry; offline header writes (`set_session_name`) do not
materialize it either (proven by direct probe). Identity therefore exists
before its file — creation-binding evidence requires one minimal real turn,
which is what the automated tests perform.

## Confirmed wire surface (pinned 17.4.1, rpc-types.d.ts + live frames)

- Handshake: runtime emits `{type:"ready",supportedProtocolVersions:[1,2],…}`;
  host sends `negotiate_protocol {protocolVersion:2}` → `{success:true,
  data:{protocolVersion:2}}`.
- `get_state {}` → `data:{ sessionId, sessionFile?, sessionName?, model{…},
  thinkingLevel, isStreaming, messageCount, … }`.
- `new_session { parentSession? }` → `{success:true,data:{cancelled:false}}`.
- `switch_session { sessionPath }` → `{success:true,data:{cancelled:false}}`
  on real paths; structured failure on impossible ones.
- Launch contract: `spawnVerifiedRuntime` pins `--mode rpc --cwd <proj>
  --session-dir <dir>` after sha256 manifest check — the HOST controls where
  sessions live; discovery and Runtime writes share that directory by
  construction.

## Security finding (recorded, mitigated at boundary)

`get_state` (and likely other data-bearing responses) echo provider credentials
inside `data.model.headers.Authorization`. Mitigations verified today:

- Production boundary: `AgentService.handleFrame` runs every inbound frame
  through `sanitizeFrame`/`sanitizeValue`
  (`apps/desktop-host/src/agent-service.ts:144-164`), which recursively deletes
  `headers`/`authorization`/`api[_-]?key`/token/password/secret/credential
  keys before any HostEvent reaches a renderer.
- Evidence tooling: the probe redacts `Authorization` keys and `sk-…` tokens
  before printing/writing; committed evidence file scans clean.
- Standing rule for later phases: any NEW consumer of raw Runtime frames must
  sit behind the same sanitizer; forbidden to pipe unsanitized frames to
  UI/logs.

## Phase 0 checklist

- [x] T0.1 Runtime identity evidence (this document + JSON fixture + probe).
- [x] T0.2 Create-binding test: first persisted turn → discovered
      `SessionRecord` with uuid/path/cwd equality (and laziness documented).
- [x] T0.3 Restore-binding test: record-derived path → `switch_session`;
      file-level assertions; bad path fails closed.
- [x] T0.4 Two-runtime isolation: distinct files/directories, zero discovery
      cross-visibility, teardown-of-A leaves B answering, A bytes untouched.
