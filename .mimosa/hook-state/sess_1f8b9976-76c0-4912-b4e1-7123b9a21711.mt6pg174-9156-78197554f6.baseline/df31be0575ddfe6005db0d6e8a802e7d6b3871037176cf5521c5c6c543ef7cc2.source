import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientPath = resolve(import.meta.dir, "../../../src/app/harness-client.js");
const livePath = resolve(import.meta.dir, "../../../src/live.js");

test("invokes only the dedicated read-only Tauri harness command", async () => {
  expect(existsSync(clientPath)).toBe(true);
  if (!existsSync(clientPath)) return;

  const browserWindow: Record<string, unknown> = {};
  const source = readFileSync(clientPath, "utf8");
  new Function("window", source)(browserWindow);
  const inspectHarnessForSession = browserWindow.inspectHarnessForSession;
  expect(typeof inspectHarnessForSession).toBe("function");
  if (typeof inspectHarnessForSession !== "function") return;

  const calls: unknown[] = [];
  const tauri = {
    core: {
      invoke: async (command: string, payload: unknown) => {
        calls.push([command, payload]);
        return { readOnly: true };
      }
    }
  };

  await expect(inspectHarnessForSession(tauri, "default")).resolves.toEqual({ readOnly: true });
  expect(calls).toEqual([["inspect_harness", { sessionId: "default" }]]);
});

test("rejects harness inspection when no desktop session is connected", async () => {
  const browserWindow: Record<string, unknown> = {};
  new Function("window", readFileSync(clientPath, "utf8"))(browserWindow);
  const inspectHarnessForSession = browserWindow.inspectHarnessForSession;
  expect(typeof inspectHarnessForSession).toBe("function");
  if (typeof inspectHarnessForSession !== "function") return;

  await expect(inspectHarnessForSession(undefined, null)).rejects.toThrow("HARNESS_NOT_CONNECTED");
});

test("exposes harness inspection through the live bridge without using agent commands", async () => {
  const calls: unknown[] = [];
  const browserWindow: Record<string, unknown> = {
    timeNow: () => "00:00",
    inspectHarnessForSession: async (...args: unknown[]) => {
      calls.push(args);
      return { readOnly: true };
    }
  };
  const quietConsole = { log: () => undefined, warn: () => undefined, error: () => undefined };
  new Function("window", "console", "setTimeout", "clearTimeout", readFileSync(livePath, "utf8"))(
    browserWindow,
    quietConsole,
    setTimeout,
    clearTimeout
  );

  const bridge = browserWindow.OMP_BRIDGE;
  expect(typeof bridge).toBe("object");
  if (typeof bridge !== "object" || bridge === null) return;
  const inspectHarness = Reflect.get(bridge, "inspectHarness");
  expect(typeof inspectHarness).toBe("function");
  if (typeof inspectHarness !== "function") return;

  await expect(inspectHarness()).resolves.toEqual({ readOnly: true });
  expect(calls).toEqual([[undefined, null]]);
});

test("rejects a harness inspection explicitly bound to a stale renderer session", async () => {
  const calls: unknown[] = [];
  const browserWindow: Record<string, unknown> = {
    timeNow: () => "00:00",
    inspectHarnessForSession: async (...args: unknown[]) => {
      calls.push(args);
      return { readOnly: true };
    }
  };
  const quietConsole = { log: () => undefined, warn: () => undefined, error: () => undefined };
  new Function("window", "console", "setTimeout", "clearTimeout", readFileSync(livePath, "utf8"))(
    browserWindow,
    quietConsole,
    setTimeout,
    clearTimeout
  );

  const bridge = browserWindow.OMP_BRIDGE;
  expect(typeof bridge).toBe("object");
  if (typeof bridge !== "object" || bridge === null) return;
  const inspectHarness = Reflect.get(bridge, "inspectHarness");
  expect(typeof inspectHarness).toBe("function");
  if (typeof inspectHarness !== "function") return;

  await expect(inspectHarness("stale-session")).rejects.toThrow("HARNESS_SESSION_CHANGED");
  expect(calls).toEqual([]);
});

type ClientModule = Record<string, unknown>;

function loadClient(): ClientModule {
  const browserWindow: Record<string, unknown> = {};
  new Function("window", readFileSync(clientPath, "utf8"))(browserWindow);
  return browserWindow;
}

