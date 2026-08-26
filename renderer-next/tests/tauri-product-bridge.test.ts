import { describe, expect, test } from "bun:test";
import { createTauriProductBridge, type InvokeSeam, type ListenSeam } from "../src/bridge/tauri-product-bridge";
import type { WorkspaceDiff } from "../src/bridge/product-bridge";

/**
 * Offline contract tests for the real transport (bare-value semantics):
 * dedicated thin commands resolve with the INNER Host value directly, while
 * failures reject with the stable code STRING. Nested Runtime queries await
 * correlated frames from the armed line stream (client id echo).
 */

type InvokeCall = { command: string; args: Record<string, unknown> | undefined };

function harness(responses: Record<string, unknown> = {}) {
  const calls: InvokeCall[] = [];
  const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>();
  const invoke: InvokeSeam = async (command, args) => {
    calls.push({ command, args });
    if (!(command in responses)) throw new Error(`no scripted response for ${command}`);
    const scripted = responses[command];
    return typeof scripted === "function" ? scripted(args ?? {}) : scripted;
  };
  const listen: ListenSeam = async (event, handler) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler);
    listeners.set(event, set);
    return () => {
      set.delete(handler);
    };
  };
  const bridge = createTauriProductBridge({ invoke, listen });
  const emit = (event: string, payload: unknown) => {
    for (const handler of listeners.get(event) ?? []) handler({ payload });
  };
  const armedHandlers = (prefix: string) =>
    [...listeners.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .reduce((total, [, set]) => total + set.size, 0);
  const sendBodies = () =>
    calls
      .filter((c) => c.command === "send_command")
      .map((c) => JSON.parse(String(c.args!.json)) as Record<string, unknown>);
  return { bridge, calls, emit, armedHandlers, sendBodies };
}

/** Yields once per microtask tick — deterministic flush of pending chains. */
async function flushMicrotasks(times = 4): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

describe("top-level thin commands", () => {
  test("listSessions routes session_views and unwraps the inner value", async () => {
    const listing = {
      views: [
        {
          id: "s1",
          title: "t",
          projectPath: "C:\\p",
          updatedAt: "x",
          writeMode: "desktop-owned",
          runtimeState: "idle"
        }
      ],
      skipped: 0,
      pruned: 1,
      metadata: {}
    };
    const h = harness({ session_views: listing });
    h.bridge.setActiveSession("route-1");
    const result = await h.bridge.listSessions();
    const call = h.calls.find((c) => c.command === "session_views");
    expect(call!.args!.sessionId).toBe("route-1");
    expect(result.pruned).toBe(1);
    expect(result.views[0]!.id).toBe("s1");
  });

  test("string rejections bubble the stable Host code", async () => {
    const h = harness({
      session_views: () => {
        throw "SESSION_METADATA_STORE_UNAVAILABLE";
      }
    });
    h.bridge.setActiveSession("r");
    await expect(h.bridge.listSessions()).rejects.toThrow("SESSION_METADATA_STORE_UNAVAILABLE");
  });

  test("no active route fails before touching IPC", async () => {
    const h = harness({});
    await expect(h.bridge.listSessions()).rejects.toThrow("PRODUCT_NO_ACTIVE_SESSION");
    expect(h.calls).toHaveLength(0);
  });

  test("setSessionMetadata forwards target id and patch", async () => {
    const record = { archived: false, pinned: true, lastViewedAt: null };
    const h = harness({ session_metadata_set: { record } });
    h.bridge.setActiveSession("route-1");
    const out = await h.bridge.setSessionMetadata("sess-3", { pinned: true });
    const call = h.calls.find((c) => c.command === "session_metadata_set");
    expect(call!.args).toMatchObject({ sessionId: "route-1", targetSessionId: "sess-3" });
    expect(out).toEqual(record);
  });

  test("listMessages forwards cursor paging fields", async () => {
    const page = { sessionId: "s", messages: [], nextCursor: null, staleCursor: false };
    const h = harness({ load_session_messages: page });
    h.bridge.setActiveSession("route-1");
    const out = await h.bridge.listMessages("s", null, 50);
    const call = h.calls.find((c) => c.command === "load_session_messages");
    expect(call!.args).toMatchObject({ sessionId: "route-1", targetSessionId: "s", limit: 50 });
    expect(out.nextCursor).toBeNull();
  });

  test("forkSession unwraps the child record id", async () => {
    const h = harness({ fork_session: { id: "child-uuid" } });
    h.bridge.setActiveSession("route-1");
    expect(await h.bridge.forkSession("parent")).toBe("child-uuid");
  });

  test("openRuntimeSession sends only ids — never file paths", async () => {
    const h = harness({ session_open_runtime: { sessionId: "child-uuid", state: "ready" } });
    h.bridge.setActiveSession("child-route");
    await h.bridge.openRuntimeSession("child-uuid");
    const call = h.calls.find((c) => c.command === "session_open_runtime");
    expect(call!.args).toEqual({ sessionId: "child-route", targetSessionId: "child-uuid" });
    expect(JSON.stringify(call)).not.toContain(".jsonl");
  });

  test("workspace ops frame their thin commands", async () => {
    const listing = { files: [{ path: "a.ts", code: "M" }], truncated: false };
    const diff: WorkspaceDiff = { kind: "text", diff: "-a\n+b", truncated: false };
    const h = harness({ workspace_changes: listing, workspace_diff: diff });
    h.bridge.setActiveSession("route-1");
    expect(await h.bridge.getWorkspaceChanges()).toEqual(listing);
    expect(await h.bridge.getWorkspaceDiff("src/a.ts")).toEqual(diff);
    const changesCall = h.calls.find((c) => c.command === "workspace_changes");
    expect(changesCall!.args!.sessionId).toBe("route-1");
    const diffCall = h.calls.find((c) => c.command === "workspace_diff");
    expect(diffCall!.args).toEqual({ sessionId: "route-1", path: "src/a.ts" });
  });
});

