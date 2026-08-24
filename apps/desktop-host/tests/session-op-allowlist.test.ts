import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const servicePath = resolve(import.meta.dir, "../src/session-service.ts");
const livePath = resolve(import.meta.dir, "../../../src/live.js");
const characterizationPath = resolve(import.meta.dir, "../../../docs/agents/renderer-bridge-characterization.md");

const topLevelOperations = [
  "session.list",
  "session.messages",
  "session.fork",
  "harness.inspect",
  "harness.preview",
  "harness.apply",
  "harness.rollback",
  "agent.start",
  "agent.stop",
  "interaction.respond",
  "agent.command"
] as const;

function requestKeyNames(source: string): string[] {
  const block = source.match(/const REQUEST_KEYS = \{([\s\S]*?)\n\} as const;/)?.[1];
  if (!block) throw new Error("REQUEST_KEYS block missing");
  return [...block.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
}

test("top-level SessionService operations are closed and documented", () => {
  const service = readFileSync(servicePath, "utf8");
  const docs = readFileSync(characterizationPath, "utf8");
  expect(requestKeyNames(service)).toEqual([...topLevelOperations]);
  for (const operation of topLevelOperations) {
    expect(docs, `characterization missing ${operation}`).toContain(`| \`${operation}\``);
  }
});

test("legacy direct request helpers use only declared top-level operations", () => {
  const rustPath = resolve(import.meta.dir, "../../../src-tauri/src/lib.rs");
  const rust = readFileSync(rustPath, "utf8");
  const live = readFileSync(livePath, "utf8");
  const service = readFileSync(servicePath, "utf8");
  const declared = new Set(requestKeyNames(service));
  const expectedDirectRust = [
    "session.list",
    "session.messages",
    "session.fork",
    "harness.inspect",
    "harness.preview",
    "harness.apply",
    "harness.rollback"
  ];
  const productionRust = rust.slice(0, rust.lastIndexOf("#[cfg(test)]"));
  const directRust = [...productionRust.matchAll(/\"([a-z]+\.[a-z]+)\"/g)]
    .map((match) => match[1])
    .filter((operation, index, operations) => operations.indexOf(operation) === index);
  expect(directRust).toEqual(expectedDirectRust);
  const agentCommands = [...live.matchAll(/_send\(\{ type: "([a-z_]+)"/g)].map((match) => match[1]);
  for (const operation of directRust) {
    expect(declared.has(operation), operation).toBe(true);
  }
  expect(agentCommands.length).toBeGreaterThan(0);
  expect(declared.has("agent.command")).toBe(true);
  expect(directRust).not.toContain("agent.command");
});
