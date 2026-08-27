import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSnapshotBytes,
  persistSnapshot,
  pruneSnapshotRing,
  resolveSnapshotPath,
  verifySnapshotIntegrity
} from "../src/harness-snapshot";

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function expectedSnapshotId(bytes: Uint8Array): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return `snapshot-${hash.slice(0, 24)}`;
}

test("persists and reloads byte-exact snapshot content with deterministic metadata", async () => {
  const projectDirectory = temporaryDirectory("omp-desktop-snapshot-persist-");
  const bytes = Buffer.from('{"memories":[1,2],"padding":"  exact bytes  "}\n', "utf8");

  const metadata = await persistSnapshot(
    projectDirectory,
    bytes,
    "before apply",
    "2026-08-23T00:00:00.000Z"
  );
  const loaded = await loadSnapshotBytes(projectDirectory, metadata.id);
  const expectedHash = createHash("sha256").update(bytes).digest("hex");

  expect(metadata).toEqual({
    id: expectedSnapshotId(bytes),
    createdAt: "2026-08-23T00:00:00.000Z",
    reason: "before apply",
    stateHash: expectedHash
  });
  expect(Buffer.from(loaded).equals(bytes)).toBe(true);
  expect(readFileSync(resolveSnapshotPath(projectDirectory, metadata.id)).equals(bytes)).toBe(true);
  expect(verifySnapshotIntegrity(metadata, loaded)).toBe(true);
  expect(verifySnapshotIntegrity(metadata, Buffer.from("different", "utf8"))).toBe(false);
});

test("prunes the oldest snapshot files while retaining the newest eight", async () => {
  const projectDirectory = temporaryDirectory("omp-desktop-snapshot-ring-");
  const snapshots = [];

  for (let index = 0; index < 10; index += 1) {
    snapshots.push(await persistSnapshot(
      projectDirectory,
      Buffer.from(`state-${index}`, "utf8"),
      `snapshot ${index}`,
      `2026-08-23T00:00:0${index}.000Z`
    ));
  }

  const retained = await pruneSnapshotRing(projectDirectory, snapshots);

  expect(retained).toEqual(snapshots.slice(-8));
  expect(existsSync(resolveSnapshotPath(projectDirectory, snapshots[0].id))).toBe(false);
  expect(existsSync(resolveSnapshotPath(projectDirectory, snapshots[1].id))).toBe(false);
  for (const snapshot of retained) {
    expect(existsSync(resolveSnapshotPath(projectDirectory, snapshot.id))).toBe(true);
  }
});

test("never prunes the last remaining snapshot", async () => {
  const projectDirectory = temporaryDirectory("omp-desktop-snapshot-last-");
  const snapshot = await persistSnapshot(
    projectDirectory,
    Buffer.from("only state", "utf8"),
    "only snapshot",
    "2026-08-23T00:00:00.000Z"
  );

  const retained = await pruneSnapshotRing(projectDirectory, [snapshot]);

  expect(retained).toEqual([snapshot]);
  expect(existsSync(resolveSnapshotPath(projectDirectory, snapshot.id))).toBe(true);
});
