import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureHarnessDirectories,
  sweepOrphanTempFiles,
  writeFileAtomic
} from "../src/harness-atomic-file";

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function temporaryFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".tmp"));
}

test("replaces an existing file and leaves no temporary file", async () => {
  const root = temporaryDirectory("omp-desktop-atomic-replace-");
  const target = join(root, "state.json");
  writeFileSync(target, "old state", "utf8");

  await writeFileAtomic(target, Buffer.from("new state", "utf8"));

  expect(readFileSync(target, "utf8")).toBe("new state");
  expect(temporaryFiles(root)).toEqual([]);
});

test("cleans the temporary file when the target cannot be replaced", async () => {
  const root = temporaryDirectory("omp-desktop-atomic-failure-");
  const target = join(root, "state.json");
  mkdirSync(target);
  const sentinel = join(target, "sentinel.txt");
  writeFileSync(sentinel, "untouched", "utf8");

  await expect(writeFileAtomic(target, Buffer.from("new state", "utf8"))).rejects.toThrow();

  expect(readFileSync(sentinel, "utf8")).toBe("untouched");
  expect(temporaryFiles(root)).toEqual([]);
});

test("creates harness directories lazily and does not create them by construction", async () => {
  const root = temporaryDirectory("omp-desktop-atomic-directories-");
  const projectDirectory = join(root, "project");

  expect(existsSync(projectDirectory)).toBe(false);
  await ensureHarnessDirectories(projectDirectory);

  expect(existsSync(projectDirectory)).toBe(true);
  expect(existsSync(join(projectDirectory, "snapshots"))).toBe(true);
});

test("sweeps orphan temp files without touching other files", async () => {
  const root = temporaryDirectory("omp-desktop-atomic-sweep-");
  const stale = join(root, "state.123-1.tmp");
  const other = join(root, "keep.txt");
  writeFileSync(stale, "stale", "utf8");
  writeFileSync(other, "keep", "utf8");

  await sweepOrphanTempFiles(root);

  expect(existsSync(stale)).toBe(false);
  expect(readFileSync(other, "utf8")).toBe("keep");
});
