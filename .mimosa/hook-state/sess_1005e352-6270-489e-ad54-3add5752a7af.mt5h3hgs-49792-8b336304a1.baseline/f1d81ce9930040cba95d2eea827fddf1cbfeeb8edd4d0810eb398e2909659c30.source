import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import type { MessagePage, SessionRecord } from "../src/contracts";
import { serveLocalHost } from "../src/host-server";
import { decodeLocalFrames, encodeLocalFrame } from "../src/local-frame";
import { OfficialOmpSessionAdapter, type OmpSessionAdapter } from "../src/omp-adapter";
import { resolveProfilePaths } from "../src/profile-paths";
import { SessionService, type AgentServiceApi } from "../src/session-service";

test("reads terminal history without changing it and forks a desktop copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-desktop-session-test-"));
  const cwd = join(root, "repo");
  const profile = join(root, "profile");
  const paths = resolveProfilePaths(cwd, profile);
  const manager = SessionManager.create(cwd, paths.terminalSessionsDir);
  await manager.ensureOnDisk();
  manager.appendMessage({ role: "user", content: "stage0", timestamp: Date.now() });
  await manager.flush();
  const sourcePath = manager.getSessionFile();
  if (!sourcePath) throw new Error("test session was not persisted");
  const before = readFileSync(sourcePath);
  const adapter = new OfficialOmpSessionAdapter(cwd, paths);
  const sessions = await adapter.listReadOnly();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].writeMode).toBe("history-readonly");
  const page = await adapter.loadMessagesReadOnly(sessions[0].id, null, 10);
  expect(page.messages).toHaveLength(1);
  const fork = await adapter.forkFrom(sessions[0].id);
  const after = readFileSync(sourcePath);
  expect(after.equals(before)).toBe(true);
  expect(fork.writeMode).toBe("desktop-owned");
  expect(fork.sourceSessionId).toBe(sessions[0].id);
  expect(fork.sourcePath).not.toBe(sourcePath);
  expect(fork.sourcePath.startsWith(paths.desktopSessionsDir)).toBe(true);
  const forked = await adapter.listReadOnly();
  expect(forked.map((item) => item.id)).toContain(fork.id);
  await manager.close();
});

test("rejects a cursor created for a changed session size", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-desktop-cursor-test-"));
  const cwd = join(root, "repo");
  const profile = join(root, "profile");
  const paths = resolveProfilePaths(cwd, profile);
  const manager = SessionManager.create(cwd, paths.terminalSessionsDir);
  await manager.ensureOnDisk();
  manager.appendMessage({ role: "user", content: "cursor", timestamp: Date.now() });
  await manager.flush();
  const adapter = new OfficialOmpSessionAdapter(cwd, paths);
  const session = (await adapter.listReadOnly())[0];
  await expect(adapter.loadMessagesReadOnly(session.id, "1:0", 10)).rejects.toThrow("STALE_CURSOR");
  await manager.close();
});

function fakeSession(id = "terminal-1"): SessionRecord {
  return {
    id,
    sourcePath: "C:\\profile\\sessions\\session.jsonl",
    displayName: "fixture",
    projectPath: "C:\\project",
    updatedAt: "2026-08-22T00:00:00.000Z",
    writeMode: "history-readonly",
    sourceSessionId: null,
    parentSessionId: null,
    owner: "none",
    handoffState: "none",
    size: 1
  };
}

function fakeAdapter(): OmpSessionAdapter {
  return {
    listReadOnly: async () => [fakeSession()],
    loadMessagesReadOnly: async (sessionId): Promise<MessagePage> => ({
      sessionId,
      messages: [{ role: "user", content: "fixture" }],
      nextCursor: null,
      staleCursor: false
    }),
    forkFrom: async (sessionId) => ({ ...fakeSession("desktop-1"), writeMode: "desktop-owned", sourceSessionId: sessionId })
  };
}

test("dispatches only declared session commands and rejects agent commands without a runtime", async () => {
  const service = new SessionService(fakeAdapter());
  await expect(service.dispatch({ type: "session.list", requestId: "one" })).resolves.toMatchObject({ ok: true });
  await expect(service.dispatch({ type: "session.list", requestId: "one" })).resolves.toMatchObject({
    ok: false,
    code: "DUPLICATE_REQUEST_ID"
  });
  await expect(service.dispatch({ type: "unknown", requestId: "two" })).resolves.toMatchObject({
    ok: false,
    code: "UNKNOWN_COMMAND"
  });
  await expect(service.dispatch({ type: "agent.start", requestId: "three", sessionId: "desktop-1", prompt: "go" })).resolves.toMatchObject({
    ok: false,
    code: "INVALID_REQUEST"
  });
  await expect(service.dispatch({
    type: "agent.command",
    requestId: "four",
    sessionId: "desktop-1",
    command: { type: "shell.execute" }
  })).resolves.toMatchObject({ ok: false, code: "INVALID_REQUEST" });
});

test("serves a read-only harness inspection without starting an agent", async () => {
  const service = new SessionService(fakeAdapter(), {
    inspect: async () => ({
      readOnly: true,
      source: "harness-store",
      projectId: "fixture-project",
      state: {
        schemaVersion: 1,
        projectId: "fixture-project",
        projectPath: "C:\\project",
        compatibility: { runtimeVersion: "17.4.1", hostProtocol: 1 },
        goals: [],
        memories: [],
        skills: [],
        agentProfiles: [],
        proposals: [],
        refinementHistory: [],
        snapshots: []
      }
    })
  });
  await expect(service.dispatch({ type: "harness.inspect", requestId: "harness" })).resolves.toMatchObject({
    type: "response",
    requestId: "harness",
    ok: true,
    value: { readOnly: true, source: "harness-store", projectId: "fixture-project" }
  });
});

