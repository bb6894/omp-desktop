import { describe, expect, test } from "bun:test";
import {
  emptyTimeline,
  mergeMessagePage,
  reduceTimeline,
  timelineFromMessages,
  type TimelineModel
} from "../src/lib/event-reducer";
import type { TimelineEvent } from "../../protocol/domain";

type DistributedOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventSeed = DistributedOmit<TimelineEvent, "v" | "seq" | "sessionId">;

let seq = 0;
function event(partial: EventSeed): TimelineEvent {
  seq += 1;
  return { v: 1, sessionId: "s1", seq, ...partial } as TimelineEvent;
}

function fold(events: TimelineEvent[]): TimelineModel {
  return events.reduce(reduceTimeline, emptyTimeline());
}

const ASSISTANT_LIFECYCLE: TimelineEvent[] = [
  event({ kind: "run.state", state: "streaming" }),
  event({ kind: "message.added", messageId: null, role: "assistant", text: "" }),
  event({ kind: "message.delta", delta: "第一段" }),
  event({ kind: "message.delta", delta: "第二段" }),
  event({ kind: "message.finalized", messageId: "m-7", text: "第一段第二段(定稿)" }),
  event({ kind: "run.state", state: "completed" })
];

test("assistant lifecycle folds deltas then finalizes with authoritative end text", () => {
  const model = fold(ASSISTANT_LIFECYCLE);
  expect(model.turnActive).toBe(false);
  expect(model.runState).toBe("completed");
  expect(model.unrecognized).toBe(0);
  const assistant = model.entries.find((entry) => entry.kind === "assistant");
  expect(assistant).toEqual({
    kind: "assistant",
    id: "m-7",
    text: "第一段第二段(定稿)",
    streaming: false
  });
});

test("tool events produce one bounded card from running to terminal status", () => {
  const longChunk = "x".repeat(9_000);
  const model = fold([
    event({ kind: "run.state", state: "awaiting-tool" }),
    event({ kind: "tool.started", toolCallId: "t1", toolName: "read" }),
    event({ kind: "tool.output", toolCallId: "t1", chunk: longChunk }),
    event({ kind: "tool.output", toolCallId: "t1", chunk: "tail" }),
    event({ kind: "tool.finished", toolCallId: "t1", isError: true })
  ]);
  expect(model.entries).toHaveLength(1);
  const tool = model.entries[0];
  expect(tool).toMatchObject({
    kind: "tool",
    id: "t1",
    toolName: "read",
    status: "error",
    truncated: true
  });
  if (tool.kind === "tool") expect(tool.output.length).toBeLessThanOrEqual(8_000);
});

test("interaction.requested records a pending ask entry with options", () => {
  const model = fold([
    event({
      kind: "interaction.requested",
      interactionId: "ask-1",
      method: "select",
      title: "选择继续方式",
      message: null,
      placeholder: null,
      approvalTool: null,
      options: ["继续", "停止"]
    })
  ]);
  expect(model.entries[0]).toEqual({
    kind: "ask",
    id: "ask-1",
    title: "选择继续方式",
    method: "select",
    message: null,
    placeholder: null,
    options: ["继续", "停止"],
    approvalTool: null,
    answered: false
  });
});

test("commands.update replaces the registry; config and session info update fields", () => {
  const model = fold([
    event({
      kind: "commands.update",
      commands: [
        { name: "review", aliases: null, description: "审查", inputHint: null, source: "skill" },
        { junk: true }
      ]
    }),
    event({ kind: "config.update", model: "m2", thinkingLevel: "low" }),
    event({ kind: "session.info", name: "重构会话" })
  ]);
  expect(model.commands.map((command) => command.name)).toEqual(["review"]);
  expect(model.configModel).toBe("m2");
  expect(model.configThinking).toBe("low");
  expect(model.sessionName).toBe("重构会话");
  expect(model.entries).toHaveLength(0);
  const partial = fold([
    event({ kind: "config.update", model: "m9" }),
    event({ kind: "session.info", name: null })
  ]);
  expect(partial.configModel).toBe("m9");
  expect(partial.configThinking).toBeNull();
  expect(partial.sessionName).toBeNull();
});

test("unknown kinds and malformed events increment the counter without crashing", () => {
  let model = fold([
    event({ kind: "mystery.kind" } as unknown as TimelineEvent),
    { noKind: true },
    null,
    "text"
  ] as unknown as TimelineEvent[]);
  expect(model.unrecognized).toBe(4);
  expect(model.entries).toHaveLength(0);
  model = reduceTimeline(model, { v: 1, kind: "run.state", sessionId: "s", seq: model.lastSeq + 5, state: "idle" });
  // Gap above is flagged but the event still applies; recovery is the caller's job.
  expect(model.desynced).toBe(true);
  expect(model.runState).toBe("idle");
});

