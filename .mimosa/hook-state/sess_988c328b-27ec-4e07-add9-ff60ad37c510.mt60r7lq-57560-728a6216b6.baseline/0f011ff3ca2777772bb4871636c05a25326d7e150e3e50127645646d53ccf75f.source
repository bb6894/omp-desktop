import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const HOST_ARTIFACT_RELATIVE_PATH = "artifacts/omp-desktop-host.exe";
export const HOST_MANIFEST_RELATIVE_PATH = "artifacts/omp-desktop-host.build.json";

export type HostBuildManifest = {
  schemaVersion: 1;
  target: "bun-windows-x64";
  bunVersion: string;
  sourceSha256: string;
  executableSha256: string;
};

function walkFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return walkFiles(child);
    return entry.isFile() ? [child] : [];
  });
}

function normalizedRelative(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

export function hostBuildInputs(root: string): string[] {
  const fixedFiles = [
    "apps/desktop-host/package.json",
    "apps/desktop-host/bun.lock",
    "tools/build-host.ts",
    "tools/build-integrity.ts"
  ].map((path) => resolve(root, path));
  return [...walkFiles(resolve(root, "apps/desktop-host/src")), ...fixedFiles]
    .sort((left, right) => {
      const leftRelative = normalizedRelative(root, left);
      const rightRelative = normalizedRelative(root, right);
      return leftRelative < rightRelative ? -1 : leftRelative > rightRelative ? 1 : 0;
    });
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function hostSourceSha256(root: string): string {
  const hash = createHash("sha256");
  for (const path of hostBuildInputs(root)) {
    const normalized = normalizedRelative(root, path);
    hash.update(normalized, "utf8");
    hash.update("\0", "utf8");
    hash.update(readFileSync(path));
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

export function parseHostBuildManifest(raw: string): HostBuildManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("HOST_BUILD_MANIFEST_INVALID");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("HOST_BUILD_MANIFEST_INVALID");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    "bunVersion",
    "executableSha256",
    "schemaVersion",
    "sourceSha256",
    "target"
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("HOST_BUILD_MANIFEST_INVALID");
  }
  if (
    record.schemaVersion !== 1 ||
    record.target !== "bun-windows-x64" ||
    typeof record.bunVersion !== "string" ||
    typeof record.sourceSha256 !== "string" ||
    typeof record.executableSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.sourceSha256) ||
    !/^[0-9a-f]{64}$/.test(record.executableSha256)
  ) {
    throw new Error("HOST_BUILD_MANIFEST_INVALID");
  }
  return record as HostBuildManifest;
}

export function verifyHostBuildManifest(root: string, manifest: HostBuildManifest): void {
  if (manifest.bunVersion !== "1.4.0") throw new Error("HOST_BUILD_BUN_VERSION_MISMATCH");
  if (manifest.sourceSha256 !== hostSourceSha256(root)) {
    throw new Error("HOST_BUILD_SOURCE_HASH_MISMATCH");
  }
  const artifact = resolve(root, HOST_ARTIFACT_RELATIVE_PATH);
  if (manifest.executableSha256 !== sha256File(artifact)) {
    throw new Error("HOST_BUILD_ARTIFACT_HASH_MISMATCH");
  }
}
