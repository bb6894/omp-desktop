import {
  isLiveRunState,
  type PlanPhaseView,
  type RunStateValue
} from "../../../protocol/domain";

/**
 * Pure timeline reconciliation over protocol/domain events. The renderer never
 * sees raw OMP frame names — translation happened Host-side (timeline-events.ts).
 * Sequence integrity: `seq` gaps mark the model `desynced`; recovery is the
 * caller's job (re-hydrate from persisted messages), never silent guessing.
 */

export type ToolStatus = "running" | "ok" | "error";

export type TimelineEntry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      status: ToolStatus;
      output: string;
      truncated: boolean;
      /** Eval-tool source; drives the code-block card body. */
      code?: string | null;
      language?: string | null;
      /** Structured todo phases; drives the plan card. */
      plan?: readonly PlanPhaseView[] | null;
    }
  | {
      kind: "ask";
      id: string;
      title: string;
      method?: string;
      message?: string | null;
      placeholder?: string | null;
      options?: readonly string[];
      /** Tool name for Runtime approval prompts; drives the rule-grant buttons. */
      approvalTool?: string | null;
      answered: boolean;
    }
  | { kind: "note"; id: string; level: "info" | "warning" | "error"; text: string }
  | { kind: "compact"; id: string; state: "pending" | "done" | "error" };

export type TimelineModel = {
  entries: TimelineEntry[];
  runState: RunStateValue;
  turnActive: boolean;
  /** Highest applied timeline-event sequence (0 = none). */
  lastSeq: number;
  /** A sequence gap was detected; re-hydrate then continue. */
  desynced: boolean;
  unrecognized: number;
};

const MAX_TOOL_OUTPUT = 8_000;

export function emptyTimeline(): TimelineModel {
  return {
    entries: [],
    runState: "idle",
    turnActive: false,
    lastSeq: 0,
    desynced: false,
    unrecognized: 0
  };
}

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

/** Persisted messages carry either a plain `text` or block-array `content`. */
function textOfPersisted(message: Record<string, unknown>): string {
  if (typeof message.text === "string") return message.text;
  return textOfContent(message.content);
}

function replaceOrAppend(entries: readonly TimelineEntry[], next: TimelineEntry): TimelineEntry[] {
  const index = entries.findIndex((entry) => entry.id === next.id && entry.kind === next.kind);
  if (index === -1) return [...entries, next];
  return [...entries.slice(0, index), next, ...entries.slice(index + 1)];
}

function appendToStreamingAssistant(model: TimelineModel, delta: string): TimelineModel {
  const last = model.entries[model.entries.length - 1];
  if (last === undefined || last.kind !== "assistant" || !last.streaming) return model;
  const appended: TimelineEntry = { ...last, text: last.text + delta };
  return { ...model, entries: [...model.entries.slice(0, -1), appended] };
}

function finalizeStreaming(model: TimelineModel): TimelineModel {
  const last = model.entries[model.entries.length - 1];
  if (last === undefined || last.kind !== "assistant" || !last.streaming) return model;
  const finalized: TimelineEntry = { ...last, streaming: false };
  return { ...model, entries: [...model.entries.slice(0, -1), finalized] };
}

function boundedOutput(current: string, chunk: string): { output: string; truncated: boolean } {
  const appended = current + chunk;
  return appended.length <= MAX_TOOL_OUTPUT
    ? { output: appended, truncated: false }
    : { output: appended.slice(0, MAX_TOOL_OUTPUT), truncated: true };
}

function entryIdOf(event: Record<string, unknown>, seq: number): string {
  return typeof event.messageId === "string" && event.messageId.length > 0
    ? event.messageId
    : `e${seq}`;
}

