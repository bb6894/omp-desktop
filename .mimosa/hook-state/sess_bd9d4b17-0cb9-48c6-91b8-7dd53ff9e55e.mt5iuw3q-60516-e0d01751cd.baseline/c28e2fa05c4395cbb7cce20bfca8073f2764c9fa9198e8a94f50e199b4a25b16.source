import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DIRECT_OMP_IMPORT = /(?:\bfrom\s+|\bimport\s*\(|\brequire\s*\()\s*["']@oh-my-pi\//;

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function directImporters(root: string): string[] {
  return listTypeScriptFiles(root)
    .filter((path) => DIRECT_OMP_IMPORT.test(readFileSync(path, "utf8")))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .sort();
}

test("keeps direct OMP package imports inside the production vendor boundary", () => {
  const sourceDir = join(import.meta.dir, "..", "src");
  expect(directImporters(sourceDir)).toEqual(["omp-vendor.ts"]);
});

test("allows only reviewed test files to use OMP as an independent oracle", () => {
  const testsDir = import.meta.dir;
  expect(directImporters(testsDir)).toEqual([
    "rpc-bridge.test.ts",
    "session-service.test.ts"
  ]);
});
