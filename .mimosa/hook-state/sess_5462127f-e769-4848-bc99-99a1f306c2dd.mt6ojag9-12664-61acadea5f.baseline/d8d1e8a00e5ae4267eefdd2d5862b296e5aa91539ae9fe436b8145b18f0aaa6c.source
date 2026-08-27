import { createHash } from "node:crypto";
import { readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessSnapshot } from "./harness-contracts";
import { ensureHarnessDirectories, writeFileAtomic } from "./harness-atomic-file";
export const MAX_SNAPSHOTS_RETAINED = 8 as const;
export async function persistSnapshot(projectDirectory: string, bytes: Uint8Array, reason: string, createdAt: string): Promise<HarnessSnapshot> {
  await ensureHarnessDirectories(projectDirectory);
  const stateHash = hashBytes(bytes);
  const metadata: HarnessSnapshot = { id: `snapshot-${stateHash.slice(0, 24)}`, createdAt, reason, stateHash };
  await writeFileAtomic(resolveSnapshotPath(projectDirectory, metadata.id), bytes);
  return metadata;
}
export async function loadSnapshotBytes(projectDirectory: string, snapshotId: string): Promise<Uint8Array> {
  return readFile(resolveSnapshotPath(projectDirectory, snapshotId));
}
export async function quarantineSnapshot(projectDirectory: string, snapshotId: string): Promise<void> {
  try {
    const path = resolveSnapshotPath(projectDirectory, snapshotId);
    await rename(path, `${path}.corrupt`);
  } catch (error: unknown) {
    if (!isMissingFile(error)) throw error;
  }
}
export function verifySnapshotIntegrity(snapshot: HarnessSnapshot, bytes: Uint8Array): boolean {
  return hashBytes(bytes) === snapshot.stateHash;
}
export function retainedSnapshotRing(snapshots: readonly HarnessSnapshot[]): readonly HarnessSnapshot[] {
  return snapshots.length <= MAX_SNAPSHOTS_RETAINED ? snapshots : snapshots.slice(-MAX_SNAPSHOTS_RETAINED);
}
export async function pruneSnapshotRing(projectDirectory: string, snapshots: readonly HarnessSnapshot[]): Promise<readonly HarnessSnapshot[]> {
  if (snapshots.length <= MAX_SNAPSHOTS_RETAINED) return snapshots;
  const retained = retainedSnapshotRing(snapshots);
  const removed = snapshots.slice(0, snapshots.length - retained.length);
  await Promise.all(removed.map((snapshot) => unlink(resolveSnapshotPath(projectDirectory, snapshot.id))));
  return retained;
}
export function resolveSnapshotPath(projectDirectory: string, snapshotId: string): string {
  if (!/^snapshot-[a-f0-9]{24}$/.test(snapshotId)) throw new Error("HARNESS_SNAPSHOT_ID_INVALID");
  return join(projectDirectory, "snapshots", `${snapshotId}.json`);
}
function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