function recordingTauri(): { tauri: unknown; calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  return {
    tauri: {
      core: {
        invoke: async (command: string, payload: unknown) => {
          calls.push([command, payload]);
          return { ok: true };
        }
      }
    },
    calls
  };
}

const FORBIDDEN_CONTEXT_FIELDS = [
  ["projectId", "0".repeat(32)],
  ["cwd", "C:\\Users\\leaky\\path"],
  ["scope", "project"],
  ["compatibility", { runtimeVersion: "17.4.1", hostProtocol: 1 }],
  ["createdAt", "2026-08-24T00:00:00.000Z"],
  ["evidence", []],
  ["digest", { sha256: "ab" }],
  ["snapshotPath", "C:\\snap"]
] as const;

test("preview invokes only preview_harness_memory with the minimal add/replace payloads", async () => {
  const client = loadClient();
  const preview = client.previewHarnessMemoryForSession;
  expect(typeof preview).toBe("function");

  const first = recordingTauri();
  await expect(preview(first.tauri, "default", { operation: "memory.add", title: "Rule", content: "Body." })).resolves.toEqual({ ok: true });
  expect(first.calls).toEqual([[
    "preview_harness_memory",
    { sessionId: "default", operation: "memory.add", title: "Rule", content: "Body." }
  ]]);

  const second = recordingTauri();
  await expect(preview(second.tauri, "default", { operation: "memory.replace", title: "Rule", content: "Body.", targetId: "memory-existing" })).resolves.toEqual({ ok: true });
  expect(second.calls).toEqual([[
    "preview_harness_memory",
    { sessionId: "default", operation: "memory.replace", title: "Rule", content: "Body.", targetId: "memory-existing" }
  ]]);
});

test("preview rejects junk payloads and any renderer context field without invoking", async () => {
  const client = loadClient();
  const preview = client.previewHarnessMemoryForSession as (tauri: unknown, sessionId: string, payload: unknown) => Promise<unknown>;
  const valid = { operation: "memory.add" as const, title: "Rule", content: "Body." };

  const invalidPayloads: unknown[] = [
    null,
    "add",
    {},
    { ...valid, operation: "memory.delete" },
    { ...valid, targetId: "memory-extra" },
    { operation: "memory.replace", title: "Rule", content: "Body." },
    { ...valid, title: "   \t " },
    { ...valid, content: null }
  ];
  for (const [field, value] of FORBIDDEN_CONTEXT_FIELDS) {
    invalidPayloads.push({ ...valid, [field]: value });
    invalidPayloads.push({ operation: "memory.replace", title: "Rule", content: "Body.", targetId: "memory-x", [field]: value });
  }

  for (const [index, payload] of invalidPayloads.entries()) {
    const session = recordingTauri();
    await expect(preview(session.tauri, "default", payload), `payload index ${index}`).rejects.toThrow("HARNESS_INVALID_REQUEST");
    expect(session.calls, `payload index ${index}`).toEqual([]);
  }
});

test("apply sends the exact preview plus approval fields to apply_harness_memory", async () => {
  const client = loadClient();
  const apply = client.applyHarnessMemoryForSession;
  expect(typeof apply).toBe("function");
  const preview = { operation: "memory.add", digest: { sha256: "ab" } };

  const session = recordingTauri();
  await expect(apply(session.tauri, "default", preview, { approvedBy: "human-reviewer", reason: "Approved after review" })).resolves.toEqual({ ok: true });
  expect(session.calls).toEqual([[
    "apply_harness_memory",
    { sessionId: "default", preview, approvedBy: "human-reviewer", reason: "Approved after review" }
  ]]);

  const invalidApprovals: unknown[] = [
    null,
    "yes",
    { approvedBy: "human-reviewer" },
    { approvedBy: "", reason: "r" },
    { approvedBy: "u", reason: "   " },
    { approvedBy: "u", reason: "r", delegatedBy: "model" }
  ];
  for (const [index, approval] of invalidApprovals.entries()) {
    const rejected = recordingTauri();
    await expect(apply(rejected.tauri, "default", preview, approval), `approval index ${index}`).rejects.toThrow("HARNESS_INVALID_REQUEST");
    expect(rejected.calls, `approval index ${index}`).toEqual([]);
  }
});

