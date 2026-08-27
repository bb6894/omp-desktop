import type {
  BridgeHandlers,
  MessagesPage,
  ProductBridge,
  SessionListing,
  WorkbenchState,
  SessionMetadataIndex,
  SessionMetadataRecord,
  WorkspaceDiff,
  WorkspaceStatus,
  ApprovalGrantOutcome,
  ApprovalRuleLists
} from "./product-bridge";
import type {
  InteractionResponse,
  TimelineEvent,
  TimelineReplay
} from "../../../protocol/domain";
import { isObject } from "../lib/guards";

/**
 * Real transport over the Tauri IPC surface.
 *
 * IPC paths mirror the Rust surface exactly:
 *  1. Dedicated thin commands (session_views, fork_session, workspace ops, …)
 *     routed by tab id, resolve with the INNER Host value directly; failures
 *     reject with the stable code STRING (never an envelope).
 *  2. `send_command` is FIRE-AND-FORGET nested `agent.command`. Data-bearing
 *     Runtime responses arrive later on the `agent://line/<id>` stream, so
 *     query commands embed a client id, register a pending correlation keyed
 *     by it, and resolve from that stream (legacy `_sendWithResponse` model).
 *
 * Identity rules: renderer submits only Host session ids — never file paths.
 */

export type InvokeSeam = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export type ListenSeam = (
  event: string,
  handler: (event: { payload: unknown }) => void
) => Promise<() => void>;

export type TauriSeams = {
  invoke: InvokeSeam;
  listen: ListenSeam;
};