test("preserves stable harness rejection codes at the host boundary", async () => {
  const codes = [
    "HARNESS_STATE_INVALID_JSON",
    "HARNESS_SCHEMA_UNSUPPORTED",
    "HARNESS_PROJECT_MISMATCH",
    "HARNESS_INCOMPATIBLE",
    "HARNESS_STATE_INVALID",
    "HARNESS_STATE_TOO_LARGE",
    "HARNESS_STATE_LIMIT_EXCEEDED",
    "HARNESS_SECRET_DETECTED"
  ];
  for (const [index, code] of codes.entries()) {
    const service = new SessionService(fakeAdapter(), {
      inspect: async () => { throw new Error(code); }
    });
    await expect(service.dispatch({ type: "harness.inspect", requestId: `harness-${index}` })).resolves.toMatchObject({
      ok: false,
      code
    });
  }
});

test("forwards only the allowlisted agent command surface to the runtime service", async () => {
  const calls: unknown[] = [];
  const agent: AgentServiceApi = {
    start: async (...args) => { calls.push(["start", ...args]); return { state: "streaming" }; },
    stop: async (...args) => { calls.push(["stop", ...args]); return { state: "stopped" }; },
    respond: async (...args) => { calls.push(["respond", ...args]); return { accepted: true }; },
    command: async (...args) => { calls.push(["command", ...args]); return { accepted: true }; }
  };
  const service = new SessionService(fakeAdapter());
  service.setAgentService(agent);
  await expect(service.dispatch({
    type: "agent.command", requestId: "command", sessionId: "desktop-1", command: { type: "get_state" }
  })).resolves.toMatchObject({ ok: true });
  await expect(service.dispatch({
    type: "agent.command", requestId: "blocked", sessionId: "desktop-1", command: { type: "arbitrary" }
  })).resolves.toMatchObject({ ok: false, code: "COMMAND_NOT_ALLOWED" });
  await expect(service.dispatch({
    type: "interaction.respond", requestId: "answer", sessionId: "desktop-1", interactionId: "ui-1", value: "yes"
  })).resolves.toMatchObject({ ok: true });
  expect(calls).toEqual([
    ["command", "desktop-1", { type: "get_state" }],
    ["respond", "desktop-1", "ui-1", "yes"]
  ]);
});

test("serves ordered local frames without exposing a raw OMP surface", async () => {
  const first = encodeLocalFrame({ type: "session.list", requestId: "one" });
  const second = encodeLocalFrame({ type: "unknown", requestId: "two" });
  const input = new Uint8Array(first.byteLength + second.byteLength);
  input.set(first);
  input.set(second, first.byteLength);
  const written: Uint8Array[] = [];
  async function* chunks() {
    yield input.subarray(0, 7);
    yield input.subarray(7);
  }
  await serveLocalHost(chunks(), { write: (bytes) => written.push(bytes) }, new SessionService(fakeAdapter()));
  expect(written).toHaveLength(2);
  expect(decodeLocalFrames(written[0]).frames[0]).toMatchObject({ requestId: "one", ok: true });
  expect(decodeLocalFrames(written[1]).frames[0]).toMatchObject({ requestId: "two", ok: false, code: "UNKNOWN_COMMAND" });
});

test("rejects undeclared top-level fields including renderer-supplied paths", async () => {
  const service = new SessionService(fakeAdapter(), {
    inspect: async () => ({
      readOnly: true,
      source: "harness-store",
      projectId: "fixture-project",
      state: {
        schemaVersion: 1,
        projectId: "fixture-project",
        projectPath: "C:\\project",
        compatibility: { runtimeVersion: "17.4.1", hostProtocol: 1 },
        goals: [],
        memories: [],
        skills: [],
        agentProfiles: [],
        proposals: [],
        refinementHistory: [],
        snapshots: []
      }
    })
  });
  service.setAgentService({
    start: async () => ({ state: "streaming" }),
    stop: async () => ({ state: "stopped" }),
    respond: async () => ({ accepted: true }),
    command: async () => ({ accepted: true })
  });

  const requests: unknown[] = [
    { type: "session.list", requestId: "closed-1", sourcePath: "C:\\source" },
    {
      type: "session.messages",
      requestId: "closed-2",
      sessionId: "terminal-1",
      cursor: null,
      limit: 10,
      path: "C:\\source"
    },
    {
      type: "session.fork",
      requestId: "closed-3",
      sessionId: "terminal-1",
      sourcePath: "C:\\source"
    },
    { type: "harness.inspect", requestId: "closed-4", harnessPath: "C:\\harness" },
    {
      type: "agent.start",
      requestId: "closed-5",
      sessionId: "desktop-1",
      prompt: "go",
      runtimePath: "C:\\runtime"
    },
    { type: "agent.stop", requestId: "closed-6", sessionId: "desktop-1", path: "C:\\runtime" },
    {
      type: "interaction.respond",
      requestId: "closed-7",
      sessionId: "desktop-1",
      interactionId: "ui-1",
      value: "yes",
      path: "C:\\interaction"
    },
    {
      type: "agent.command",
      requestId: "closed-8",
      sessionId: "desktop-1",
      command: { type: "get_state" },
      path: "C:\\command"
    }
  ];

  for (const request of requests) {
    await expect(service.dispatch(request)).resolves.toMatchObject({
      ok: false,
      code: "INVALID_REQUEST"
    });
  }
  await expect(service.dispatch({
    type: "toString",
    requestId: "closed-prototype"
  })).resolves.toMatchObject({ ok: false, code: "UNKNOWN_COMMAND" });
});
