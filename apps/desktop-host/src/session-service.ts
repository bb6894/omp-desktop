import type { HostEvent, HostResponse } from "./contracts";
import { EventJournal } from "./event-journal";
import { isValidApprovalTool } from "./approval-rules";
import { runStateEvent, systemNoteEvent, translateFrame } from "./timeline-events";
import type {
  InteractionResponse,
  RunStateValue,
  TimelineEvent
} from "../../../protocol/domain";
import { TIMELINE_EVENT_NAME } from "../../../protocol/domain";
import type { HarnessInspectorApi } from "./harness-contracts";
import type { HarnessMutationApi } from "./harness-mutation-contracts";
import type { OmpSessionAdapter } from "./omp-adapter";
import type { AgentState } from "./agent-service";
import { assembleSessionViews, isValidIsoTimestamp, isValidSessionId } from "./session-view";
import { validateRelativePath } from "./workspace";
import type {
  SessionMetadataIndex,
  SessionMetadataPatch,
  SessionMetadataRecord
} from "./session-metadata-store";

/** Storage seam for non-content session metadata; injected once per Host process. */
export type SessionMetadataApi = {
  get(): Promise<SessionMetadataIndex>;
  set(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataRecord>;
  prune(liveSessionIds: readonly string[]): Promise<number>;
};
/** Bounded project workspace seam (changes/diff); injected once per Host process. */
export type WorkspaceApi = {
  apply(path: string, action: "accept" | "reject"): Promise<{ ok: boolean; error?: string }>;

  status(): Promise<unknown>;
  diff(path: string): Promise<unknown>;
};

/** Storage seam for desktop-side approval grants; injected once per Host process. */
export type ApprovalRulesApi = {
  list(routeSessionId: string): Promise<{
    session: readonly { id: string; tool: string; createdAt: string }[];
    project: readonly { id: string; tool: string; createdAt: string }[];
  }>;
  grant(
    routeSessionId: string,
    input: { tool: string; scope: "session" | "project"; sourceInteractionId: string | null }
  ): Promise<{ created: boolean; rule: { id: string; tool: string; createdAt: string } | null }>;
  revoke(ruleId: string): Promise<boolean>;
};

export type AgentServiceApi = {
  start(sessionId: string, prompt: string): Promise<unknown>;
  stop(sessionId: string): Promise<unknown>;
  respond(sessionId: string, interactionId: string, response: InteractionResponse): Promise<unknown>;
  command(sessionId: string, command: Record<string, unknown>): Promise<unknown>;
  stateOf(sessionId: string): AgentState | null;
};

export type ClipboardApi = {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<{ data: string; mimeType: string } | null>;
  writeImage(data: string, mimeType: string): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseError(requestId: string, code: string, message = code): HostResponse {
  return { type: "response", requestId, ok: false, code, message };
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

const REQUEST_KEYS = {
  "session.list": ["requestId", "type"],
  "get_messages_page": ["cursor", "limit", "requestId", "sessionId", "type"],
  "session.messages": ["cursor", "limit", "requestId", "sessionId", "type"],
  "session.fork": ["requestId", "sessionId", "type"],
  "harness.inspect": ["requestId", "type"],
  "harness.preview": ["requestId", "type", "operation", "title", "content", "targetId"],
  "harness.apply": ["requestId", "type", "preview", "approval"],
  "harness.rollback": ["requestId", "type", "reason"],
  "agent.start": ["prompt", "requestId", "sessionId", "type"],
  "agent.stop": ["requestId", "sessionId", "type"],
  "interaction.respond": ["interactionId", "requestId", "response", "sessionId", "type"],
  "agent.command": ["command", "requestId", "sessionId", "type"],
  "session.views": ["requestId", "type"],
  "session.metadata.set": ["patch", "requestId", "sessionId", "type"],
  "session.open_runtime": ["requestId", "routeSessionId", "sessionId", "type"],
  "workspace.status": ["requestId", "type"],
  "workspace.diff": ["path", "requestId", "type"],
  "workspace.apply": ["action", "path", "requestId", "type"],
  "events.replay": ["afterSeq", "requestId", "sessionId", "type"],
  "approval.rules.list": ["requestId", "sessionId", "type"],
  "approval.rules.add": ["requestId", "sessionId", "type", "tool", "scope", "sourceInteractionId"],
  "host_tool.call": ["action", "image", "requestId", "sessionId", "text", "tool", "type"],
  "approval.rules.remove": ["id", "requestId", "type"]
} as const;

const VALID_RUN_STATES: Record<RunStateValue, true> = {
  idle: true,
  starting: true,
  streaming: true,
  "awaiting-tool": true,
  "awaiting-interaction": true,
  stopping: true,
  completed: true,
  interrupted: true,
  failed: true
};

function hasOnlyKeys(input: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(input).every((key) => allowedKeys.has(key));
}

function extractPayload(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.hasOwn(input, field)) payload[field] = input[field];
  }
  return payload;
}

const METADATA_PATCH_FIELDS = ["archived", "pinned", "lastViewedAt"] as const;

/** ≥1 known field, only known fields, values validated — merges are partial by design. */
function validateMetadataPatch(
  input: unknown
): { ok: true; value: SessionMetadataPatch } | { ok: false; code: string } {
  if (!isRecord(input)) return { ok: false, code: "SESSION_METADATA_INVALID_REQUEST" };
  const keys = Object.keys(input);
  if (keys.length === 0 || !keys.every((key) => (METADATA_PATCH_FIELDS as readonly string[]).includes(key))) {
    return { ok: false, code: "SESSION_METADATA_INVALID_REQUEST" };
  }
  const patch: SessionMetadataPatch = {};
  for (const key of keys) {
    const value = input[key];
    if (key === "archived" || key === "pinned") {
      if (typeof value !== "boolean") return { ok: false, code: "SESSION_METADATA_INVALID_REQUEST" };
      patch[key] = value;
    } else {
      if (value !== null && !isValidIsoTimestamp(value)) {
        return { ok: false, code: "SESSION_METADATA_INVALID_REQUEST" };
      }
      patch.lastViewedAt = value;
    }
  }
  return { ok: true, value: patch };
}

const KNOWN_ERRORS = new Set([
  "SESSION_NOT_FOUND",
  "SESSION_ALREADY_DESKTOP_OWNED",
  "STALE_CURSOR",
  "AGENT_ALREADY_RUNNING",
  "AGENT_NOT_RUNNING",
  "RUNTIME_NOT_FOUND",
  "RUNTIME_FILENAME_MISMATCH",
  "RUNTIME_HASH_MISMATCH",
  "INTERACTION_NOT_FOUND",
  "INTERACTION_RESPONSE_INVALID",
  "HARNESS_STATE_INVALID_JSON",
  "HARNESS_SCHEMA_UNSUPPORTED",
  "HARNESS_PROJECT_MISMATCH",
  "HARNESS_INCOMPATIBLE",
  "HARNESS_STATE_INVALID",
  "HARNESS_STATE_TOO_LARGE",
  "HARNESS_STATE_LIMIT_EXCEEDED",
  "HARNESS_SECRET_DETECTED",
  "SESSION_METADATA_INVALID_REQUEST",
  "SESSION_METADATA_INVALID_RECORD",
  "SESSION_METADATA_STORE_UNAVAILABLE",
  "SESSION_METADATA_LOCK_TIMEOUT",
  "SESSION_SOURCE_READONLY",
  "WORKSPACE_UNAVAILABLE",
  "WORKSPACE_PATH_INVALID",
  "CLIPBOARD_UNAVAILABLE"
]);

function knownError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  return KNOWN_ERRORS.has(message) ? message : null;
}

