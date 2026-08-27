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

const result = await Bun.build({
  entrypoints: ["apps/desktop-host/src/index.ts"],
  compile: {
    target: "bun-windows-x64",
    outfile: "artifacts/omp-desktop-host.exe"
  },
  plugins: [legacyModulesPlugin],
  sourcemap: "none"
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
