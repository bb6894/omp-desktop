import {
  MAX_TOOL_OUTPUT_CHARS,
  type CommandsUpdateEvent,
  type ConfigUpdateEvent,
  type InteractionCancelledEvent,
  type InteractionRequestedEvent,
  type MessageAddedEvent,
  type MessageDeltaEvent,
  type MessageFinalizedEvent,
  type PlanPhaseView,
  type PlanTaskView,
  type RunStateEvent,
  type RunStateValue,
  type SessionInfoEvent,
  type SlashCommandInfo,
  type SystemNoteEvent,
  type TimelineEvent,
  type ToolFinishedEvent,
  type ToolOutputEvent,
  type ToolStartedEvent
} from "../../../protocol/domain";

/**
 * Pure OMP-frame → timeline-event translation. The ONLY module allowed to know
 * raw Runtime event names on the outbound path; everything downstream (journal,
 * Rust forwarding, renderer reducer) speaks the protocol/domain vocabulary.
 *
 * Frames that carry no timeline meaning (ready, response/ok, correlation
 * noise) translate to zero events. Unknown agent event types also translate to
 * zero events — inventing behavior for unknown frames is forbidden (red-team
 * attack 7); the caller counts them as ignored diagnostics.
 */

export type TranslateResult = {
  events: Omit<TimelineEvent, "v" | "seq" | "sessionId">[];
  /** Agent-facing frames that produced no timeline event. */
  ignored: number;
};

/** File-canonical structural guard for untyped Runtime payload objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalizes OMP message content: plain string or block array with text parts. */
function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }
  return text;
}

const INTERACTIVE_UI_METHODS: Record<"confirm" | "select" | "input" | "editor", true> = {
  confirm: true,
  select: true,
  input: true,
  editor: true
};

function translateExtensionUiRequest(frame: RpcFrame): TranslateResult {
  const id = typeof frame.id === "string" ? frame.id : null;
  const method = typeof frame.method === "string" ? frame.method : null;
  if (!method) return { events: [], ignored: 1 };

  // Runtime-cancelled dialogs resolve the matching ask card in the timeline.
  if (method === "cancel") {
    if (!id || typeof frame.targetId !== "string") return { events: [], ignored: 1 };
    const cancelled: Omit<InteractionCancelledEvent, "v" | "seq" | "sessionId"> = {
      kind: "interaction.cancelled",
      interactionId: id,
      cancelsId: frame.targetId
    };
    return { events: [cancelled], ignored: 0 };
  }

  // Fire-and-forget notifications become system notes; no response is expected.
  if (method === "notify") {
    if (typeof frame.message !== "string") return { events: [], ignored: 1 };
    const raw = frame.notifyType;
    const level = raw === "warning" || raw === "error" ? raw : "info";
    const note: Omit<SystemNoteEvent, "v" | "seq" | "sessionId"> = {
      kind: "system.note",
      level,
      text: frame.message
    };
    return { events: [note], ignored: 0 };
  }

  if (!(method in INTERACTIVE_UI_METHODS) || !id) return { events: [], ignored: 1 };
  const options = Array.isArray(frame.options)
    ? frame.options.filter((option): option is string => typeof option === "string")
    : null;
  const requested: Omit<InteractionRequestedEvent, "v" | "seq" | "sessionId"> = {
    kind: "interaction.requested",
    interactionId: id,
    method,
    title: typeof frame.title === "string" && frame.title.length > 0 ? frame.title : "需要确认",
    message: typeof frame.message === "string" ? frame.message : null,
    placeholder: typeof frame.placeholder === "string" ? frame.placeholder : null,
    options,
    approvalTool: extractApprovalToolFromFrame(frame, options)
  };
  return { events: [requested], ignored: 0 };
}

/**
 * Mirrors the pinned Runtime's `formatApprovalPrompt` shape: a tool-approval
 * prompt is an Approve/Deny select titled `Allow tool: <name>`. Everything
 * else carries no approval-tool identity.
 */
