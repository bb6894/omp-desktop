import { describe, expect, test } from "bun:test";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { FileSessionStorage, listSessionsReadOnly } from "../src/omp-vendor";
import { harnessProjectId } from "../src/harness-store";
import { TaskMetadataStore } from "../src/task-metadata-store";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "omp-task-metadata-"));
}

const SESSION_A = "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8";
const SESSION_B = "2026-08-24T02-11-08-818Z_01a03189-2d91-7000-bccc-a701c3228958";
const LOCK_NAME = "task-metadata.lock";

async function readIndexFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("load-or-empty: get on a missing file yields an empty index", async () => {
  const root = makeRoot();
  try {
    const store = new TaskMetadataStore(join(root, "projects", "p1", "task-metadata.json"));
    expect(await store.get()).toEqual({});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("set merges into the existing record and persists atomically", async () => {
  const root = makeRoot();
  try {
    const filePath = join(root, "projects", "p1", "task-metadata.json");
    const store = new TaskMetadataStore(filePath);
    const first = await store.set(SESSION_A, { pinned: true });
    expect(first).toEqual({ completed: false, pinned: true, lastViewedAt: null });
    const second = await store.set(SESSION_A, { completed: true, lastViewedAt: "2026-08-24T10:00:00.000Z" });
    expect(second).toEqual({ completed: true, pinned: true, lastViewedAt: "2026-08-24T10:00:00.000Z" });
    expect(await store.get()).toEqual({
      [SESSION_A]: { completed: true, pinned: true, lastViewedAt: "2026-08-24T10:00:00.000Z" }
    });
    expect(existsSync(filePath)).toBe(true);
    expect(await readdir(dirname(filePath))).toEqual(["task-metadata.json"]);
    expect(await readIndexFile(filePath)).toEqual(await store.get());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a corrupted metadata file degrades to an empty index instead of failing sessions", async () => {
  const root = makeRoot();
  try {
    const filePath = join(root, "task-metadata.json");
    await writeFile(filePath, "{not json");
    const store = new TaskMetadataStore(filePath);
    expect(await store.get()).toEqual({});
    const record = await store.set(SESSION_A, { pinned: true });
    expect(record.pinned).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an oversized persisted index surfaces the stable cap code", async () => {
  const root = makeRoot();
  try {
    const filePath = join(root, "task-metadata.json");
    const oversized: Record<string, unknown> = {};
    for (let i = 0; i < 5001; i += 1) oversized[`session-${i}`] = { completed: false, pinned: false, lastViewedAt: null };
    await writeFile(filePath, JSON.stringify(oversized));
    const store = new TaskMetadataStore(filePath);
    let code = "";
    try {
      await store.get();
    } catch (error) {
      code = error instanceof Error ? error.message : "";
    }
    expect(code).toBe("TASK_METADATA_INDEX_TOO_LARGE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale locks are taken over and orphan temp files are swept", async () => {
  const root = makeRoot();
  try {
    const projectDir = join(root, "projects", "p1");
    const filePath = join(projectDir, "task-metadata.json");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, LOCK_NAME), JSON.stringify({ pid: 999_999_999, acquiredAt: Date.now() - 60_000 }));
    await writeFile(join(projectDir, "task-metadata.json.123-0.tmp"), "junk");
    const store = new TaskMetadataStore(filePath);
    const record = await store.set(SESSION_A, { pinned: true });
    expect(record.pinned).toBe(true);
    expect(await readdir(projectDir)).toEqual(["task-metadata.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a live foreign lock times out with the stable code", async () => {
  const root = makeRoot();
  try {
    const projectDir = join(root, "projects", "p1");
    const filePath = join(projectDir, "task-metadata.json");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, LOCK_NAME), JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
    const store = new TaskMetadataStore(filePath, { maxAttempts: 2, waitBetweenAttempts: () => Promise.resolve() });
    let code = "";
    try {
      await store.set(SESSION_A, { pinned: true });
    } catch (error) {
      code = error instanceof Error ? error.message : "";
    }
    expect(code).toBe("TASK_METADATA_LOCK_TIMEOUT");
    // The foreign lock file must survive a failed acquisition.
    expect(existsSync(join(projectDir, LOCK_NAME))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a second writer waits for the lock then applies its merge without losing updates", async () => {
  const root = makeRoot();
  try {
    const projectDir = join(root, "projects", "p1");
    const filePath = join(projectDir, "task-metadata.json");
    const lockPath = join(projectDir, LOCK_NAME);
    await mkdir(projectDir, { recursive: true });
    const holder = new TaskMetadataStore(filePath);
    await holder.set(SESSION_A, { pinned: true });

    // Simulate a foreign holder; the injected wait seam releases it after the
    // contender's first retry — deterministic, no wall-clock timers.
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
    let waits = 0;
    const contender = new TaskMetadataStore(filePath, {
      maxAttempts: 5,
      waitBetweenAttempts: async () => {
        waits += 1;
        if (waits === 1) await unlink(lockPath);
      }
    });

    const record = await contender.set(SESSION_B, { completed: true });
    expect(record.completed).toBe(true);
    expect(waits).toBe(1);
    const final = await contender.get();
    expect(final[SESSION_A]).toEqual({ completed: false, pinned: true, lastViewedAt: null });
    expect(final[SESSION_B]).toEqual({ completed: true, pinned: false, lastViewedAt: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("set tolerates ids absent from session discovery (orphans are explicit maintenance)", async () => {
  const root = makeRoot();
  try {
    const store = new TaskMetadataStore(join(root, "task-metadata.json"));
    const record = await store.set("totally-unknown-session", { pinned: true });
    expect(record).toEqual({ completed: false, pinned: true, lastViewedAt: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sibling session files stay byte-identical across metadata operations", async () => {
  const root = makeRoot();
  try {
    const projectDir = join(root, "projects", "p1");
    const sibling = join(projectDir, "2026-08-24T09-40-18-123Z_session.jsonl");
    await mkdir(projectDir, { recursive: true });
    writeFileSync(sibling, "session-bytes\n");
    const before = await readFile(sibling);
    const store = new TaskMetadataStore(join(projectDir, "task-metadata.json"));
    await store.set(SESSION_A, { pinned: true });
    expect(await readFile(sibling)).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe("storage location", () => {
  test("SessionManager listing never returns the task metadata file at the chosen depth", async () => {
    const root = makeRoot();
    try {
      const cwd = join(root, "some-project");
      const sessionsDir = join(root, "agent", "sessions", "proj");
      await mkdir(sessionsDir, { recursive: true });
      await writeFile(
        join(sessionsDir, "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8.jsonl"),
        "{\"type\":\"session\"}\n"
      );

      const dataRoot = join(root, "appdata");
      const metadataPath = join(dataRoot, "OMP Desktop", "tasks", "projects", harnessProjectId(cwd), "task-metadata.json");
      await mkdir(dirname(metadataPath), { recursive: true });
      await writeFile(metadataPath, "{}");

      const infos = await listSessionsReadOnly(sessionsDir, new FileSessionStorage());
      expect(infos.map((info) => info.path)).not.toContain(metadataPath);
      expect(infos.every((info) => info.path.endsWith(".jsonl"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
