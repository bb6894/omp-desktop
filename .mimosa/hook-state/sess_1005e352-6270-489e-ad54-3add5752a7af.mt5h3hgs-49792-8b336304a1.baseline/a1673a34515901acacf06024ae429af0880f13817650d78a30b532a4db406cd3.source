import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { RUNTIME_MANIFEST, type RuntimeManifest } from "./runtime-manifest";

export type VerifiedRuntime = {
  path: string;
  sha256: string;
  manifest: RuntimeManifest;
};

export type RuntimeLaunchOptions = {
  runtimePath: string;
  cwd: string;
  sessionDir: string;
  env?: Record<string, string | undefined>;
  args?: readonly string[];
};

export type RuntimeProcess = Bun.Subprocess;

export async function hashRuntime(runtimePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(runtimePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyRuntime(runtimePath: string, manifest = RUNTIME_MANIFEST): Promise<VerifiedRuntime> {
  const path = resolve(runtimePath);
  if (basename(path).toLowerCase() !== manifest.fileName.toLowerCase()) {
    throw new Error("RUNTIME_FILENAME_MISMATCH");
  }
  try {
    await access(path);
  } catch {
    throw new Error("RUNTIME_NOT_FOUND");
  }
  const sha256 = await hashRuntime(path);
  if (sha256 !== manifest.sha256) {
    throw new Error("RUNTIME_HASH_MISMATCH");
  }
  return { path, sha256, manifest };
}

export async function spawnVerifiedRuntime(options: RuntimeLaunchOptions): Promise<{
  runtime: VerifiedRuntime;
  process: RuntimeProcess;
}> {
  const runtime = await verifyRuntime(options.runtimePath);
  const args = [
    "--mode",
    "rpc",
    "--cwd",
    resolve(options.cwd),
    "--session-dir",
    resolve(options.sessionDir),
    ...(options.args ?? [])
  ];
  const env: Record<string, string> = { ...Bun.env };
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const child = Bun.spawn([runtime.path, ...args], {
    cwd: resolve(options.cwd),
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  return { runtime, process: child };
}

export function resolveBundledRuntime(resourcesDir: string): string {
  return join(resolve(resourcesDir), RUNTIME_MANIFEST.fileName);
}