/** Applies one domain event; unknown kinds count as unrecognized, never crash. */
export function reduceTimeline(model: TimelineModel, event: unknown): TimelineModel {
  if (!isRecord(event) || typeof event.kind !== "string" || typeof event.seq !== "number") {
    return { ...model, unrecognized: model.unrecognized + 1 };
  }
  // Replay/live duplicates and late stragglers are idempotent no-ops.
  if (event.seq <= model.lastSeq) return model;
  const gap = model.lastSeq > 0 && event.seq > model.lastSeq + 1;
  const based: TimelineModel = gap ? { ...model, desynced: true } : model;

  switch (event.kind) {
    case "run.state": {
      const state = event.state;
      if (typeof state !== "string") return { ...based, unrecognized: based.unrecognized + 1 };
      const runState = state as RunStateValue;
      return finalizeStreaming({
        ...based,
        lastSeq: event.seq,
        runState,
        turnActive: isLiveRunState(runState)
      });
    }

    case "message.added": {
      const role = event.role;
      if (role !== "user" && role !== "assistant") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const text = typeof event.text === "string" ? event.text : "";
      const entry: TimelineEntry =
        role === "user"
          ? { kind: "user", id: entryIdOf(event, event.seq), text }
          : { kind: "assistant", id: entryIdOf(event, event.seq), text, streaming: true };
      return { ...based, lastSeq: event.seq, entries: replaceOrAppend(based.entries, entry) };
    }

    case "message.delta": {
      const delta = typeof event.delta === "string" ? event.delta : "";
      return { ...appendToStreamingAssistant(based, delta), lastSeq: event.seq };
    }

    case "message.finalized": {
      const text = typeof event.text === "string" ? event.text : "";
      const finalized: TimelineEntry = {
        kind: "assistant",
        id: entryIdOf(event, event.seq),
        text,
        streaming: false
      };
      const last = based.entries[based.entries.length - 1];
      const entries =
        last !== undefined && last.kind === "assistant" && last.streaming
          ? [...based.entries.slice(0, -1), finalized]
          : replaceOrAppend(based.entries, finalized);
      return { ...based, lastSeq: event.seq, entries };
    }

    case "tool.started": {
      if (typeof event.toolCallId !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const entry: TimelineEntry = {
        kind: "tool",
        id: event.toolCallId,
        toolName: typeof event.toolName === "string" ? event.toolName : "unknown",
        status: "running",
        output: "",
        truncated: false,
        code: typeof event.code === "string" ? event.code : null,
        language: typeof event.language === "string" ? event.language : null
      };
      return { ...based, lastSeq: event.seq, entries: replaceOrAppend(based.entries, entry) };
    }

    case "tool.output": {
      if (typeof event.toolCallId !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const target = based.entries.find(
        (entry) => entry.kind === "tool" && entry.id === event.toolCallId
      );
      if (target === undefined || target.kind !== "tool") {
        return { ...based, lastSeq: event.seq };
      }
      const chunk = typeof event.chunk === "string" ? event.chunk : "";
      const { output, truncated } = boundedOutput(target.output, chunk);
      return {
        ...based,
        lastSeq: event.seq,
        entries: replaceOrAppend(based.entries, { ...target, output, truncated })
      };
    }

    case "tool.finished": {
      if (typeof event.toolCallId !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const target = based.entries.find(
        (entry) => entry.kind === "tool" && entry.id === event.toolCallId
      );
      if (target === undefined || target.kind !== "tool") {
        return { ...based, lastSeq: event.seq };
      }
      const status: ToolStatus = event.isError === true ? "error" : "ok";
      const plan = Array.isArray(event.plan) ? event.plan : null;
      return {
        ...based,
        entries: replaceOrAppend(based.entries, { ...target, status, plan })
      };
    }

    case "interaction.requested": {
      if (typeof event.interactionId !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const entry: TimelineEntry = {
        kind: "ask",
        id: event.interactionId,
        title: typeof event.title === "string" ? event.title : String(event.method ?? "询问"),
        method: typeof event.method === "string" ? event.method : undefined,
        message: typeof event.message === "string" ? event.message : null,
        placeholder: typeof event.placeholder === "string" ? event.placeholder : null,
        options: Array.isArray(event.options)
          ? event.options.filter((option): option is string => typeof option === "string")
          : undefined,
        answered: false,
        approvalTool: typeof event.approvalTool === "string" ? event.approvalTool : null
      };
      return { ...based, lastSeq: event.seq, entries: replaceOrAppend(based.entries, entry) };
    }

    case "interaction.cancelled": {
      if (typeof event.cancelsId !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const target = based.entries.find(
        (entry) => entry.kind === "ask" && entry.id === event.cancelsId && !entry.answered
      );
      if (target === undefined || target.kind !== "ask") return { ...based, lastSeq: event.seq };
      const resolved: TimelineEntry = { ...target, answered: true };
      return {
        ...based,
        lastSeq: event.seq,
        entries: replaceOrAppend(based.entries, resolved)
      };
    }

    case "system.note": {
      if (typeof event.text !== "string") {
        return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
      }
      const level = event.level === "warning" || event.level === "error" ? event.level : "info";
      const entry: TimelineEntry = {
        kind: "note",
        id: `n${event.seq}`,
        level,
        text: event.text
      };
      return { ...based, lastSeq: event.seq, entries: replaceOrAppend(based.entries, entry) };
    }

    default:
      return { ...based, lastSeq: event.seq, unrecognized: based.unrecognized + 1 };
  }
}

/**
 * Builds a fresh model from a persisted `session.messages` page (read-only
 * histories and fresh opens). Unknown shapes count as `unrecognized` instead
 * of crashing restore.
 */
export function timelineFromMessages(page: {
  messages: readonly unknown[];
  staleCursor?: boolean;
}): TimelineModel {
  let model = emptyTimeline();
  for (const message of page.messages) {
    if (!isRecord(message)) {
      model = { ...model, unrecognized: model.unrecognized + 1 };
      continue;
    }
    const role = message.role;
    if (role !== "user" && role !== "assistant") {
      model = { ...model, unrecognized: model.unrecognized + 1 };
      continue;
    }
    const id =
      typeof message.id === "string" && message.id.length > 0
        ? message.id
        : `h${model.entries.length}`;
    const text = textOfPersisted(message);
    if (text.length === 0 && role === "assistant") continue;
    const entry: TimelineEntry =
      role === "user"
        ? { kind: "user", id, text }
        : { kind: "assistant", id, text, streaming: false };
    model = { ...model, entries: [...model.entries, entry] };
  }
  return model;
}

/**
 * Merges persisted ground truth INTO an existing model (switch-back and
 * post-desync recovery): known-id entries update in place; unknown entries
 * prepend above the live window preserving page order.
 */
export function mergeMessagePage(
  model: TimelineModel,
  page: { messages: readonly unknown[] }
): TimelineModel {
  const live = { ...model, entries: [...model.entries] };
  const prepend: TimelineEntry[] = [];
  for (const message of page.messages) {
    if (!isRecord(message)) continue;
    const role = message.role;
    if (role !== "user" && role !== "assistant") continue;
    const hasId = typeof message.id === "string" && message.id.length > 0;
    const id = hasId ? (message.id as string) : `h${prepend.length}-${live.entries.length}`;
    const text = textOfPersisted(message);
    const matchIndex = live.entries.findIndex((entry) => entry.id === id);
    if (matchIndex !== -1) {
      const target = live.entries[matchIndex]!;
      if ((target.kind === "assistant" || target.kind === "user") && text.length > 0 && text !== target.text) {
        live.entries[matchIndex] = { ...target, text };
      }
      continue;
    }
    if (!hasId && text.length === 0) continue;
    prepend.push(
      role === "user"
        ? { kind: "user", id, text }
        : { kind: "assistant", id, text, streaming: false }
    );
  }
  return { ...live, entries: [...prepend, ...live.entries], desynced: false };
}
