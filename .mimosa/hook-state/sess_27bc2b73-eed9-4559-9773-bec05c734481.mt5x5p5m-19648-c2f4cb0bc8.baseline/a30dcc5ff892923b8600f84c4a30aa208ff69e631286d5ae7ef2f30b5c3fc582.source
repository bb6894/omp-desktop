import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RUNTIME_MANIFEST } from "../apps/desktop-host/src/runtime-manifest";
import {
  HOST_ARTIFACT_RELATIVE_PATH,
  HOST_MANIFEST_RELATIVE_PATH,
  parseHostBuildManifest,
  sha256File,
  verifyHostBuildManifest
} from "./build-integrity";

const root = resolve(import.meta.dir, "..");

function capture(name: string, command: string[]): string {
  const result = Bun.spawnSync({
    cmd: command,
    cwd: root,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) {
    throw new Error(`BUNDLE_TOOLCHAIN_PROBE_FAILED: ${name}`);
  }
  return result.stdout.toString().trim();
}

function run(name: string, command: string[]): void {
  process.stdout.write(`[bundle] ${name}\n`);
  const result = Bun.spawnSync({
    cmd: command,
    cwd: root,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit"
  });
  if (result.exitCode !== 0) throw new Error(`BUNDLE_PREPARE_FAILED: ${name}`);
}

const pinnedNode = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const pinnedBun = readFileSync(resolve(root, ".bun-version"), "utf8").trim();
const actualNode = capture("node", ["node", "--version"]);
const actualRust = capture("rustc", ["rustc", "--version"]);
if (pinnedNode !== "24.19.0" || actualNode !== `v${pinnedNode}`) {
  throw new Error(`BUNDLE_NODE_VERSION_MISMATCH: ${actualNode}`);
}
if (pinnedBun !== "1.4.0" || Bun.version !== pinnedBun) {
  throw new Error(`BUNDLE_BUN_VERSION_MISMATCH: ${Bun.version}`);
}
if (!actualRust.startsWith("rustc 1.98.0 ")) {
  throw new Error(`BUNDLE_RUST_VERSION_MISMATCH: ${actualRust}`);
}

run("rebuild Host", ["bun", "run", "tools/build-host.ts"]);

const manifest = parseHostBuildManifest(
  readFileSync(resolve(root, HOST_MANIFEST_RELATIVE_PATH), "utf8")
);
verifyHostBuildManifest(root, manifest);

const runtimePath = resolve(root, "artifacts", RUNTIME_MANIFEST.fileName);
const runtimeSha256 = sha256File(runtimePath);
if (runtimeSha256 !== RUNTIME_MANIFEST.sha256) {
  throw new Error(`RUNTIME_HASH_MISMATCH: ${runtimeSha256}`);
}

run("compiled Host fixture smoke", [
  "bun",
  "tools/smoke-host-fixture.ts",
  HOST_ARTIFACT_RELATIVE_PATH
]);

const evidence = {
  schemaVersion: 1,
  host: {
    file: HOST_ARTIFACT_RELATIVE_PATH,
    sourceSha256: manifest.sourceSha256,
    sha256: manifest.executableSha256
  },
  runtime: {
    file: `artifacts/${RUNTIME_MANIFEST.fileName}`,
    version: RUNTIME_MANIFEST.ompVersion,
    sourceUrl: RUNTIME_MANIFEST.sourceUrl,
    sha256: runtimeSha256
  },
  toolchain: {
    node: pinnedNode,
    bun: Bun.version,
    rustc: actualRust
  }
};
writeFileSync(
  resolve(root, "artifacts/bundle-evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(evidence));
