import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildTaskProjection } from "@omp/product-contracts";
import { TASK_PROJECTION_VECTORS } from "@fixture-vectors";
import { groupTasks } from "../src/lib/task-grouping";
import { createFixtureProductBridge } from "../src/bridge/fixture-product-bridge";

const SRC_ROOT = join(import.meta.dir, "../src");

test("every frozen vector builds through the contract guards", () => {
  expect(TASK_PROJECTION_VECTORS.length).toBeGreaterThanOrEqual(6);
  for (const vector of TASK_PROJECTION_VECTORS) {
    const built = buildTaskProjection(vector.input, vector.metadata, vector.runtimeState);
    expect(built.ok).toBe(true);
  }
});

describe("groupTasks is a total function", () => {
  const fixtures = createFixtureProductBridge();
  const all = TASK_PROJECTION_VECTORS;

  test("every projection lands in exactly one group", async () => {
    const tasks = await fixtures.listTasks();
    expect(tasks.length).toBe(all.length);
    const groups = groupTasks(tasks);
    const total =
      groups["进行中"].length + groups["等待你处理"].length + groups["已完成"].length;
    expect(total).toBe(tasks.length);
  });

  test("completed joins 已完成; waiting ranks above failed; others join 进行中", async () => {
    const tasks = await fixtures.listTasks();
    const groups = groupTasks(tasks);
    for (const task of tasks) {
      if (task.completed) {
        expect(groups["已完成"].map((t) => t.taskId)).toContain(task.taskId);
      } else if (task.runtimeState === "waiting-user" || task.runtimeState === "failed") {
        expect(groups["等待你处理"].map((t) => t.taskId)).toContain(task.taskId);
      } else {
        expect(groups["进行中"].map((t) => t.taskId)).toContain(task.taskId);
      }
    }
    const waitingIds = groups["等待你处理"].map((t) => t.runtimeState);
    if (waitingIds.includes("waiting-user") && waitingIds.includes("failed")) {
      expect(waitingIds.indexOf("waiting-user")).toBeLessThan(waitingIds.indexOf("failed"));
    }
  });

  test("groups sort by updatedAt descending within each group", async () => {
    const tasks = await fixtures.listTasks();
    const groups = groupTasks(tasks);
    for (const key of ["进行中", "等待你处理", "已完成"] as const) {
      const stamps = groups[key].map((t) => t.updatedAt);
      const sorted = [...stamps].sort((a, b) => b.localeCompare(a));
      expect(stamps).toEqual(sorted);
    }
  });
});

test("fixture bridge metadata round-trips through set/get", async () => {
  const bridge = createFixtureProductBridge();
  const anyId = TASK_PROJECTION_VECTORS[0].input.id;
  const record = await bridge.setTaskMetadata(anyId, { pinned: true });
  expect(record.pinned).toBe(true);
  const index = await bridge.getTaskMetadata();
  expect(index[anyId].pinned).toBe(true);
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
