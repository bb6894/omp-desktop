import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveDefaultBridge } from "../src/bridge/tauri-product-bridge";
import { groupSessionsByState, type SessionViewData } from "../src/lib/session-lifecycle";

const SRC_ROOT = join(import.meta.dir, "../src");

function view(id: string, updatedAt: string, runtimeState: SessionViewData["runtimeState"]): SessionViewData {
  return {
    id,
    title: `Session ${id}`,
    projectPath: "C:\\project",
    updatedAt,
    writeMode: "desktop-owned",
    runtimeState
  };
}

test("shipping transport requires Tauri and accepts injected seams for tests", () => {
  expect(resolveDefaultBridge()).toBeNull();
  expect(resolveDefaultBridge({
    invoke: async () => null,
    listen: async () => async () => undefined
  })).not.toBeNull();
});

test("shipping App selects only the real Tauri bridge", () => {
  const source = readFileSync(join(SRC_ROOT, "App.tsx"), "utf8");
  expect(source).not.toContain("fixture-product-bridge");
  expect(source).not.toContain("createFixtureProductBridge");
  expect(source).toContain('throw new Error("PRODUCT_TAURI_UNAVAILABLE")');
});

describe("session grouping", () => {
  const sessions = [
    view("running", "2026-08-25T09:00:00.000Z", "running"),
    view("waiting", "2026-08-25T08:00:00.000Z", "waiting-user"),
    view("failed", "2026-08-25T07:00:00.000Z", "failed"),
    view("idle", "2026-08-25T06:00:00.000Z", "idle")
  ];

  test("every session lands in exactly one state group", () => {
    const groups = groupSessionsByState(sessions);
    const total = Object.values(groups).reduce((sum, group) => sum + group.length, 0);
    expect(total).toBe(sessions.length);
    expect(groups["进行中"].map((item) => item.id)).toEqual(["running", "idle"]);
    expect(groups["等待你处理"].map((item) => item.id)).toEqual(["waiting", "failed"]);
    expect(groups["已完成"]).toEqual([]);
  });
});

describe("forbidden patterns never appear in renderer source", () => {
  function listSources(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(SRC_ROOT, { recursive: true })) {
      const full = join(SRC_ROOT, String(entry));
      if (String(entry).endsWith(".ts") || String(entry).endsWith(".tsx") || String(entry).endsWith(".css")) {
        out.push(full);
      }
    }
    return out;
  }

  test("no host-runtime imports, network calls, or raw HTML sinks", () => {
    for (const file of listSources()) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/@oh-my-pi/);
      expect(source).not.toMatch(/from "node:/);
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).not.toMatch(/\beval\(/);
      expect(source).not.toMatch(/innerHTML/);
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });
});
