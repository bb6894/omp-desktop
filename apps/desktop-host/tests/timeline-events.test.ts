import { describe, expect, test } from "bun:test";
import { translateFrame } from "../src/timeline-events";
import { isLiveRunState, MAX_TOOL_OUTPUT_CHARS } from "../../../protocol/domain";

describe("translateFrame", () => {
  test("assistant message lifecycle maps to added/delta/finalized with ids", () => {
    const start = translateFrame({
      type: "message_start",
      message: { id: "m-1", role: "assistant", content: [] }
    });
    expect(start).toEqual({
      events: [{ kind: "message.added", messageId: "m-1", role: "assistant", text: "" }],
      ignored: 0
    });

    const delta = translateFrame({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "你好" }
    });
    expect(delta.events).toEqual([{ kind: "message.delta", delta: "你好" }]);

    const end = translateFrame({
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "定稿" }] }
    });
    expect(end).toEqual({
      events: [{ kind: "message.finalized", messageId: null, text: "定稿" }],
      ignored: 0
    });
  });

  test("non-text deltas and unknown roles are ignored without events", () => {
    expect(
      translateFrame({ type: "message_update", assistantMessageEvent: { type: "toolcall_delta" } })
    ).toEqual({ events: [], ignored: 1 });
    expect(translateFrame({ type: "message_start", message: { role: "tool_result" } })).toEqual({
      events: [],
      ignored: 1
    });
  });

  test("runtime registry, config, session info, and command output translate", () => {
    const registry = translateFrame({
      type: "available_commands_update",
      commands: [
        { name: "review", description: "审查工作区", input: { hint: "[范围]" }, source: "skill" },
        { name: "BAD NAME", junk: true },
        { name: "mcp-docs", source: "mcp:docs" }
      ]
    });
    expect(registry).toEqual({
      events: [
        {
          kind: "commands.update",
          commands: [
            { name: "review", aliases: null, description: "审查工作区", inputHint: "[范围]", source: "skill" },
            { name: "mcp-docs", aliases: null, description: null, inputHint: null, source: "mcp:docs" }
          ]
        }
      ],
      ignored: 0
    });
    expect(
      translateFrame({ type: "config_update", model: { id: "m2", provider: "acme" }, thinkingLevel: "high" })
    ).toEqual({
      events: [{ kind: "config.update", model: "m2", thinkingLevel: "high" }],
      ignored: 0
    });
    expect(translateFrame({ type: "config_update" })).toEqual({
      events: [],
      ignored: 1
    });
    expect(translateFrame({ type: "session_info_update", title: "重构会话" })).toEqual({
      events: [{ kind: "session.info", name: "重构会话" }],
      ignored: 0
    });
    expect(translateFrame({ type: "command_output", text: "done" })).toEqual({
      events: [{ kind: "system.note", level: "info", text: "done" }],
      ignored: 0
    });
    expect(translateFrame({ type: "command_output", text: "" })).toEqual({ events: [], ignored: 1 });
  });

  test("tool lifecycle carries bounded output and error status", () => {
    const long = "x".repeat(MAX_TOOL_OUTPUT_CHARS + 100);
    expect(translateFrame({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" })).toEqual({
      events: [{ kind: "tool.started", toolCallId: "t1", toolName: "read", code: null, language: null }],
      ignored: 0
    });
    const chunk = translateFrame({ type: "tool_execution_update", toolCallId: "t1", output: long });
    expect(chunk.events[0]).toMatchObject({
      kind: "tool.output",
      toolCallId: "t1",
      chunk: long.slice(0, MAX_TOOL_OUTPUT_CHARS)
    });
    expect(translateFrame({ type: "tool_execution_end", toolCallId: "t1", isError: true })).toEqual({
      events: [{ kind: "tool.finished", toolCallId: "t1", isError: true, plan: null }],
      ignored: 0
    });
  });

  test("todo results carry a bounded plan view; eval starts carry code", () => {
    const planFrame = {
      type: "tool_execution_end",
      toolCallId: "p1",
      toolName: "todo",
      isError: false,
      result: {
        details: {
          phases: [
            { name: "Phase A", tasks: [{ content: "Do it", status: "completed" }, { junk: true }] }
          ]
        }
      }
    };
    expect(translateFrame(planFrame)).toEqual({
      events: [
        {
          kind: "tool.finished",
          toolCallId: "p1",
          isError: false,
          plan: [{ name: "Phase A", tasks: [{ content: "Do it", status: "completed" }] }]
        }
      ],
      ignored: 0
    });
    expect(translateFrame({ type: "tool_execution_end", toolCallId: "p2", isError: false })).toEqual({
      events: [{ kind: "tool.finished", toolCallId: "p2", isError: false, plan: null }],
      ignored: 0
    });
    expect(
      translateFrame({
        type: "tool_execution_start",
        toolCallId: "e1",
        toolName: "eval",
        args: { language: "py", code: "print(1)" }
      })
    ).toEqual({
      events: [
        { kind: "tool.started", toolCallId: "e1", toolName: "eval", code: "print(1)", language: "py" }
      ],
      ignored: 0
    });
  });

  test("interaction requests map with method/title/options; malformed ids are ignored", () => {
    expect(
      translateFrame({ type: "extension_ui_request", id: "i1", method: "select", title: "选", options: ["a", 3] })
    ).toEqual({
      events: [
        {
          kind: "interaction.requested",
          interactionId: "i1",
          method: "select",
          title: "选",
          message: null,
          placeholder: null,
          options: ["a"],
          approvalTool: null
        }
      ],
      ignored: 0
    });
    expect(translateFrame({ type: "extension_ui_request", method: "confirm" })).toEqual({
      events: [],
      ignored: 1
    });
  });

  test("turn bookkeeping, ready, responses and unknown types never reach the timeline", () => {
    for (const frame of [
      { type: "turn_start" },
      { type: "agent_end" },
      { type: "ready" },
      { type: "response", success: true },
      { type: "brand_new_future_event" },
      {}
    ]) {
      expect(translateFrame(frame as Record<string, unknown>)).toEqual({ events: [], ignored: 1 });
    }
  });
});