/** Local boundary for session operations, read-only Harness inspection, and the allowlisted Agent surface. */
export class SessionService {
  private readonly handledRequestIds = new Set<string>();
  private readonly runtimeBindings = new Map<string, string>();
  private readonly journal = new EventJournal();
  private readonly ignoredRuntimeFrames = new Map<string, number>();
  private eventSink: (event: HostEvent) => void = () => undefined;
  private agentService: AgentServiceApi | null = null;
  private workspace: WorkspaceApi | null = null;
  private clipboardApi: ClipboardApi | null = null;
  constructor(
    private readonly sessions: OmpSessionAdapter,
    private readonly harness: HarnessInspectorApi | null = null,
    private readonly mutations: HarnessMutationApi | null = null,
    sessionMetadata: SessionMetadataApi | null = null
  ) {
    this.sessionMetadata = sessionMetadata;
  }

  private sessionMetadata: SessionMetadataApi | null;

  private runtimeId(sessionId: string): string {
    return this.runtimeBindings.get(sessionId) ?? sessionId;
  }

  setAgentService(agentService: AgentServiceApi): void {
    this.agentService = agentService;
  }

  setSessionMetadata(sessionMetadata: SessionMetadataApi): void {
    this.sessionMetadata = sessionMetadata;
  }

  setWorkspace(workspace: WorkspaceApi): void {
    this.workspace = workspace;
  }

