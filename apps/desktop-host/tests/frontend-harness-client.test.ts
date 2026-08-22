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