function extractApprovalToolFromFrame(
  frame: RpcFrame,
  options: readonly string[] | null
): string | null {
  if (frame.method !== "select") return null;
  if (options?.length !== 2 || options[0] !== "Approve" || options[1] !== "Deny") return null;
  const title = typeof frame.title === "string" ? frame.title : "";
  const match = /^Allow tool: ([A-Za-z0-9][A-Za-z0-9_.:-]{0,63})/m.exec(title);
  return match ? match[1] : null;
}

/** Bounded eval-source view from the Runtime's raw tool args; null otherwise. */
function extractEvalCode(frame: RpcFrame): { code: string | null; language: string | null } {
  if (frame.toolName !== "eval") return { code: null, language: null };
  const args = isRecord(frame.args) ? frame.args : {};
  const code = typeof args.code === "string" ? args.code.slice(0, MAX_TOOL_OUTPUT_CHARS) : null;
  const language = typeof args.language === "string" ? args.language : null;
  return { code, language };
}

const PLAN_PHASE_CAP = 32;
const PLAN_TASK_CAP = 100;
const PLAN_TEXT_CAP = 500;

function planTaskView(input: unknown): PlanTaskView | null {
  if (!isRecord(input)) return null;
  if (typeof input.content !== "string" || input.content.length === 0) return null;
  if (typeof input.status !== "string" || input.status.length === 0) return null;
  return {
    content: input.content.slice(0, PLAN_TEXT_CAP),
    status: input.status
  };
}

/**
 * Host-validated todo phases from the Runtime result details (`TodoToolDetails`).
 * Anything malformed drops; caps keep a hostile result from flooding the UI.
 */

const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/** Bounded parse of one Runtime registry entry; malformed shapes drop. */
function parseSlashCommandInfo(input: unknown): SlashCommandInfo | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.name !== "string" || !COMMAND_NAME_PATTERN.test(record.name)) return null;
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter((alias): alias is string => typeof alias === "string")
    : null;
  const hint = isRecord(record.input) ? record.input : {};
  return {
    name: record.name,
    aliases: aliases && aliases.length > 0 ? aliases : null,
    description:
      typeof record.description === "string" && record.description.length > 0
        ? record.description.slice(0, 300)
        : null,
    inputHint: typeof hint.hint === "string" && hint.hint.length > 0 ? hint.hint.slice(0, 120) : null,
    source: typeof record.source === "string" && record.source.length > 0 ? record.source.slice(0, 60) : "runtime"
  };
}

function extractPlanView(frame: RpcFrame): readonly PlanPhaseView[] | null {
  if (frame.toolName !== "todo") return null;
  const result = isRecord(frame.result) ? frame.result : {};
  const details = isRecord(result.details) ? result.details : {};
  if (!Array.isArray(details.phases)) return null;
  const phases: PlanPhaseView[] = [];
  for (const phase of details.phases.slice(0, PLAN_PHASE_CAP)) {
    if (!isRecord(phase) || typeof phase.name !== "string" || !Array.isArray(phase.tasks)) continue;
    const tasks: PlanTaskView[] = [];
    for (const task of phase.tasks.slice(0, PLAN_TASK_CAP)) {
      const view = planTaskView(task);
      if (view) tasks.push(view);
    }
    phases.push({ name: phase.name.slice(0, PLAN_TEXT_CAP), tasks });
  }
  return phases.length > 0 ? phases : null;
}