  setApprovalRules(approvalRules: ApprovalRulesApi): void {
    this.approvalRules = approvalRules;
  }

  setClipboardApi(clipboardApi: ClipboardApi): void {
    this.clipboardApi = clipboardApi;
  }
  setEventSink(eventSink: (event: HostEvent) => void): void {
    this.eventSink = eventSink;
  }

  /** Frames consumed without a timeline counterpart (diagnostics counter). */
  ignoredFrameCount(sessionId: string): number {
    return this.ignoredRuntimeFrames.get(sessionId) ?? 0;
  }

  /**
   * Single outbound sequencer: raw Runtime frames and agent-state records are
   * translated into protocol/domain timeline events, sequenced per session,
   * journaled for replay, and forwarded under `name: "timeline"`. The incoming
   * envelope sequence (minted by the agent services) is intentionally
   * superseded by the journaled payload `seq`.
   */
  emit(event: HostEvent): void {
    let translated: Omit<TimelineEvent, "v" | "seq" | "sessionId">[];
    if (event.name === "runtime.frame") {
      const result = translateFrame((event.payload ?? {}) as Record<string, unknown>);
      translated = result.events;
      if (result.ignored > 0) {
        this.ignoredRuntimeFrames.set(event.sessionId, (this.ignoredRuntimeFrames.get(event.sessionId) ?? 0) + result.ignored);
      }
    } else if (event.name === "agent.state") {
      const state = (event.payload as { state?: unknown } | undefined)?.state;
      if (typeof state !== "string" || !(state in VALID_RUN_STATES)) return;
      translated = [runStateEvent(state as RunStateValue)];
    } else if (event.name === "agent.note") {
      // Host-synthesized notes (e.g. rule-answered approval prompts); the
      // payload text is Host-owned, never renderer-supplied.
      const text = (event.payload as { text?: unknown } | undefined)?.text;
      if (typeof text !== "string" || text.length === 0 || text.length > 2000) return;
      translated = [systemNoteEvent(text)];
    } else {
      return;
    }
    for (const unsequenced of translated) {
      const sequenced = this.journal.append(event.sessionId, {
        ...unsequenced,
        v: 1,
        sessionId: event.sessionId
      });
      this.eventSink({
        type: "event",
        sessionId: event.sessionId,
        sequence: sequenced.seq,
        name: TIMELINE_EVENT_NAME,
        payload: sequenced
      });
    }
  }

