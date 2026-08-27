import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hostSourceSha256,
  parseHostBuildManifest,
  sha256File,
  verifyHostBuildManifest,
  type HostBuildManifest
} from "../../../tools/build-integrity";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omp-host-integrity-"));
  mkdirSync(join(root, "apps/desktop-host/src"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
  mkdirSync(join(root, "artifacts"), { recursive: true });
  writeFileSync(join(root, "apps/desktop-host/src/index.ts"), "export const value = 1;\n");
  writeFileSync(join(root, "apps/desktop-host/package.json"), "{}\n");
  writeFileSync(join(root, "apps/desktop-host/bun.lock"), "lock\n");
  writeFileSync(join(root, "tools/build-host.ts"), "build\n");
  writeFileSync(join(root, "tools/build-integrity.ts"), "integrity\n");
  writeFileSync(join(root, "artifacts/omp-desktop-host.exe"), "host-binary");
  return root;
}

test("hashes Host build inputs deterministically and detects source changes", () => {
  const root = fixtureRoot();
  const first = hostSourceSha256(root);
  expect(hostSourceSha256(root)).toBe(first);
  writeFileSync(join(root, "apps/desktop-host/src/index.ts"), "export const value = 2;\n");
  expect(hostSourceSha256(root)).not.toBe(first);
});

test("rejects stale Host source and artifact manifests", () => {
  const root = fixtureRoot();
  const manifest: HostBuildManifest = {
    schemaVersion: 1,
    target: "bun-windows-x64",
    bunVersion: "1.4.0",
    sourceSha256: hostSourceSha256(root),
    executableSha256: sha256File(join(root, "artifacts/omp-desktop-host.exe"))
  };
  expect(() => verifyHostBuildManifest(root, manifest)).not.toThrow();

  writeFileSync(join(root, "apps/desktop-host/src/index.ts"), "changed\n");
  expect(() => verifyHostBuildManifest(root, manifest)).toThrow("HOST_BUILD_SOURCE_HASH_MISMATCH");

  manifest.sourceSha256 = hostSourceSha256(root);
  writeFileSync(join(root, "artifacts/omp-desktop-host.exe"), "stale-binary");
  expect(() => verifyHostBuildManifest(root, manifest)).toThrow("HOST_BUILD_ARTIFACT_HASH_MISMATCH");
});

test("rejects malformed or extra-field manifests", () => {
  expect(() => parseHostBuildManifest("{"))
    .toThrow("HOST_BUILD_MANIFEST_INVALID");
  expect(() => parseHostBuildManifest("[]")).toThrow("HOST_BUILD_MANIFEST_INVALID");
  expect(() => parseHostBuildManifest(JSON.stringify({
    schemaVersion: 1,
    target: "bun-windows-x64",
    bunVersion: "1.4.0",
    sourceSha256: "0".repeat(64),
    executableSha256: "1".repeat(64),
    extra: true
  }))).toThrow("HOST_BUILD_MANIFEST_INVALID");
});