type PendingFrame = {
  resolve: (frame: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const NESTED_TIMEOUT_MS = 30_000;

function defaultSeams(): TauriSeams {
  const tauri = typeof window !== "undefined" ? window.__TAURI__ : undefined;
  if (!tauri) throw new Error("PRODUCT_TAURI_UNAVAILABLE");
  return {
    invoke: (command, args) => tauri.core.invoke(command, args),
    listen: (event, handler) =>
      tauri.event.listen(event, (event) => handler({ payload: event.payload }))
  };
}

/** Streamed frames carry payload on `.data`; tolerate absence. */
function frameData(frame: Record<string, unknown>): Record<string, unknown> {
  return isObject(frame.data) ? frame.data : {};
}

export function createTauriProductBridge(seams?: Partial<TauriSeams>): ProductBridge {
  const resolved: TauriSeams = {
    invoke: seams?.invoke ?? defaultSeams().invoke,
    listen: seams?.listen ?? defaultSeams().listen
  };

  let activeSessionId: string | null = null;
  let sequence = 0;
  const pendingFrames = new Map<string, PendingFrame>();

  /** Feeds every streamed line: resolves correlated pending frames first. */
  function ingestStreamLine(raw: unknown): void {
    if (!isObject(raw) || raw.type !== "response" || typeof raw.id !== "string") return;
    const pending = pendingFrames.get(raw.id);
    if (!pending) return;
    pendingFrames.delete(raw.id);
    clearTimeout(pending.timer);
    pending.resolve(raw);
  }

  const route = (): string => {
    if (!activeSessionId) throw new Error("PRODUCT_NO_ACTIVE_SESSION");
    return activeSessionId;
  };

  async function thin<T>(command: string, extraArgs: Record<string, unknown> = {}): Promise<T> {
    try {
      // Success resolves with the INNER VALUE directly; failures reject with
      // the stable code string from the Host boundary.
      const raw: unknown = await resolved.invoke(command, {
        sessionId: route(),
        ...extraArgs
      });
      if (typeof raw === "string") throw new Error(raw);
      return raw as T;
    } catch (error) {
      if (typeof error === "string") throw new Error(error);
      throw error;
    }
  }

  async function sendNested(targetId: string, command: Record<string, unknown>): Promise<void> {
    await resolved.invoke("send_command", {
      sessionId: targetId,
      json: JSON.stringify({
        requestId: `ui-${++sequence}`,
        type: "agent.command",
        sessionId: targetId,
        command
      })
    });
  }

  async function queryNested(
    targetId: string,
    command: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const correlationId = `ui-${++sequence}`;
    const framePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingFrames.delete(correlationId);
        reject(new Error("PRODUCT_NESTED_TIMEOUT"));
      }, NESTED_TIMEOUT_MS);
      pendingFrames.set(correlationId, { resolve, reject, timer });
    });
    await resolved.invoke("send_command", {
      sessionId: targetId,
      json: JSON.stringify({
        requestId: `host-${correlationId}`,
        type: "agent.command",
        sessionId: targetId,
        command: { ...command, id: correlationId }
      })
    });
    const frame = await framePromise;
    if (frame.success !== true) {
      throw new Error(typeof frame.error === "string" ? frame.error : "PRODUCT_BRIDGE_PROTOCOL");
    }
    return frameData(frame);
  }

  return {
    setActiveSession(sessionId: string | null): void {
      activeSessionId = sessionId;
    },

    async listSessions(): Promise<SessionListing> {
      return thin<SessionListing>("session_views");
    },

    async getSessionMetadata(): Promise<SessionMetadataIndex> {
      // Metadata rides the listing response; one round trip either way.
      const listing = await thin<SessionListing & { metadata: SessionMetadataIndex }>(
        "session_views"
      );
      return listing.metadata;
    },

    async setSessionMetadata(
      sessionId: string,
      patch: Partial<SessionMetadataRecord>
    ): Promise<SessionMetadataRecord> {
      const result = await thin<{ record: SessionMetadataRecord }>("session_metadata_set", {
        targetSessionId: sessionId,
        patch
      });
      return result.record;
    },

    async listMessages(
      sessionId: string,
      cursor: string | null,
      limit: number
    ): Promise<MessagesPage> {
      return thin<MessagesPage>("load_session_messages", {
        targetSessionId: sessionId,
        cursor,
        limit
      });
    },

    async subscribeEvents(sessionId: string, handlers: BridgeHandlers): Promise<() => void> {
      // Legacy discipline: arm event+exit together; teardown removes BOTH
      // before another session may arm its own listeners.
      const offLine = await resolved.listen(`agent://line/${sessionId}`, (event) => {
        ingestStreamLine(event.payload);
        if (isObject(event.payload) && typeof event.payload.seq === "number") {
          handlers.onEvent(event.payload as TimelineEvent);
        }
      });
      const offExit = await resolved.listen(`agent://exit/${sessionId}`, (event) => {
        const reason = event.payload;
        handlers.onExit(typeof reason === "string" ? reason : "");
      });
      let tornDown = false;
      return () => {
        if (tornDown) return;
        tornDown = true;
        void offLine();
        void offExit();
      };
    },

    async replayTimeline(_sessionId: string, afterSeq: number): Promise<TimelineReplay> {
      const replay = await thin<TimelineReplay>("events_replay", { afterSeq });
      return {
        events: Array.isArray(replay.events) ? replay.events : [],
        headSeq: typeof replay.headSeq === "number" ? replay.headSeq : 0,
        dropped: replay.dropped === true
      };
    },

    async sessionStatus(sessionId: string): Promise<string | null> {
      const status = await resolved.invoke("session_status", { sessionId });
      return typeof status === "string" ? status : null;
    },

    async openProjectPicker(): Promise<string | null> {
      const picked = await resolved.invoke("open_project");
      return typeof picked === "string" ? picked : null;
    },

    async createSession(cwd: string): Promise<string> {
      const routeId = `session-${Date.now()}`;
      await resolved.invoke("start_session", { sessionId: routeId, cwd });
      return routeId;
    },

    async forkSession(sessionId: string): Promise<string> {
      const child: unknown = await thin<unknown>("fork_session", {
        targetSessionId: sessionId
      });
      if (!isObject(child) || typeof child.id !== "string") {
        throw new Error("PRODUCT_BRIDGE_PROTOCOL");
      }
      return child.id;
    },

    async fetchWorkbenchState(sessionId: string): Promise<WorkbenchState> {
      const state = await queryNested(sessionId, { type: "get_state" });
      const model = isObject(state.model) && typeof state.model.id === "string" ? state.model.id : null;
      // Model catalog rides its own correlated command; degrade to empty on failure.
      let rawModels: unknown[] = [];
      try {
        const catalog = await queryNested(sessionId, { type: "get_available_models" });
        rawModels = Array.isArray(catalog.models) ? catalog.models : [];
      } catch {
        rawModels = []; // advisory list — never block the composer on it
      }
      const models = rawModels
        .filter((item): item is Record<string, unknown> => isObject(item))
        .flatMap((item) =>
          typeof item.id === "string" && typeof item.provider === "string"
            ? [{ id: item.id, provider: item.provider }]
            : []
        );
      return {
        model,
        thinkingLevel: typeof state.thinkingLevel === "string" ? state.thinkingLevel : null,
        models,
        queuedCount: typeof state.queuedMessageCount === "number" ? state.queuedMessageCount : null,
        fastMode: typeof state.fastModeEnabled === "boolean" ? state.fastModeEnabled : null,
        autoCompaction:
          typeof state.autoCompactionEnabled === "boolean" ? state.autoCompactionEnabled : null,
        steeringMode: typeof state.steeringMode === "string" ? state.steeringMode : null,
        followUpMode: typeof state.followUpMode === "string" ? state.followUpMode : null,
        interruptMode: typeof state.interruptMode === "string" ? state.interruptMode : null,
        tokensPerSecond: typeof state.tokensPerSecond === "number" ? state.tokensPerSecond : null,
        contextPercent:
          typeof state.contextUsage === "object" &&
          state.contextUsage !== null &&
          typeof (state.contextUsage as Record<string, unknown>).percent === "number"
            ? (state.contextUsage as Record<string, unknown>).percent as number
            : null
      };
    },
    async setModel(sessionId: string, provider: string, modelId: string): Promise<void> {
      // Runtime contract: {provider, modelId} — a bare `model` field no-ops.
      await sendNested(sessionId, { type: "set_model", provider, modelId });
    },

    async sendPrompt(targetId: string, text: string, behavior?: "steer" | "followUp", images?: {type:string; data:string; mimeType:string}[]): Promise<void> {
      await sendNested(targetId, {
        type: "prompt",
        message: text,
        ...(behavior ? { streamingBehavior: behavior } : {}),
        ...(images && images.length > 0 ? { images } : {})
      });
    },

    async steerSession(targetId: string, text: string): Promise<void> {
      await sendNested(targetId, { type: "steer", message: text });
    },

    async runAgentCommand(
      targetId: string,
      command: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      return queryNested(targetId, command);
    },

    async cycleThinkingLevel(sessionId: string): Promise<void> {
      await sendNested(sessionId, { type: "cycle_thinking_level" });
    },

    async openRuntimeSession(targetId: string): Promise<void> {
      await thin<void>("session_open_runtime", { targetSessionId: targetId });
    },

    async respondInteraction(
      targetId: string,
      interactionId: string,
      response: InteractionResponse
    ): Promise<void> {
      // Runtime reads TOP-LEVEL confirmed/value/cancelled on the frame.
      await sendNested(targetId, {
        type: "extension_ui_response",
        id: interactionId,
        ...response
      });
    },
    async abortSession(targetId: string): Promise<void> {
      await sendNested(targetId, { type: "abort" });
    },

    async getWorkspaceChanges(): Promise<WorkspaceStatus> {
      return thin<WorkspaceStatus>("workspace_changes");
    },

    async getWorkspaceDiff(path: string): Promise<WorkspaceDiff> {
      return thin<WorkspaceDiff>("workspace_diff", { path });
    },


    async applyWorkspaceChange(_path: string, _action: "accept" | "reject"): Promise<boolean> {
      // TODO: Implement workspace apply/discard via Host command
      return false;
    },
    async listApprovalRules(): Promise<ApprovalRuleLists> {
      const rules = await thin<Partial<ApprovalRuleLists>>("approval_rules_list", {});
      return {
        session: Array.isArray(rules.session) ? rules.session : [],
        project: Array.isArray(rules.project) ? rules.project : []
      };
    },

    async addApprovalRule(
      tool: string,
      scope: "session" | "project",
      sourceInteractionId: string | null
    ): Promise<ApprovalGrantOutcome> {
      return thin<ApprovalGrantOutcome>("approval_rules_add", {
        targetSessionId: route(),
        tool,
        scope,
        sourceInteractionId
      });
    },

    async renameSession(targetId: string, name: string): Promise<void> {
      await sendNested(targetId, { type: "set_session_name", name });
    },
    async removeApprovalRule(ruleId: string): Promise<void> {
      await thin<void>("approval_rules_remove", { targetSessionId: route(), id: ruleId });
    }
  };
}

/**
 * Startup transport selection: real Tauri bridge when the globals exist
 * (optionally with injected seams for tests), otherwise null so the shipping
 * app can fail clearly outside a Tauri window.
 */
export function resolveDefaultBridge(seams?: Partial<TauriSeams>): ProductBridge | null {
  if (seams) return createTauriProductBridge(seams);
  if (typeof window !== "undefined" && window.__TAURI__) return createTauriProductBridge();
  return null;
}
