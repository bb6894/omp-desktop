import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { MessagePage, SessionRecord } from "../src/contracts";
import {
  createEmptyHarnessState,
  HarnessStore,
  harnessProjectId,
  resolveHarnessStorePath
} from "../src/harness-store";
import { HarnessMutationExecutor } from "../src/harness-mutation-executor";
import { HarnessMutationService } from "../src/harness-mutation-service";
import { OfficialOmpSessionAdapter, type OmpSessionAdapter } from "../src/omp-adapter";
import { resolveProfilePaths } from "../src/profile-paths";
import { SessionService } from "../src/session-service";
import { serveLocalHost } from "../src/host-server";
import { decodeLocalFrames, encodeLocalFrame } from "../src/local-frame";

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fakeAdapter(): OmpSessionAdapter {
  const record: SessionRecord = {
    id: "terminal-1",
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
  return {
    listReadOnly: async () => [record],
    loadMessagesReadOnly: async (sessionId): Promise<MessagePage> => ({
      sessionId,
      messages: [{ role: "user", content: "fixture" }],
      nextCursor: null,
      staleCursor: false
    }),
    forkFrom: async (sessionId) => ({ ...record, id: "desktop-1", writeMode: "desktop-owned", sourceSessionId: sessionId })
  };
}

function wiredService(project: string, dataRoot: string): SessionService {
  const inspector = new HarnessStore(project, dataRoot);
  const executor = new HarnessMutationExecutor(project, dataRoot);
  const service = new SessionService(fakeAdapter(), inspector, new HarnessMutationService(project, inspector, executor));
  // Attach a live agent surface so the COMMAND_NOT_ALLOWED branch proves the
  // agent.command allowlist itself excludes mutation operations.
  service.setAgentService({
    start: async () => ({ state: "streaming" }),
    stop: async () => ({ state: "stopped" }),
    respond: async () => ({ accepted: true }),
    command: async () => ({ accepted: true })
  });
  return service;
}

async function exchange(service: SessionService, requests: readonly unknown[]): Promise<unknown[]> {
  const input = requests.map((request) => encodeLocalFrame(request));
  const total = input.reduce((sum, frame) => sum + frame.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const frame of input) {
    bytes.set(frame, offset);
    offset += frame.byteLength;
  }
  async function* chunks(): AsyncGenerator<Uint8Array> {
    yield bytes;
  }
  const written: Uint8Array[] = [];
  await serveLocalHost(chunks(), { write: (chunk) => written.push(chunk) }, service);
  return written.flatMap((chunk) => decodeLocalFrames(chunk).frames);
}

test("preview, apply, replay, and rollback flow through the framed host protocol", async () => {
  const root = temporaryDirectory("omp-desktop-mutation-protocol-e2e-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  await mkdir(project, { recursive: true });
  const service = wiredService(project, dataRoot);

  const [previewResponse] = await exchange(service, [
    { type: "harness.preview", requestId: "p1", operation: "memory.add", title: "Protocol rule", content: "Applied over the local frame protocol." }
  ]);
  expect(previewResponse).toMatchObject({ type: "response", requestId: "p1", ok: true });
  const previewValue = (previewResponse as { value: { status: string; preview: Record<string, unknown> } }).value;
  expect(previewValue.status).toBe("previewed");
  expect(previewValue.preview.projectId).toBe(harnessProjectId(project));
  expect(JSON.stringify(previewResponse)).not.toContain(project);

  const approval = { approvedBy: "human-reviewer", reason: "Approved in the review pane" };
  const [applyResponse, replayResponse] = await exchange(service, [
    { type: "harness.apply", requestId: "a1", preview: previewValue.preview, approval },
    { type: "harness.apply", requestId: "a2", preview: previewValue.preview, approval }
  ]);
  expect(applyResponse).toMatchObject({ requestId: "a1", ok: true });
  expect((applyResponse as { value: { status: string } }).value.status).toBe("applied");
  expect(replayResponse).toMatchObject({ requestId: "a2", ok: true });
  expect((replayResponse as { value: { status: string; proposalId: string } }).value.status).toBe("already-applied");

  const stateBytes = await readFile(resolveHarnessStorePath(project, dataRoot));
  expect(JSON.parse(stateBytes.toString())).toMatchObject({
    projectId: harnessProjectId(project),
    memories: [{ title: "Protocol rule", status: "active" }],
    proposals: [{ status: "approved" }]
  });

  const [rollbackResponse] = await exchange(service, [
    { type: "harness.rollback", requestId: "r1", reason: "user requested revert" }
  ]);
  expect(rollbackResponse).toMatchObject({ requestId: "r1", ok: true });
  expect((rollbackResponse as { value: { status: string } }).value.status).toBe("rolled-back");
  const rolledBack = JSON.parse((await readFile(resolveHarnessStorePath(project, dataRoot))).toString());
  expect(rolledBack.memories).toEqual([]);
  expect(rolledBack.refinementHistory.at(-1)).toMatchObject({ outcome: "reverted", reason: "user requested revert" });
});

test("mutation commands stay closed: unavailable service, duplicate ids, extra fields, and generic routing", async () => {
  const root = temporaryDirectory("omp-desktop-mutation-protocol-closed-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const openService = wiredService(project, dataRoot);
  const closedService = new SessionService(fakeAdapter());

  for (const [index, type] of ["harness.preview", "harness.apply", "harness.rollback"].entries()) {
    const base: Record<string, unknown> = { type, requestId: `closed-${index}` };
    if (type === "harness.preview") Object.assign(base, { operation: "memory.add", title: "T", content: "C" });
    if (type === "harness.apply") Object.assign(base, { preview: {}, approval: { approvedBy: "u", reason: "r" } });
    if (type === "harness.rollback") base.reason = "revert";
    await expect(closedService.dispatch(base)).resolves.toMatchObject({
      ok: false,
      code: "HARNESS_MUTATION_UNAVAILABLE"
    });
  }

  await expect(openService.dispatch({ type: "harness.rollback", requestId: "dup", reason: "first" })).resolves.toMatchObject({ ok: true });
  await expect(openService.dispatch({ type: "harness.rollback", requestId: "dup", reason: "second" })).resolves.toMatchObject({
    ok: false,
    code: "DUPLICATE_REQUEST_ID"
  });

  await expect(openService.dispatch({
    type: "harness.preview",
    requestId: "extra-context",
    operation: "memory.add",
    title: "T",
    content: "C",
    projectId: "0".repeat(32)
  })).resolves.toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  await expect(openService.dispatch({
    type: "agent.command",
    requestId: "generic-route",
    sessionId: "desktop-1",
    command: { type: "harness.apply" }
  })).resolves.toMatchObject({ ok: false, code: "COMMAND_NOT_ALLOWED" });
});

test("protocol rejections carry stable codes only and never echo submitted text", async () => {
  const root = temporaryDirectory("omp-desktop-mutation-protocol-redacted-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const state = { ...createEmptyHarnessState(project), memories: [] };
  await mkdir(join(resolveHarnessStorePath(project, dataRoot), ".."), { recursive: true });
  await writeFile(resolveHarnessStorePath(project, dataRoot), JSON.stringify(state), "utf8");
  const service = wiredService(project, dataRoot);

  const responses = await exchange(service, [
    { type: "harness.preview", requestId: "x1", operation: "memory.replace", title: "leak-title-marker", content: "Body.", targetId: "memory-gone" },
    { type: "harness.preview", requestId: "x2", operation: "memory.add", title: "Credential rule", content: 'api_key = "TOPSECRETPAYLOAD99"' },
    { type: "harness.apply", requestId: "x3", preview: { forged: true }, approval: { approvedBy: "", reason: "leak-reason-marker" } },
    { type: "harness.apply", requestId: "x4", preview: {}, approval: { approvedBy: "u", reason: "r" }, cwd: "C:\\Users\\leaky\\path" }
  ]);

  expect(responses).toHaveLength(4);
  const [missingTarget, policyRejected, blankApproval, malformedApply] = responses;
  expect(missingTarget).toMatchObject({ ok: true });
  expect((missingTarget as { value: { code: string } }).value.code).toBe("HARNESS_TARGET_NOT_FOUND");
  expect(policyRejected).toMatchObject({ ok: true });
  expect((policyRejected as { value: { code: string; detail: string[] } }).value.detail).toEqual(["PROPOSAL_SECRET_DETECTED"]);
  expect(blankApproval).toMatchObject({ ok: true });
  expect((blankApproval as { value: { code: string } }).value.code).toBe("APPLY_APPROVAL_REQUIRED");
  expect(malformedApply).toMatchObject({ ok: false, code: "INVALID_REQUEST" });

  const serialized = JSON.stringify(responses);
  for (const sentinel of ["TOPSECRETPAYLOAD99", "leak-title-marker", "leak-reason-marker", "C:\\Users\\leaky\\path"]) {
    expect(serialized).not.toContain(sentinel);
  }
});
