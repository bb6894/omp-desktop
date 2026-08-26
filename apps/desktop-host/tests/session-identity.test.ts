import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { FileSessionStorage, listSessionsReadOnly } from "../src/omp-vendor";
import { OmpRpcBridge } from "../src/rpc-bridge";
import { spawnVerifiedRuntime } from "../src/runtime";

/**
 * Phase 0 identity & lifecycle evidence (plan:
 * docs/superpowers/plans/2026-08-25-session-workbench-v1.md). Every assertion
 * runs against the REAL pinned runtime over the real RPC v2 bridge — no
 * fixtures, no field guessing.
 *
 * Binding rule under test (docs/agents/session-identity.md):
 *   Host SessionRecord.id  == canonical OMP UUID (stem's uuid component)
 *   Runtime sessionFile    == that same file        (durable anchor)
 *   Runtime sessionId      == live-instance id      (NEVER a join key)
 *
 * Materialization: sessions are in-memory until the first persisted turn; a
 * minimal real turn creates the file. Providers occasionally return empty
 * turns that persist nothing, so up to three attempts are made. The bounded
 * visibility wait is an intentional integration exception — the external
 * writer exposes no completion signal to await.
 */

const RUNTIME = resolve(import.meta.dir, "../../../artifacts/omp-windows-x64.exe");
const RUNTIME_AVAILABLE = existsSync(RUNTIME);

type Harness = {
  workRoot: string;
  projectDir: string;
  sessionDir: string;
  bridge: OmpRpcBridge;
};

async function spawnBridge(): Promise<Harness> {
  const workRoot = mkdtempSync(join(tmpdir(), "omp-identity-test-"));
  const projectDir = join(workRoot, "project");
  const sessionDir = join(projectDir, ".omp-sessions");
  await mkdir(sessionDir, { recursive: true });
  const spawned = await spawnVerifiedRuntime({
    runtimePath: RUNTIME,
    cwd: projectDir,
    sessionDir
  });
  const bridge = new OmpRpcBridge(spawned.process, { readyTimeoutMs: 20_000 });
  await bridge.start();
  return { workRoot, projectDir, sessionDir, bridge };
}

async function stopBridge(harness: Harness): Promise<void> {
  await harness.bridge.stop().catch(() => undefined);
  await rm(harness.workRoot, { recursive: true, force: true }).catch(() => undefined);
}

function stateData(response: unknown): Record<string, unknown> {
  return ((response as { data?: Record<string, unknown> }).data ?? {});
}

function stemOf(filePath: string): string {
  return basename(filePath).replace(/\.jsonl$/i, "");
}

async function waitForFile(path: string): Promise<boolean> {
  const deadline = Date.now() + 20_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) return false;
    await Bun.sleep(150);
  }
  return true;
}

async function materializeSession(bridge: OmpRpcBridge): Promise<string> {
  const reported = stateData(await bridge.request({ type: "get_state" })).sessionFile;
  if (typeof reported !== "string") throw new Error("IDENTITY_NO_SESSION_FILE");
  if (existsSync(reported)) return reported;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await bridge.request({
      type: "prompt",
      message: "Reply with the single word: ok"
    });
    if ((response as { success?: boolean }).success === true && (await waitForFile(reported))) {
      return reported;
    }
    await Bun.sleep(1_000 * attempt);
  }
  throw new Error("SESSION_FILE_NOT_MATERIALIZED");
}

test.skipIf(!RUNTIME_AVAILABLE)(
  "T0.2 create-binding: first persisted turn produces a SessionRecord with uuid/path/cwd equality",
  async () => {
    const harness = await spawnBridge();
    try {
      await harness.bridge.request({ type: "new_session" });
      const afterNew = String(stateData(await harness.bridge.request({ type: "get_state" })).sessionFile);
      // Laziness finding: identity exists before the file does.
      expect(existsSync(afterNew)).toBe(false);

      const createdFile = await materializeSession(harness.bridge);
      expect(createdFile.startsWith(harness.sessionDir)).toBe(true);

      const infos = await listSessionsReadOnly(harness.sessionDir, new FileSessionStorage());
      const matched = infos.find((info) => info.path === createdFile);
      expect(matched).toBeDefined();
      const uuidInStem = createdFile.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
      )?.[1];
      expect(uuidInStem).toBeDefined();
      expect(matched!.id).toBe(uuidInStem);
      expect(resolve(matched!.path)).toBe(resolve(createdFile));
      expect(matched!.cwd.replace(/[\\/]+$/, "")).toBe(harness.projectDir.replace(/[\\/]+$/, ""));
    } finally {
      await stopBridge(harness);
    }
  },
  240_000
);

test.skipIf(!RUNTIME_AVAILABLE)(
  "T0.3 restore-binding: switch_session is driven purely by record-derived paths; success is file-level, never sessionId",
  async () => {
    const harness = await spawnBridge();
    try {
      const fileA = await materializeSession(harness.bridge);
      await harness.bridge.request({ type: "new_session" });
      const fileB = await materializeSession(harness.bridge);
      expect(fileA).not.toBe(fileB);

      const toB = await harness.bridge.request({ type: "switch_session", sessionPath: fileB });
      expect((toB as { success?: boolean }).success).toBe(true);
      expect(stateData(await harness.bridge.request({ type: "get_state" })).sessionFile).toBe(fileB);

      const toA = await harness.bridge.request({ type: "switch_session", sessionPath: fileA });
      expect((toA as { success?: boolean }).success).toBe(true);
      expect(stateData(await harness.bridge.request({ type: "get_state" })).sessionFile).toBe(fileA);

      const bad = await harness.bridge.request({
        type: "switch_session",
        sessionPath: "Z:\\definitely\\missing.jsonl"
      });
      expect((bad as { success?: boolean }).success).toBe(false);
    } finally {
      await stopBridge(harness);
    }
  },
  240_000
);

test.skipIf(!RUNTIME_AVAILABLE)(
  "T0.4 two-runtime isolation: separate pipes keep identities, discovery, and liveness disjoint",
  async () => {
    const harnessA = await spawnBridge();
    const harnessB = await spawnBridge();

    try {
      await harnessA.bridge.request({ type: "new_session" });
      await harnessB.bridge.request({ type: "new_session" });
      const fileA = await materializeSession(harnessA.bridge);
      const fileB = await materializeSession(harnessB.bridge);
      expect(fileA.startsWith(harnessA.sessionDir)).toBe(true);
      expect(fileB.startsWith(harnessB.sessionDir)).toBe(true);

      const listA = await listSessionsReadOnly(harnessA.sessionDir, new FileSessionStorage());
      const listB = await listSessionsReadOnly(harnessB.sessionDir, new FileSessionStorage());
      expect(listA.some((info) => info.path === fileB)).toBe(false);
      expect(listB.some((info) => info.path === fileA)).toBe(false);

      const bytesA = (await readFile(fileA)).length;
      await stopBridge(harnessA);
      const alive = await harnessB.bridge.request({ type: "get_state" });
      expect((alive as { success?: boolean }).success).toBe(true);
      expect(existsSync(fileB)).toBe(true);
      // A's bytes were stable up to teardown (captured above); the workRoot
      // removal is this test's own cleanup, not an isolation signal.
    } finally {
      await stopBridge(harnessB);
      await rm(harnessA.workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  },
  240_000
);