export function translateFrame(frame: RpcFrame): TranslateResult {
  const events: TranslateResult["events"] = [];
  const frameType = typeof frame.type === "string" ? frame.type : "";

  switch (frameType) {
    case "turn_start":
    case "agent_start":
    case "turn_end":
    case "agent_end":
      // Turn bookkeeping rides run.state events emitted by the state machine.
      return { events, ignored: 1 };

    case "message_start": {
      const message = isRecord(frame.message) ? frame.message : {};
      const role = message.role;
      if (role !== "user" && role !== "assistant") return { events, ignored: 1 };
      const messageId =
        typeof message.id === "string" && message.id.length > 0 ? message.id : null;
      events.push({
        kind: "message.added",
        messageId,
        role,
        text: textOfContent(message.content)
      } satisfies Omit<MessageAddedEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "message_update": {
      const update = isRecord(frame.assistantMessageEvent) ? frame.assistantMessageEvent : {};
      if (update.type !== "text_delta" || typeof update.delta !== "string") {
        return { events, ignored: 1 };
      }
      events.push({
        kind: "message.delta",
        delta: update.delta
      } satisfies Omit<MessageDeltaEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "message_end": {
      const message = isRecord(frame.message) ? frame.message : {};
      if (message.role !== "assistant") return { events, ignored: 1 };
      const messageId =
        typeof message.id === "string" && message.id.length > 0 ? message.id : null;
      events.push({
        kind: "message.finalized",
        messageId,
        text: textOfContent(message.content)
      } satisfies Omit<MessageFinalizedEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "tool_execution_start": {
      if (typeof frame.toolCallId !== "string") return { events, ignored: 1 };
      const evalCode = extractEvalCode(frame);
      events.push({
        kind: "tool.started",
        toolCallId: frame.toolCallId,
        toolName: typeof frame.toolName === "string" ? frame.toolName : "unknown",
        code: evalCode.code,
        language: evalCode.language
      } satisfies Omit<ToolStartedEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "tool_execution_update": {
      if (typeof frame.toolCallId !== "string") return { events, ignored: 1 };
      const chunk = typeof frame.output === "string" ? frame.output : "";
      events.push({
        kind: "tool.output",
        toolCallId: frame.toolCallId,
        chunk: chunk.length > MAX_TOOL_OUTPUT_CHARS ? chunk.slice(0, MAX_TOOL_OUTPUT_CHARS) : chunk
      } satisfies Omit<ToolOutputEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "tool_execution_end": {
      if (typeof frame.toolCallId !== "string") return { events, ignored: 1 };
      events.push({
        kind: "tool.finished",
        toolCallId: frame.toolCallId,
        isError: frame.isError === true,
        plan: extractPlanView(frame)
      } satisfies Omit<ToolFinishedEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "available_commands_update": {
      const raw = Array.isArray(frame.commands) ? frame.commands : [];
      const commands = raw
        .map(parseSlashCommandInfo)
        .filter((info): info is SlashCommandInfo => info !== null)
        .slice(0, 200);
      events.push({
        kind: "commands.update",
        commands
      } satisfies Omit<CommandsUpdateEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "config_update": {
      const rawModel = isRecord(frame.model) ? frame.model : {};
      const model = typeof frame.model === "string" ? frame.model : typeof rawModel.id === "string" ? rawModel.id : null;
      const thinkingLevel = typeof frame.thinkingLevel === "string" ? frame.thinkingLevel : null;
      if (model === null && thinkingLevel === null) return { events, ignored: 1 };
      events.push({
        kind: "config.update",
        model,
        thinkingLevel
      } satisfies Omit<ConfigUpdateEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "session_info_update": {
      const name = typeof frame.title === "string" && frame.title.length > 0 ? frame.title : null;
      if (name === null) return { events, ignored: 1 };
      events.push({
        kind: "session.info",
        name
      } satisfies Omit<SessionInfoEvent, "v" | "seq" | "sessionId">);
      return { events, ignored: 0 };
    }

    case "command_output": {
      // Slash-command results stream here (terminal parity: printed inline).
      const text = typeof frame.text === "string" ? frame.text : "";
      if (text.length === 0) return { events, ignored: 1 };
      events.push(systemNoteEvent(text.slice(0, MAX_TOOL_OUTPUT_CHARS)));
      return { events, ignored: 0 };
    }

    case "extension_ui_request":
      return translateExtensionUiRequest(frame);

    default:
      // ready / response / ok / side-channel UI methods / unknown future types
      // never reach the timeline.
      return { events, ignored: 1 };
  }
}

export function runStateEvent(state: RunStateValue): Omit<RunStateEvent, "v" | "seq" | "sessionId"> {
  return { kind: "run.state", state };
}

export function systemNoteEvent(text: string): Omit<SystemNoteEvent, "v" | "seq" | "sessionId"> {
  return { kind: "system.note", level: "info", text };
}
