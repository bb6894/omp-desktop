import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const livePath = resolve(import.meta.dir, "../../../src/live.js");
const characterizationPath = resolve(import.meta.dir, "../../../docs/agents/renderer-bridge-characterization.md");

const expectedBridgeKeys = [
  "isConnected",
  "send",
  "abort",
  "followUp",
  "steer",
  "setModel",
  "cycleModel",
  "cycleThinking",
  "compact",
  "newSession",
  "exportHtml",
  "refreshModels",
  "inspectHarness",
  "previewHarnessMemory",
  "applyHarnessMemory",
  "rollbackHarness",
  "getLoginProviders",
  "login",
  "answerAsk",
  "addAssistantMessage",
  "openSession",
  "activateSession",
  "closeSession",
  "pickFolder",
  "onUpdate",
  "getState"
] as const;

function bridgeLiteral(source: string): string {
  const start = source.indexOf("window.OMP_BRIDGE = {");
  if (start < 0) throw new Error("OMP_BRIDGE literal missing");
  const end = source.indexOf("\n  };", start);
  if (end < 0) throw new Error("OMP_BRIDGE literal terminator missing");
  return source.slice(start, end);
}

function bridgeKeys(source: string): string[] {
  const literal = bridgeLiteral(source);
  return [...literal.matchAll(/^\s{4}(?:(?:get|async)\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)].map((match) => match[1]);
}

test("documents and freezes every public OMP_BRIDGE key", () => {
  const source = readFileSync(livePath, "utf8");
  const characterization = readFileSync(characterizationPath, "utf8");
  expect(bridgeKeys(source)).toEqual([...expectedBridgeKeys]);
  for (const key of expectedBridgeKeys) {
    expect(characterization, `characterization missing ${key}`).toContain(`| \`${key}`);
  }
});

test("the bridge source keeps dedicated Harness methods separate from send_command", () => {
  const source = readFileSync(livePath, "utf8");
  const literal = bridgeLiteral(source);
  expect(literal).toContain("inspectHarnessForSession(window.__TAURI__");
  expect(literal).toContain("previewHarnessMemoryForSession(window.__TAURI__");
  expect(literal).toContain("applyHarnessMemoryForSession(window.__TAURI__");
  expect(literal).toContain("rollbackHarnessForSession(window.__TAURI__");
  expect(literal).not.toContain('type: "harness.inspect"');
  expect(literal).not.toContain('type: "harness.preview"');
});
