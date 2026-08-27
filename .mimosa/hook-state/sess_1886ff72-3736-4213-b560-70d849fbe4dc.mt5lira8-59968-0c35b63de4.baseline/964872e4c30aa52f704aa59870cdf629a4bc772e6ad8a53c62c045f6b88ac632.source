import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hashRuntime, resolveBundledRuntime, verifyRuntime } from "../src/runtime";
import { RUNTIME_MANIFEST } from "../src/runtime-manifest";

test("refuses missing, misnamed, and hash-mismatched OMP runtime files", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-runtime-test-"));
  const correctName = join(root, RUNTIME_MANIFEST.fileName);
  writeFileSync(correctName, "not the official runtime");
  await expect(verifyRuntime(join(root, "other.exe"))).rejects.toThrow("RUNTIME_FILENAME_MISMATCH");
  await expect(verifyRuntime(join(root, RUNTIME_MANIFEST.fileName))).rejects.toThrow("RUNTIME_HASH_MISMATCH");
  await expect(verifyRuntime(join(root, "missing", RUNTIME_MANIFEST.fileName))).rejects.toThrow("RUNTIME_NOT_FOUND");
});

test("hashes a runtime file and resolves the exact bundled name", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-runtime-hash-test-"));
  const runtimePath = join(root, RUNTIME_MANIFEST.fileName);
  writeFileSync(runtimePath, "abc");
  expect(await hashRuntime(runtimePath)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(resolveBundledRuntime(root)).toBe(runtimePath);
});