describe("nested agent.command path", () => {
  test("sendPrompt frames prompt with target id", async () => {
    const h = harness({ send_command: null });
    h.bridge.setActiveSession("route-1");
    await h.bridge.sendPrompt("sess-9", "你好");
    expect(h.sendBodies()[0]).toMatchObject({
      type: "agent.command",
      sessionId: "sess-9",
      command: { type: "prompt", message: "你好" }
    });
  });

  test("abortSession frames abort", async () => {
    const h = harness({ send_command: null });
    h.bridge.setActiveSession("route-2");
    await h.bridge.abortSession("sess-6");
    expect(h.sendBodies()[0]).toMatchObject({
      type: "agent.command",
      sessionId: "sess-6",
      command: { type: "abort" }
    });
  });

  test("respondInteraction spreads the response patch onto the frame", async () => {
    const h = harness({ send_command: null });
    h.bridge.setActiveSession("route-3");
    await h.bridge.respondInteraction("sess-5", "ask-9", { confirmed: true });
    await h.bridge.respondInteraction("sess-5", "ask-10", { value: "continue" });
    expect(h.sendBodies()[0]).toMatchObject({
      type: "agent.command",
      sessionId: "sess-5",
      command: { type: "extension_ui_response", id: "ask-9", confirmed: true }
    });
    expect(h.sendBodies()[1]).toMatchObject({
      command: { type: "extension_ui_response", id: "ask-10", value: "continue" }
    });
  });

  test("fetchWorkbenchState correlates streamed responses by client id", async () => {
    const h = harness({ send_command: null });
    const off = await h.bridge.subscribeEvents("s", {
      onEvent: () => undefined,
      onExit: () => undefined
    });
    const pending = h.bridge.fetchWorkbenchState("s");
    // The runtime echoes our client id back on the line stream.
    h.emit("agent://line/s", {
      type: "response",
      id: "ui-1",
      success: true,
      data: { model: { id: "m1", provider: "acme" }, thinkingLevel: "high" }
    });
    await flushMicrotasks();
    h.emit("agent://line/s", {
      type: "response",
      id: "ui-2",
      success: true,
      data: {
        models: [
          { id: "m1", provider: "acme" },
          { id: "alt", provider: "beta" },
          "junk-string",
          { id: "no-provider" }
        ]
      }
    });
    const state = await pending;
    expect(state).toEqual({
      model: "m1",
      thinkingLevel: "high",
      models: [
        { id: "m1", provider: "acme" },
        { id: "alt", provider: "beta" }
      ]
    });
    off();
  });

  test("model listing failures degrade to an empty list without losing current model", async () => {
    const h = harness({ send_command: null });
    const off = await h.bridge.subscribeEvents("s", {
      onEvent: () => undefined,
      onExit: () => undefined
    });
    const pending = h.bridge.fetchWorkbenchState("s");
    h.emit("agent://line/s", {
      type: "response",
      id: "ui-1",
      success: true,
      data: { model: { id: "m" }, thinkingLevel: null }
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    h.emit("agent://line/s", {
      type: "response",
      id: "ui-2",
      success: false,
      error: "RPC_BUSY"
    });
    const state = await pending;
    expect(state.model).toBe("m");
    expect(state.models).toEqual([]);
    off();
  });
});

test("createSession generates route id and forwards cwd", async () => {
  const h = harness({ start_session: null });
  const id = await h.bridge.createSession("C:\\proj");
  expect(id.startsWith("session-")).toBe(true);
  const call = h.calls.find((c) => c.command === "start_session");
  expect(call!.args).toEqual({ sessionId: id, cwd: "C:\\proj" });
});

describe("event subscription discipline", () => {
  test("arms event+exit together, routes seq-tagged payloads, tears both down once", async () => {
    const h = harness({});
    const events: unknown[] = [];
    const exits: string[] = [];
    const off = await h.bridge.subscribeEvents("sess-7", {
      onEvent: (event) => events.push(event),
      onExit: (reason) => exits.push(reason)
    });
    expect(h.armedHandlers("agent://line/sess-7")).toBe(1);
    expect(h.armedHandlers("agent://exit/sess-7")).toBe(1);
    // Response frames ride the same stream for correlation but never reach onEvent.
    h.emit("agent://line/sess-7", { type: "response", id: "r1", success: true });
    h.emit("agent://line/sess-7", { v: 1, kind: "run.state", sessionId: "s1", seq: 1, state: "streaming" });
    h.emit("agent://line/sess-7", { type: "turn_start" }); // no seq → not a timeline event
    h.emit("agent://exit/sess-7", "boom");
    expect(events).toEqual([
      { v: 1, kind: "run.state", sessionId: "s1", seq: 1, state: "streaming" }
    ]);
    expect(exits).toEqual(["boom"]);
    off();
    off();
    expect(h.armedHandlers("agent://line/sess-7")).toBe(0);
    expect(h.armedHandlers("agent://exit/sess-7")).toBe(0);
  });

  test("non-string exit payloads become empty reason strings", async () => {
    const h = harness({});
    const exits: string[] = [];
    const off = await h.bridge.subscribeEvents("s", {
      onEvent: () => undefined,
      onExit: (reason) => exits.push(reason)
    });
    h.emit("agent://exit/s", { code: 7 });
    expect(exits).toEqual([""]);
    off();
  });
});

test("default seams refuse construction without Tauri globals", () => {
  expect(() => createTauriProductBridge()).toThrow("PRODUCT_TAURI_UNAVAILABLE");
});