  async dispatch(input: unknown): Promise<HostResponse> {
    if (!isRecord(input) || !isRequestId(input.requestId) || typeof input.type !== "string") {
      return responseError("unknown", "INVALID_REQUEST");
    }
    const requestId = input.requestId;
    if (this.handledRequestIds.has(requestId)) return responseError(requestId, "DUPLICATE_REQUEST_ID");
    this.handledRequestIds.add(requestId);
    const allowedKeys = Object.hasOwn(REQUEST_KEYS, input.type)
      ? REQUEST_KEYS[input.type as keyof typeof REQUEST_KEYS]
      : undefined;
    if (allowedKeys && !hasOnlyKeys(input, allowedKeys)) {
      return responseError(requestId, "INVALID_REQUEST");
    }
    try {
      switch (input.type) {
        case "session.list":
          return { type: "response", requestId, ok: true, value: await this.sessions.listReadOnly() };
        case "get_messages_page":
          if (typeof input.sessionId !== "string" || (input.cursor !== null && typeof input.cursor !== "string") || typeof input.limit !== "number") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.sessions.loadMessagesReadOnly(input.sessionId, input.cursor, input.limit)
          };
        case "session.messages":
          if (typeof input.sessionId !== "string" || (input.cursor !== null && typeof input.cursor !== "string") || typeof input.limit !== "number") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.sessions.loadMessagesReadOnly(input.sessionId, input.cursor, input.limit)
          };
        case "session.fork":
          if (typeof input.sessionId !== "string") return responseError(requestId, "INVALID_REQUEST");
          return { type: "response", requestId, ok: true, value: await this.sessions.forkFrom(input.sessionId) };
        case "harness.inspect":
          if (!this.harness) return responseError(requestId, "HARNESS_UNAVAILABLE");
          return { type: "response", requestId, ok: true, value: await this.harness.inspect() };
        case "harness.preview":
          if (!this.mutations) return responseError(requestId, "HARNESS_MUTATION_UNAVAILABLE");
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.mutations.preview(extractPayload(input, ["operation", "title", "content", "targetId"]))
          };
        case "harness.apply":
          if (!this.mutations) return responseError(requestId, "HARNESS_MUTATION_UNAVAILABLE");
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.mutations.apply(extractPayload(input, ["preview", "approval"]))
          };
        case "harness.rollback":
          if (!this.mutations) return responseError(requestId, "HARNESS_MUTATION_UNAVAILABLE");
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.mutations.rollback(extractPayload(input, ["reason"]))
          };
        case "agent.start":
          if (!this.agentService || typeof input.sessionId !== "string" || typeof input.prompt !== "string") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return { type: "response", requestId, ok: true, value: await this.agentService.start(this.runtimeId(input.sessionId), input.prompt) };
        case "agent.stop":
          if (!this.agentService || typeof input.sessionId !== "string") return responseError(requestId, "INVALID_REQUEST");
          return { type: "response", requestId, ok: true, value: await this.agentService.stop(this.runtimeId(input.sessionId)) };
        case "interaction.respond":
          if (
            !this.agentService ||
            typeof input.sessionId !== "string" ||
            typeof input.interactionId !== "string" ||
            !isRecord(input.response)
          ) {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.agentService.respond(
              this.runtimeId(input.sessionId),
              input.interactionId,
              input.response as InteractionResponse
            )
          };
        case "agent.command":
          if (!this.agentService || typeof input.sessionId !== "string" || !isRecord(input.command)) {
            return responseError(requestId, "INVALID_REQUEST");
          }
          if (!allowedAgentCommand(input.command)) return responseError(requestId, "COMMAND_NOT_ALLOWED");
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.agentService.command(this.runtimeId(input.sessionId), input.command)
          };
        case "events.replay": {
          if (!isValidSessionId(input.sessionId) || typeof input.afterSeq !== "number") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          // Journals are keyed by the emitting Host route; resolve the bound
          // route for a canonical session id, else replay from the raw id.
          let journalKey = input.sessionId;
          for (const [canonical, route] of this.runtimeBindings) {
            if (canonical === input.sessionId) journalKey = route;
          }
          return { type: "response", requestId, ok: true, value: this.journal.since(journalKey, input.afterSeq) };
        }
        case "session.views": {
          if (!this.sessionMetadata || !this.agentService) {
            return responseError(requestId, "SESSION_METADATA_STORE_UNAVAILABLE");
          }
          const records = await this.sessions.listReadOnly();
          const runStates: Record<string, AgentState | null> = {};
          for (const record of records) runStates[record.id] = this.agentService.stateOf(this.runtimeId(record.id));
          const pruned = await this.sessionMetadata.prune(records.map((record) => record.id));
          const metadata = await this.sessionMetadata.get();
          return {
            type: "response",
            requestId,
            ok: true,
            value: { ...assembleSessionViews(records, runStates), pruned, metadata }
          };
        }
        case "session.metadata.set": {
          if (!this.sessionMetadata) {
            return responseError(requestId, "SESSION_METADATA_STORE_UNAVAILABLE");
          }
          if (!isValidSessionId(input.sessionId)) {
            return responseError(requestId, "SESSION_METADATA_INVALID_SESSION_ID");
          }
          if (!isRecord(input.patch)) return responseError(requestId, "INVALID_REQUEST");
          const patch = validateMetadataPatch(input.patch);
          if (!patch.ok) return responseError(requestId, patch.code);
          const record = await this.sessionMetadata.set(input.sessionId, patch.value);
          return { type: "response", requestId, ok: true, value: { record } };
        }
        case "session.open_runtime": {
          if (!this.agentService) {
            return responseError(requestId, "AGENT_SERVICE_UNAVAILABLE");
          }
          if (!isValidSessionId(input.sessionId)) {
            return responseError(requestId, "SESSION_METADATA_INVALID_SESSION_ID");
          }
          const routeSessionId = typeof input.routeSessionId === "string" ? input.routeSessionId : input.sessionId;
          const records = await this.sessions.listReadOnly();
          const target = records.find((record) => record.id === input.sessionId);
          if (!target) return responseError(requestId, "SESSION_NOT_FOUND");
          // Continuation writes belong to desktop copies only — a history
          // file must never receive a live Runtime (source-session promise).
          if (target.writeMode !== "desktop-owned") {
            return responseError(requestId, "SESSION_SOURCE_READONLY");
          }
          // Host derives the path internally; the renderer only ever sent id.
          await this.agentService.command(routeSessionId, {
            type: "switch_session",
            sessionPath: target.sourcePath
          });
          this.runtimeBindings.set(target.id, routeSessionId);
          return { type: "response", requestId, ok: true, value: { sessionId: target.id, state: "ready" } };
        }
        case "workspace.status": {
          if (!this.workspace) return responseError(requestId, "WORKSPACE_UNAVAILABLE");
          const listing: unknown = await this.workspace.status();
          return { type: "response", requestId, ok: true, value: listing };
        }
        case "workspace.diff": {
          if (!this.workspace) return responseError(requestId, "WORKSPACE_UNAVAILABLE");
          const check = validateRelativePath(String(input.path ?? ""));
          if (!check.ok) return responseError(requestId, check.code);
        }
        case "workspace.apply": {
          if (!this.workspace) return responseError(requestId, "WORKSPACE_UNAVAILABLE");
          const input = validateRequest("workspace.apply", request, ["action", "path", "requestId", "type"]);
          if (input.type !== "request") return input;
          const pathCheck = validateRelativePath(input.path);
          if (!pathCheck.ok) return responseError(requestId, pathCheck.code);
          const result = await this.workspace.apply(pathCheck.value, input.action);
          return { type: "response", requestId, ok: true, value: result };

          const diff: unknown = await this.workspace.diff(check.value);
          return { type: "response", requestId, ok: true, value: diff };
        }
        case "approval.rules.list": {
          if (!this.approvalRules || typeof input.sessionId !== "string") {
            return responseError(requestId, "APPROVAL_RULES_UNAVAILABLE");
          }
          const rules = await this.approvalRules.list(this.runtimeId(input.sessionId));
          return { type: "response", requestId, ok: true, value: rules };
        }
        case "approval.rules.add": {
          if (!this.approvalRules || typeof input.sessionId !== "string") {
            return responseError(requestId, "APPROVAL_RULES_UNAVAILABLE");
          }
          if (
            !isValidApprovalTool(input.tool) ||
            (input.scope !== "session" && input.scope !== "project") ||
            (input.sourceInteractionId !== null &&
              (typeof input.sourceInteractionId !== "string" || input.sourceInteractionId.length > 128))
          ) {
            return responseError(requestId, "APPROVAL_RULE_INVALID_REQUEST");
          }
          const outcome = await this.approvalRules.grant(this.runtimeId(input.sessionId), {
            tool: input.tool,
            scope: input.scope,
            sourceInteractionId: input.sourceInteractionId
          });
          return { type: "response", requestId, ok: true, value: outcome };
        }
        case "approval.rules.remove": {
          if (!this.approvalRules || typeof input.id !== "string" || input.id.length === 0 || input.id.length > 160) {
            return responseError(requestId, "APPROVAL_RULE_INVALID_REQUEST");
          }
          const removed = await this.approvalRules.revoke(input.id);
          return { type: "response", requestId, ok: true, value: { removed } };
        }
        case "host_tool.call": {
          if (!this.clipboardApi || typeof input.sessionId !== "string" || typeof input.tool !== "string" || typeof input.action !== "string") {
            return responseError(requestId, "CLIPBOARD_UNAVAILABLE");
          }
          const api = this.clipboardApi;
          const safeSessionId = input.sessionId;
          const safeTool = input.tool;
          const safeAction = input.action;
          if (safeTool !== "clipboard") return responseError(requestId, "UNKNOWN_COMMAND");
          try {
            if (safeAction === "read") {
              const text = await api.readText();
              return { type: "response", requestId, ok: true, value: text };
            }
            if (safeAction === "write") {
              const text = typeof input.text === "string" ? input.text : "";
              await api.writeText(text);
              return { type: "response", requestId, ok: true };
            }
            if (safeAction === "read-image") {
              const image = await api.readImage();
              return { type: "response", requestId, ok: true, value: image ?? null };
            }
            if (safeAction === "write-image") {
              const image = input.image;
              if (!isRecord(image) || typeof image.data !== "string" || typeof image.mimeType !== "string") {
                return responseError(requestId, "INVALID_REQUEST");
              }
              await api.writeImage(image.data, image.mimeType);
              return { type: "response", requestId, ok: true };
            }
            return responseError(requestId, "UNKNOWN_COMMAND");
          } catch (error) {
            const code = knownError(error);
            return responseError(requestId, code ?? "CLIPBOARD_UNAVAILABLE");
          }
        }
        default:
          return responseError(requestId, "UNKNOWN_COMMAND");
      }
    } catch (error) {
      const code = knownError(error);
      return responseError(requestId, code ?? "INTERNAL_ERROR");
    }
  }
}