test("isLiveRunState splits terminal from live machine states", () => {
  for (const live of ["starting", "streaming", "awaiting-tool", "awaiting-interaction", "stopping"]) {
    expect(isLiveRunState(live as never)).toBe(true);
  }
  for (const terminal of ["idle", "completed", "interrupted", "failed"]) {
    expect(isLiveRunState(terminal as never)).toBe(false);
  }
});

describe("extension UI side channels (P1)", () => {
  test("cancel resolves the matching dialog; malformed cancels are ignored", () => {
    expect(translateFrame({ type: "extension_ui_request", id: "x1", method: "cancel", targetId: "ask-1" })).toEqual({
      events: [{ kind: "interaction.cancelled", interactionId: "x1", cancelsId: "ask-1" }],
      ignored: 0
    });
    expect(translateFrame({ type: "extension_ui_request", method: "cancel" })).toEqual({ events: [], ignored: 1 });
  });

  test("notify maps to a system note with notifyType level", () => {
    expect(
      translateFrame({ type: "extension_ui_request", id: "n1", method: "notify", message: "完成", notifyType: "warning" })
    ).toEqual({
      events: [{ kind: "system.note", level: "warning", text: "完成" }],
      ignored: 0
    });
    expect(translateFrame({ type: "extension_ui_request", id: "n2", method: "notify", message: "默认级别" })).toEqual({
      events: [{ kind: "system.note", level: "info", text: "默认级别" }],
      ignored: 0
    });
    expect(translateFrame({ type: "extension_ui_request", id: "n3", method: "notify" })).toEqual({ events: [], ignored: 1 });
  });

  test("non-interactive side-channel methods never reach the timeline", () => {
    for (const frame of [
      { type: "extension_ui_request", id: "s1", method: "setStatus", statusKey: "k" },
      { type: "extension_ui_request", id: "w1", method: "setWidget", widgetKey: "k" },
      { type: "extension_ui_request", id: "t1", method: "setTitle", title: "T" },
      { type: "extension_ui_request", id: "u1", method: "open_url", url: "https://x" }
    ]) {
      expect(translateFrame(frame as Record<string, unknown>)).toEqual({ events: [], ignored: 1 });
    }
  });

  test("confirm carries the action description; input carries placeholder", () => {
    expect(
      translateFrame({ type: "extension_ui_request", id: "c1", method: "confirm", title: "允许执行?", message: "rm -rf /tmp/x" })
    ).toEqual({
      events: [
        {
          kind: "interaction.requested",
          interactionId: "c1",
          method: "confirm",
          title: "允许执行?",
          message: "rm -rf /tmp/x",
          placeholder: null,
          options: null,
          approvalTool: null
        }
      ],
      ignored: 0
    });
    expect(
      translateFrame({ type: "extension_ui_request", id: "i1", method: "input", title: "名称", placeholder: "my-app" })
    ).toEqual({
      events: [
        {
          kind: "interaction.requested",
          interactionId: "i1",
          method: "input",
          title: "名称",
          message: null,
          placeholder: "my-app",
          options: null,
          approvalTool: null
        }
      ],
      ignored: 0
    });
  });

  test("tool-approval prompts carry the approvalTool identity", () => {
    expect(
      translateFrame({
        type: "extension_ui_request",
        id: "a1",
        method: "select",
        title: "Allow tool: bash\n$ npm install",
        options: ["Approve", "Deny"]
      })
    ).toEqual({
      events: [
        {
          kind: "interaction.requested",
          interactionId: "a1",
          method: "select",
          title: "Allow tool: bash\n$ npm install",
          message: null,
          placeholder: null,
          options: ["Approve", "Deny"],
          approvalTool: "bash"
        }
      ],
      ignored: 0
    });
  });
});
