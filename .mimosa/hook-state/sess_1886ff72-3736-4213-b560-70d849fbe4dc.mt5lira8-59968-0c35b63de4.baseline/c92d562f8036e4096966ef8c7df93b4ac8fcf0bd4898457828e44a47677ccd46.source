import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOST_ARTIFACT_RELATIVE_PATH,
  HOST_MANIFEST_RELATIVE_PATH,
  hostSourceSha256,
  sha256File,
  type HostBuildManifest
} from "./build-integrity";

const root = resolve(import.meta.dir, "..");
const artifact = resolve(root, HOST_ARTIFACT_RELATIVE_PATH);
const manifestPath = resolve(root, HOST_MANIFEST_RELATIVE_PATH);

const legacyModulesPlugin: Bun.BunPlugin = {
  name: "omp-desktop:stage0-legacy-modules",
  setup(build) {
    build.onResolve({ filter: /^omp-legacy-pi-modules$/ }, () => ({
      path: "omp-legacy-pi-modules",
      namespace: "omp-desktop-stage0"
    }));
    build.onLoad({ filter: /.*/, namespace: "omp-desktop-stage0" }, () => ({
      contents: "export const BUNDLED_PI_MODULE_LOADERS = {};",
      loader: "js"
    }));
  }
};

if (Bun.version !== "1.4.0") {
  throw new Error(`HOST_BUILD_BUN_VERSION_MISMATCH: ${Bun.version}`);
}

mkdirSync(resolve(root, "artifacts"), { recursive: true });
const sourceSha256 = hostSourceSha256(root);
const result = await Bun.build({
  entrypoints: [resolve(root, "apps/desktop-host/src/index.ts")],
  compile: {
    target: "bun-windows-x64",
    outfile: artifact
  },
  plugins: [legacyModulesPlugin],
  sourcemap: "none"
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const manifest: HostBuildManifest = {
  schemaVersion: 1,
  target: "bun-windows-x64",
  bunVersion: Bun.version,
  sourceSha256,
  executableSha256: sha256File(artifact)
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest));
