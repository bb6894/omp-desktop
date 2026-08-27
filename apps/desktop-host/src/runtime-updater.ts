/**
 * Runtime update check — compares local binary against GitHub releases.
 * Called from the Host (Node side) so the renderer never needs network access.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RUNTIME_MANIFEST } from "./runtime-manifest";

export type UpdateCheckResult =
  | { status: "current"; version: string; sha256: string }
  | { status: "available"; version: string; latestVersion: string; latestSha256: string; downloadUrl: string }
  | { status: "error"; error: string };

/** Check for updates by reading the local runtime SHA-256 and querying GitHub releases. */
export async function checkRuntimeUpdate(): Promise<UpdateCheckResult> {
  const localPath = resolve("artifacts", RUNTIME_MANIFEST.fileName);
  if (!existsSync(localPath)) {
    return {
      status: "error",
      error: "RUNTIME_NOT_FOUND"
    };
  }
  const localSha256 = await computeSha256(localPath);
  try {
    const response = await fetch(
      "https://api.github.com/repos/bb6894/omp-desktop/releases?per_page=10",
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (!response.ok) {
      return {
        status: "error",
        error: `HTTP ${response.status}`
      };
    }
    const releases: unknown[] = await response.json();
    const runtimeRelease = releases.find(
      (r: unknown) =>
        typeof r === "object" &&
        r !== null &&
        (r as { tag_name?: unknown }).tag_name !== undefined &&
        String((r as { tag_name?: string }).tag_name ?? "").startsWith("runtime-v")
    ) as { tag_name: string; assets: { name: string; browser_download_url: string; size: number }[] } | null;
    if (!runtimeRelease) {
      return {
        status: "current",
        version: RUNTIME_MANIFEST.ompVersion,
        sha256: localSha256
      };
    }
    const latestVersion = runtimeRelease.tag_name.replace(/^runtime-v/, "");
    const asset = runtimeRelease.assets.find((a) => a.name === RUNTIME_MANIFEST.fileName);
    if (!asset) {
      return {
        status: "current",
        version: RUNTIME_MANIFEST.ompVersion,
        sha256: localSha256
      };
    }
    if (latestVersion === RUNTIME_MANIFEST.ompVersion && localSha256 === RUNTIME_MANIFEST.sha256) {
      return {
        status: "current",
        version: RUNTIME_MANIFEST.ompVersion,
        sha256: localSha256
      };
    }
    return {
      status: "available",
      version: RUNTIME_MANIFEST.ompVersion,
      latestVersion,
      latestSha256: asset.name,
      downloadUrl: asset.browser_download_url
    };
  } catch (err) {
    return {
      status: "error",
      error: String(err)
    };
  }
}

async function computeSha256(filePath: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
