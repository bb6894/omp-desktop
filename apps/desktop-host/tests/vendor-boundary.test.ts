import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("keeps direct OMP package imports inside the adapter boundary", () => {
  const sourceDir = join(import.meta.dir, "..", "src");
  const directImports = readdirSync(sourceDir)
    .filter((file) => file.endsWith(".ts") && file !== "omp-vendor.ts")
    .filter((file) => /\bfrom\s+["']@oh-my-pi\//.test(readFileSync(join(sourceDir, file), "utf8")));
  expect(directImports).toEqual([]);
});