test("duplicate sequence numbers are idempotent no-ops", () => {
  const first = fold([
    event({ kind: "tool.started", toolCallId: "d1", toolName: "edit" }),
    event({ kind: "tool.finished", toolCallId: "d1", isError: false })
  ]);
  const replayed = reduceTimeline(first, {
    v: 1,
    kind: "tool.started",
    sessionId: "s1",
    seq: 1,
    toolCallId: "d1",
    toolName: "edit"
  });
  expect(replayed).toBe(first);
});

test("identical input sequences fold to identical models (determinism)", () => {
  const events = [
    ...ASSISTANT_LIFECYCLE,
    event({ kind: "tool.started", toolCallId: "t9", toolName: "edit" }),
    event({ kind: "tool.finished", toolCallId: "t9", isError: false })
  ];
  const first = fold(events);
  const second = fold([...events]);
  expect(second).toEqual(first);
});

describe("timelineFromMessages hydration", () => {
  test("maps persisted roles into settled entries in order (text and content shapes)", () => {
    const model = timelineFromMessages({
      messages: [
        { role: "user", text: "你好" },
        { role: "assistant", content: [{ type: "text", text: "在的" }] }
      ]
    });
    expect(model.entries.map((entry) => entry.kind)).toEqual(["user", "assistant"]);
    if (model.entries[0]) expect(model.entries[0]).toMatchObject({ kind: "user", text: "你好" });
    if (model.entries[1]) expect(model.entries[1]).toMatchObject({ kind: "assistant", text: "在的" });
    expect(model.entries.every((entry) => !("streaming" in entry) || !entry.streaming)).toBe(true);
  });

  test("block-array content joins text parts; unknown roles count unrecognized", () => {
    const model = timelineFromMessages({
      messages: [
        { role: "user", content: [{ type: "text", text: "块一" }, { type: "text", text: "块二" }] },
        { role: "tool_result", content: "?" }
      ]
    });
    expect(model.entries[0]).toMatchObject({ kind: "user", text: "块一块二" });
    expect(model.unrecognized).toBe(1);
  });
});

describe("mergeMessagePage recovery merge", () => {
  test("prepends unknown history above the live window and clears desync", () => {
    const live = fold([
      event({ kind: "run.state", state: "streaming" }),
      event({ kind: "message.added", messageId: "live-1", role: "assistant", text: "进行中" })
    ]);
    live.desynced = true;
    const merged = mergeMessagePage(live, {
      messages: [{ id: "old-1", role: "user", text: "更早的问题" }]
    });
    expect(merged.desynced).toBe(false);
    expect(merged.entries.map((entry) => entry.id)).toEqual(["old-1", "live-1"]);
  });

  test("known-id entries update ground-truth text in place", () => {
    const live = fold([
      event({ kind: "message.added", messageId: "m-7", role: "assistant", text: "" }),
      event({ kind: "message.delta", delta: "部分" })
    ]);
    const merged = mergeMessagePage(live, {
      messages: [{ id: "m-7", role: "assistant", text: "部分(定稿)" }]
    });
    const assistant = merged.entries.find((entry) => entry.id === "m-7");
    expect(assistant).toMatchObject({ kind: "assistant", text: "部分(定稿)" });
  });
});

describe("P1 interaction lifecycle", () => {
  test("runtime cancel marks the matching ask card answered", () => {
    const model = fold([
      event({
        kind: "interaction.requested",
        interactionId: "ask-9",
        method: "confirm",
        title: "允许写入?",
        message: "将修改 2 个文件",
        placeholder: null,
          approvalTool: null,
        options: null
      }),
      event({ kind: "interaction.cancelled", cancelsId: "ask-9" })
    ]);
    const ask = model.entries.find((entry) => entry.id === "ask-9");
    expect(ask).toMatchObject({ kind: "ask", answered: true, message: "将修改 2 个文件" });
  });

  test("system notes append as level-tagged note entries", () => {
    const model = fold([
      event({ kind: "system.note", level: "info", text: "后台任务已启动" }),
      event({ kind: "system.note", level: "error", text: "提供方限流" })
    ]);
    expect(model.entries.map((entry) => entry.kind)).toEqual(["note", "note"]);
    expect(model.entries[0]).toMatchObject({ level: "info", text: "后台任务已启动" });
    expect(String(model.entries[0]?.id)).toMatch(/^n\d+$/);
    expect(model.entries[1]).toMatchObject({ level: "error" });
    expect(String(model.entries[1]?.id)).toMatch(/^n\d+$/);
  });

  test("confirm cards expose message body for the permission card", () => {
    const model = fold([
      event({
        kind: "interaction.requested",
        interactionId: "c1",
        method: "confirm",
        title: "允许执行 bash?",
        message: "git push origin main",
        placeholder: null,
          approvalTool: null,
        options: null
      })
    ]);
    expect(model.entries[0]).toMatchObject({
      kind: "ask",
      method: "confirm",
      message: "git push origin main",
      answered: false
    });
  });
});