const ALLOWED_AGENT_COMMANDS = new Set([
  "abort",
  "abort_and_prompt",
  "abort_bash",
  "abort_retry",
  "bash",
  "branch",
  "compact",
  "cycle_model",
  "cycle_thinking_level",
  "export_html",
  "extension_ui_response",
  "follow_up",
  "get_available_commands",
  "get_available_models",
  "get_branch_messages",
  "get_last_assistant_text",
  "get_login_providers",
  "get_messages",
  "get_session_stats",
  "get_state",
  "get_subagent_messages",
  "get_subagents",
  "handoff",
  "login",
  "new_session",
  "prompt",
  "set_auto_compaction",
  "set_auto_retry",
  "set_fast_mode",
  "set_follow_up_mode",
  "set_interrupt_mode",
  "set_model",
  "set_session_name",
  "set_steering_mode",
  "set_subagent_subscription",
  "set_thinking_level",
  "set_todos",
  "steer"
]);
// Deliberately NOT allowlisted: switch_session (Host derives paths — the
// renderer never submits one), host_tool_* / host_uri_* (Host-owned bridge
// surfaces), negotiate_protocol / rpc_chunk (protocol internals), and the
// event-frame types that are not commands at all.

function allowedAgentCommand(command: Record<string, unknown>): boolean {
  return typeof command.type === "string" && ALLOWED_AGENT_COMMANDS.has(command.type);
}
