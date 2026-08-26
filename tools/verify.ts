import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Gate = {
  name: string;
  command: string[];
};

const root = resolve(import.meta.dir, "..");
const testsRoot = resolve(root, "apps/desktop-host/tests");

// These suites run in their own dedicated gates below; excluding them here
// keeps the Host gate from double-running them or coupling to gate order.
const specializedTests = new Set([
  "tauri-command-surface.test.ts",
  "vendor-boundary.test.ts"
]);

function hostTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return hostTestFiles(path);
      if (!entry.isFile() || !entry.name.endsWith(".test.ts")) return [];
      const testPath = relative(testsRoot, path).replaceAll("\\", "/");
      return specializedTests.has(testPath) ? [] : [path];
    })
    .sort();
}

const hostTests = hostTestFiles(testsRoot);
if (hostTests.length === 0) throw new Error("VERIFY_HOST_TESTS_MISSING");

const gates: Gate[] = [
  {
    name: "Host tests, including source-session immutability",
    command: ["bun", "test", ...hostTests]
  },
  { name: "Host build", command: ["bun", "run", "tools/build-host.ts"] },
  {
    name: "Compiled Host fixture smoke",
    command: ["bun", "tools/smoke-host-fixture.ts", "artifacts/omp-desktop-host.exe"]
  },
  { name: "Renderer typecheck", command: ["npm", "run", "next:typecheck"] },
  { name: "Renderer tests", command: ["npm", "run", "next:test"] },
  { name: "Renderer production build", command: ["npm", "run", "next:build"] },
  {
    name: "Rust formatting",
    command: ["cargo", "fmt", "--manifest-path", "src-tauri/Cargo.toml", "--all", "--", "--check"]
  },
  {
    name: "Rust check",
    command: ["cargo", "check", "--manifest-path", "src-tauri/Cargo.toml", "--locked"]
  },
  {
    name: "Rust tests",
    command: ["cargo", "test", "--manifest-path", "src-tauri/Cargo.toml", "--locked"]
  },
  {
    name: "Architecture boundaries",
    command: [
      "bun",
      "test",
      "apps/desktop-host/tests/vendor-boundary.test.ts",
      "apps/desktop-host/tests/tauri-command-surface.test.ts"
    ]
  }
];

for (const gate of gates) {
  process.stdout.write(`\n[verify] ${gate.name}\n`);
  const result = Bun.spawnSync({
    cmd: gate.command,
    cwd: root,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit"
  });
  if (result.exitCode !== 0) {
    process.stderr.write(`[verify] FAILED: ${gate.name} (exit ${result.exitCode})\n`);
    process.exit(result.exitCode || 1);
  }
}

process.stdout.write(`\n[verify] PASS: ${gates.length} gates\n`);