test("rollback sends only the reason to rollback_harness", async () => {
  const client = loadClient();
  const rollback = client.rollbackHarnessForSession;
  expect(typeof rollback).toBe("function");

  const session = recordingTauri();
  await expect(rollback(session.tauri, "default", "user requested revert")).resolves.toEqual({ ok: true });
  expect(session.calls).toEqual([["rollback_harness", { sessionId: "default", reason: "user requested revert" }]]);

  for (const reason of [null, "", "   ", 7]) {
    const rejected = recordingTauri();
    await expect(rollback(rejected.tauri, "default", reason as unknown as string)).rejects.toThrow("HARNESS_INVALID_REQUEST");
    expect(rejected.calls).toEqual([]);
  }
});

test("every mutation method refuses to run while disconnected or without a session", async () => {
  const client = loadClient();
  const preview = client.previewHarnessMemoryForSession as (tauri: unknown, sessionId: string | null, payload: unknown) => Promise<unknown>;
  const apply = client.applyHarnessMemoryForSession as (tauri: unknown, sessionId: string | null, ...rest: unknown[]) => Promise<unknown>;
  const rollback = client.rollbackHarnessForSession as (tauri: unknown, sessionId: string | null, reason: string) => Promise<unknown>;
  const payload = { operation: "memory.add", title: "Rule", content: "Body." };
  const approval = { approvedBy: "u", reason: "r" };

  for (const [index, attempt] of [
    () => preview(undefined, "default", payload),
    () => apply(undefined, "default", {}, approval),
    () => rollback(undefined, "default", "revert"),
    () => preview(recordingTauri().tauri, null, payload),
    () => apply(recordingTauri().tauri, null, {}, approval),
    () => rollback(recordingTauri().tauri, null, "revert")
  ].entries()) {
    await expect(attempt(), `attempt index ${index}`).rejects.toThrow(/HARNESS_NOT_CONNECTED|HARNESS_SESSION_REQUIRED/);
  }
});

test("exposes the three mutation methods through the live bridge with stale-session guards", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const browserWindow: Record<string, unknown> = {
    timeNow: () => "00:00",
    inspectHarnessForSession: async () => ({ readOnly: true }),
    previewHarnessMemoryForSession: async (...args: unknown[]) => { calls.push({ name: "preview", args }); return { status: "previewed" }; },
    applyHarnessMemoryForSession: async (...args: unknown[]) => { calls.push({ name: "apply", args }); return { status: "applied" }; },
    rollbackHarnessForSession: async (...args: unknown[]) => { calls.push({ name: "rollback", args }); return { status: "rolled-back" }; }
  };
  const quietConsole = { log: () => undefined, warn: () => undefined, error: () => undefined };
  new Function("window", "console", "setTimeout", "clearTimeout", readFileSync(livePath, "utf8"))(
    browserWindow,
    quietConsole,
    setTimeout,
    clearTimeout
  );

  const bridge = browserWindow.OMP_BRIDGE as Record<string, unknown>;
  for (const name of ["previewHarnessMemory", "applyHarnessMemory", "rollbackHarness"]) {
    expect(typeof bridge[name], name).toBe("function");
  }

  const payload = { operation: "memory.add", title: "Rule", content: "Body." };
  const approval = { approvedBy: "u", reason: "r" };
  await expect((bridge.previewHarnessMemory as (...a: unknown[]) => Promise<unknown>)(payload)).resolves.toEqual({ status: "previewed" });
  await expect((bridge.applyHarnessMemory as (...a: unknown[]) => Promise<unknown>)({}, approval)).resolves.toEqual({ status: "applied" });
  await expect((bridge.rollbackHarness as (...a: unknown[]) => Promise<unknown>)("revert")).resolves.toEqual({ status: "rolled-back" });
  expect(calls.map((call) => call.name)).toEqual(["preview", "apply", "rollback"]);
  expect(calls.every((call) => typeof call.args[1] === "string" || call.args[1] === null)).toBe(true);

  calls.length = 0;
  await expect((bridge.previewHarnessMemory as (...a: unknown[]) => Promise<unknown>)(payload, "stale-session")).rejects.toThrow("HARNESS_SESSION_CHANGED");
  await expect((bridge.applyHarnessMemory as (...a: unknown[]) => Promise<unknown>)({}, approval, "stale-session")).rejects.toThrow("HARNESS_SESSION_CHANGED");
  await expect((bridge.rollbackHarness as (...a: unknown[]) => Promise<unknown>)("revert", "stale-session")).rejects.toThrow("HARNESS_SESSION_CHANGED");
  expect(calls).toEqual([]);
});
