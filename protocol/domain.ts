/**
 * OMP Desktop timeline protocol — the single source of truth for the
 * Renderer↔Host live-event contract.
 *
 * Owned by the Desktop Host: the Host translates raw OMP Runtime frames into
 * these domain events, assigns the per-session monotonic `seq`, journals them
 * for replay, and emits each one as a `HostEvent` with `name: "timeline"`.
 * The renderer consumes ONLY this vocabulary — it never learns raw OMP event
 * names (red-team boundary §4.2).
 *
 * Import rules: this file must stay dependency-free (pure types + constants)
 * so both the Bun-compiled Host and the Vite renderer can import it directly.
 */

export const TIMELINE_PROTOCOL_VERSION = 1;

/** HostEvent.name used for every journaled timeline event. */
export const TIMELINE_EVENT_NAME = "timeline";

/** Ring-buffer capacity per session (bounded replay window). */
export const TIMELINE_JOURNAL_CAPACITY = 256;

/** Tool-output chunks above this size are trimmed by the Host before journaling. */
export const MAX_TOOL_OUTPUT_CHARS = 8_000;

/** Mirrors the Host AgentState machine; emitted on every transition. */
export type RunStateValue =
  | "idle"
  | "starting"
  | "streaming"
  | "awaiting-tool"
  | "awaiting-interaction"
  | "stopping"
  | "completed"
  | "interrupted"
  | "failed";

export type TimelineRole = "user" | "assistant";

type TimelineEnvelope<K extends string> = {
  /** Protocol version; a renderer that sees an unknown value must resync. */
  v: typeof TIMELINE_PROTOCOL_VERSION;
  kind: K;
  /** Per-session monotonic sequence assigned by the Host journal. */
  seq: number;
  /** Canonical OMP session id (may be empty pre-discovery on create flows). */
  sessionId: string;
};

export type RunStateEvent = TimelineEnvelope<"run.state"> & { state: RunStateValue };

export type MessageAddedEvent = TimelineEnvelope<"message.added"> & {
  messageId: string | null;
  role: TimelineRole;
  text: string;
};

export type MessageDeltaEvent = TimelineEnvelope<"message.delta"> & { delta: string };

export type MessageFinalizedEvent = TimelineEnvelope<"message.finalized"> & {
  messageId: string | null;
  text: string;
};

export type ToolStartedEvent = TimelineEnvelope<"tool.started"> & {
  toolCallId: string;
  toolName: string;
  /** Eval-tool source extracted from args by the Host; null for other tools. */
  code?: string | null;
  /** Eval-tool language ('py'|'js'|'rb'|'jl'); null for other tools. */
  language?: string | null;
};

export type ToolOutputEvent = TimelineEnvelope<"tool.output"> & {
  toolCallId: string;
  chunk: string;
};

export type PlanTaskView = { content: string; status: string };

/** Host-validated snapshot of the todo tool's phases for plan cards. */
export type PlanPhaseView = { name: string; tasks: readonly PlanTaskView[] };

export type ToolFinishedEvent = TimelineEnvelope<"tool.finished"> & {
  toolCallId: string;
  isError: boolean;
  /** Structured todo phases extracted from the Runtime result details. */
  plan?: readonly PlanPhaseView[] | null;
};

/** One entry of the Runtime's dynamic slash-command registry. */
export type SlashCommandInfo = {
  name: string;
  aliases: readonly string[] | null;
  description: string | null;
  inputHint: string | null;
  source: string;
};

/** Runtime `available_commands_update`: the live command registry (MCP/extensions included). */
export type CommandsUpdateEvent = TimelineEnvelope<"commands.update"> & {
  commands: readonly SlashCommandInfo[];
};

/** Runtime `config_update`: model/thinking changed outside the composer. */
export type ConfigUpdateEvent = TimelineEnvelope<"config.update"> & {
  model: string | null;
  thinkingLevel: string | null;
};

/** Runtime `session_info_update`: session name changed (e.g. via /name). */
export type SessionInfoEvent = TimelineEnvelope<"session.info"> & {
  name: string | null;
};

export type InteractionRequestedEvent = TimelineEnvelope<"interaction.requested"> & {
  interactionId: string;
  method: string | null;
  title: string;
  /** confirm body text (Runtime passes the action description here). */
  message: string | null;
  /** input hint text. */
  placeholder: string | null;
  options: readonly string[] | null;
  /**
   * Tool name when this request is the Runtime's tool-approval prompt
   * (`Allow tool: <name>` select); null for every other dialog. The desktop
   * approval-rule engine keys grants on this value only.
   */
  approvalTool: string | null;
};

/** Emitted when the Runtime cancels its own dialog (`method: "cancel"`). */
export type InteractionCancelledEvent = TimelineEnvelope<"interaction.cancelled"> & {
  cancelsId: string;
};

/** Fire-and-forget Runtime notification (`method: "notify"`). */
export type SystemNoteEvent = TimelineEnvelope<"system.note"> & {
  level: "info" | "warning" | "error";
  text: string;
};

export type TimelineEvent =
  | RunStateEvent
  | MessageAddedEvent
  | MessageDeltaEvent
  | MessageFinalizedEvent
  | ToolStartedEvent
  | ToolOutputEvent
  | ToolFinishedEvent
  | InteractionRequestedEvent
  | InteractionCancelledEvent
  | SystemNoteEvent
  | CommandsUpdateEvent
  | ConfigUpdateEvent
  | SessionInfoEvent
  | RuntimeUpdateEvent
  | SubAgentsUpdateEvent;

export type TimelineEventKind = TimelineEvent["kind"];

/**
 * Payload the client merges INTO the `extension_ui_response` frame. The
 * Runtime resolves pending dialogs by reading top-level fields of the whole
 * frame (`confirmed` / `value` / `cancelled`) — never nested values.
 */
export type InteractionResponse =
  | { confirmed: boolean }
  | { value: string }
  | { cancelled: true };

/** Response payload for the `events.replay` top-level operation. */
export type TimelineReplay = {
  events: readonly TimelineEvent[];
  /** Highest sequence currently journaled for the session. */
  headSeq: number;
  /**
   * True when `afterSeq` predates the journal window (or the session has no
   * journal yet): the caller must re-hydrate from persisted messages instead
   * of trusting the replay alone.
   */
  dropped: boolean;
};

const TERMINAL_RUN_STATES: Record<"idle" | "completed" | "interrupted" | "failed", true> = {
  idle: true,
  completed: true,
  interrupted: true,
  failed: true
};

/** True while the composer/timeline should treat the turn as live. */
export function isLiveRunState(state: RunStateValue): boolean {
  return !(state in TERMINAL_RUN_STATES);
}

/** Runtime version info exposed to the renderer for update checks. */
export type RuntimeVersionInfo = {
  /** Current pinned version. */
  version: string;
  /** SHA-256 of the current binary. */
  sha256: string;
  /** Remote available version (null = unavailable). */
  latestVersion: string | null;
  /** Remote SHA-256 (null = unavailable). */
  latestSha256: string | null;
  /** True when a newer version is available. */
  updateAvailable: boolean;
};

/** Emitted when a runtime update check completes. */
export type RuntimeUpdateEvent = TimelineEnvelope<"runtime.update"> & {
  info: RuntimeVersionInfo;
  status: "checking" | "available" | "current" | "error";
};
export type SubAgentInfo = {
  id: string;
  name: string;
  status: "running" | "idle" | "completed" | "failed";
  prompt?: string;
};

export type SubAgentsUpdateEvent = TimelineEnvelope<"subagents.update"> & {
  agents: readonly SubAgentInfo[];
};
