import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { RUNTIME_MANIFEST } from "../apps/desktop-host/src/runtime-manifest";
import { sha256File } from "./build-integrity";

const root = resolve(import.meta.dir, "..");
const target = resolve(root, "artifacts", RUNTIME_MANIFEST.fileName);
const staging = `${target}.download`;

// The Tauri resource list and the compiled Host both expect the version-bound
// natives beside the runtime exe; cargo's build script fails `cargo check`
// without it. Same version gate as prepare-bundle.
const NATIVES_PACKAGE = resolve(root, "apps/desktop-host/node_modules/@oh-my-pi/pi-natives-win32-x64");

function stageNatives(): void {
  const nativesPackageJson = JSON.parse(readFileSync(join(NATIVES_PACKAGE, "package.json"), "utf8")) as {
    version: unknown;
    main: unknown;
  };
  if (nativesPackageJson.version !== RUNTIME_MANIFEST.ompVersion) {
    throw new Error(
      `NATIVES_VERSION_MISMATCH: ${String(nativesPackageJson.version)} != ${RUNTIME_MANIFEST.ompVersion}`
    );
  }
  copyFileSync(
    join(NATIVES_PACKAGE, String(nativesPackageJson.main)),
    resolve(root, "artifacts", String(nativesPackageJson.main))
  );
}

mkdirSync(dirname(target), { recursive: true });
if (existsSync(target)) {
  const current = sha256File(target);
  if (current !== RUNTIME_MANIFEST.sha256) {
    throw new Error(`RUNTIME_EXISTING_HASH_MISMATCH: ${current}`);
  }
  stageNatives();
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
stageNatives();
console.log(JSON.stringify({ downloaded: true, file: RUNTIME_MANIFEST.fileName, sha256: downloaded }));
