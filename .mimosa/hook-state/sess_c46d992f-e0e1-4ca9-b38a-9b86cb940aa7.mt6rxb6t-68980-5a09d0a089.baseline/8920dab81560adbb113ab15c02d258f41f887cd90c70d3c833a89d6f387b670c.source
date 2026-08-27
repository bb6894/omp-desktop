import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "proposal-contracts.ts",
  "proposal-digest.ts",
  "proposal-policy.ts",
  "memory-proposal-preview.ts"
] as const;

test("proposal modules stay pure and outside protected layers", () => {
  for (const file of files) {
    const source = readFileSync(resolve(import.meta.dir, "../src", file), "utf8");
    expect(source, file).not.toMatch(/from ["'].*(?:harness-store|session-service|host-server|live\.js|src-tauri)/i);
    expect(source, file).not.toMatch(/from ["']node:fs["']|writeFile|appendFile|rename|mkdir|unlink|rm\(/i);
    expect(source, file).not.toMatch(/from ["'].*(?:tauri|runtime)["']|\b(?:spawn|daemon|worker)\s*\(/i);
  }
});
test("Stage 3A adds no Host request or Tauri command", () => {
  const host = readFileSync(resolve(import.meta.dir, "../src/contracts.ts"), "utf8");
  const rust = readFileSync(resolve(import.meta.dir, "../../../src-tauri/src/lib.rs"), "utf8");
  expect(host).not.toContain("memory.add");
  expect(host).not.toContain("memory.replace");
  expect(rust).not.toContain("proposal_preview");
});
