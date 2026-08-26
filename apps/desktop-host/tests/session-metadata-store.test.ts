import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionMetadataStore } from "../src/session-metadata-store";

/**
 * Non-content session metadata (archived / pinned / lastViewedAt), keyed by
 * canonical session UUID, one JSON per project, advisory-lock RMW with atomic
 * writes. Fresh Phase 1 design — same discipline as the harness store family,
 * zero code shared with the paused task-model store.
 */

const SESSION_A = "01a03730-a280-7000-bf3c-1d0a82be2f31";
const SESSION_B = "01a03725-24c9-7000-8fc1-42b8cd1e6709";
const LOCK_NAME = "session-metadata.lock";

function makeProjectDir(): string {
  const root = mkdtempSync(join(tmpdir(), "omp-session-metadata-"));
  return root;
}

async function readIndexFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

test("load-or-empty: get on a missing file yields an empty index", async () => {
  const dir = makeProjectDir();
  try {
    const store = new SessionMetadataStore(join(dir, "metadata.json"));
    expect(await store.get()).toEqual({});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("set merges bounded fields and persists atomically under the lock", async () => {
  const dir = makeProjectDir();
  try {
    const filePath = join(dir, "metadata.json");
    const store = new SessionMetadataStore(filePath);
    await store.set(SESSION_A, { pinned: true });
    await store.set(SESSION_A, { lastViewedAt: "2026-08-25T05:00:00.000Z" });
    const record = await store.set(SESSION_A, { archived: false });
    expect(record).toEqual({ archived: false, pinned: true, lastViewedAt: "2026-08-25T05:00:00.000Z" });
    expect(await readIndexFile(filePath)).toEqual({
      [SESSION_A]: { archived: false, pinned: true, lastViewedAt: "2026-08-25T05:00:00.000Z" }
    });
    // Lock released.
    expect(existsSync(join(dir, LOCK_NAME))).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("set rejects values outside the bounded field set", async () => {
  const dir = makeProjectDir();
  try {
    const store = new SessionMetadataStore(join(dir, "metadata.json"));
    await store.set(SESSION_A, { pinned: "yes" as unknown as boolean }).catch((error) => {
      expect((error as Error).message).toBe("SESSION_METADATA_INVALID_RECORD");
      return null;
    });
    expect(await store.get()).toEqual({});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prune removes only orphaned keys, persists, and reports the count", async () => {
  const dir = makeProjectDir();
  try {
    const filePath = join(dir, "metadata.json");
    const store = new SessionMetadataStore(filePath);
    await store.set(SESSION_A, { pinned: true });
    await store.set(SESSION_B, { archived: true });
    expect(await store.prune([SESSION_B])).toBe(1);
    expect(await readIndexFile(filePath)).toEqual({
      [SESSION_B]: { archived: true, pinned: false, lastViewedAt: null }
    });
    expect(await store.prune([SESSION_B])).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale locks are taken over; sibling files stay byte-identical", async () => {
  const dir = makeProjectDir();
  try {
    const projectDir = join(dir, "proj");
    const sibling = join(projectDir, "2026-08-25T04-32-09-344Z_session.jsonl");
    await mkdir(projectDir, { recursive: true });
    writeFileSync(sibling, "session-bytes\n");
    const before = await readFile(sibling);

    const staleLockPath = join(projectDir, LOCK_NAME);
    writeFileSync(
      staleLockPath,
      JSON.stringify({ pid: 999_999_999, acquiredAt: Date.now() - 60_000 })
    );

    const store = new SessionMetadataStore(join(projectDir, "metadata.json"));
    await store.set(SESSION_A, { pinned: true });
    expect(existsSync(staleLockPath)).toBe(false);
    expect(await readFile(sibling)).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
