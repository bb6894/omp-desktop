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
import { SessionService } from "../src/session-service";

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

test("dispatches only declared session commands and rejects duplicate or premature agent commands", async () => {
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
    code: "NOT_IMPLEMENTED"
  });
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
