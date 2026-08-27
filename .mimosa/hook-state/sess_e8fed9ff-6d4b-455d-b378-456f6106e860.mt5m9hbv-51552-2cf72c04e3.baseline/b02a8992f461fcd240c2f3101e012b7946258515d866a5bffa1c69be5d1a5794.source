import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { RUNTIME_MANIFEST } from "../apps/desktop-host/src/runtime-manifest";
import { sha256File } from "./build-integrity";

const root = resolve(import.meta.dir, "..");
const target = resolve(root, "artifacts", RUNTIME_MANIFEST.fileName);
const staging = `${target}.download`;

mkdirSync(dirname(target), { recursive: true });
if (existsSync(target)) {
  const current = sha256File(target);
  if (current !== RUNTIME_MANIFEST.sha256) {
    throw new Error(`RUNTIME_EXISTING_HASH_MISMATCH: ${current}`);
  }
  console.log(JSON.stringify({ downloaded: false, file: RUNTIME_MANIFEST.fileName, sha256: current }));
  process.exit(0);
}

rmSync(staging, { force: true });
const response = await fetch(RUNTIME_MANIFEST.sourceUrl, { redirect: "follow" });
if (!response.ok) throw new Error(`RUNTIME_DOWNLOAD_FAILED: HTTP ${response.status}`);
writeFileSync(staging, new Uint8Array(await response.arrayBuffer()), { flag: "wx" });

const downloaded = sha256File(staging);
if (downloaded !== RUNTIME_MANIFEST.sha256) {
  rmSync(staging, { force: true });
  throw new Error(`RUNTIME_DOWNLOAD_HASH_MISMATCH: ${downloaded}`);
}
renameSync(staging, target);
console.log(JSON.stringify({ downloaded: true, file: RUNTIME_MANIFEST.fileName, sha256: downloaded }));
