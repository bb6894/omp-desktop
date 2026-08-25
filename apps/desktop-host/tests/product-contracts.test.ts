import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTaskProjection,
  parseTaskMetadataIndex,
  parseTaskMetadataRecord,
  parseTaskProjection,
  pruneTaskMetadataIndex,
  parseSessionId,
  type ParseResult,
  type TaskMetadataIndex,
  type TaskProjection
} from "../src/product-contracts";
import { TASK_PROJECTION_VECTORS } from "./fixtures/task-projection-vectors";

const VALID_INPUT = {
  id: "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8",
  displayName: "Refactor host dispatch",
  projectPath: "C:\\Users\\yyds\\Desktop\\OMP验收-A",
  updatedAt: "2026-08-24T09:40:18.123Z",
  writeMode: "desktop-owned"
};

function ok<T>(result: ParseResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.value;
}

function fail<T>(result: ParseResult<T>, code: string): void {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected rejection");
  expect(result.code).toBe(code);
}

test("frozen vectors round-trip through buildTaskProjection", () => {
  expect(TASK_PROJECTION_VECTORS.length).toBeGreaterThanOrEqual(6);
  const states = new Set(TASK_PROJECTION_VECTORS.map((v) => v.runtimeState));
  const origins = new Set(TASK_PROJECTION_VECTORS.map((v) => v.input.writeMode));
  expect(states.size).toBe(4);
  expect(origins.size).toBe(2);
  for (const vector of TASK_PROJECTION_VECTORS) {
    const built = ok(buildTaskProjection(vector.input, vector.metadata, vector.runtimeState));
    expect(built).toEqual(vector.expected);
    const reparsed = ok(parseTaskProjection(vector.expected));
    expect(reparsed).toEqual(vector.expected);
  }
});

test("rejects malformed inputs with stable codes and no payload echoes", () => {
  fail(parseTaskProjection(null), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskProjection([]), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskProjection("nope"), "TASK_CONTRACT_INVALID_INPUT");
});

test("rejects unknown fields on SessionRecordInput instead of dropping them", () => {
  const raw = { ...VALID_INPUT, extra: 1 };
  fail(buildTaskProjection(raw, null, "idle"), "TASK_CONTRACT_UNKNOWN_FIELD");
  fail(parseTaskProjection({ ...ok(buildTaskProjection(VALID_INPUT, null, "idle")), sneaky: true }), "TASK_CONTRACT_UNKNOWN_FIELD");
});

test("enforces every bounds-table rule", () => {
  // taskId: empty / bad charset / overlong
  fail(buildTaskProjection({ ...VALID_INPUT, id: "" }, null, "idle"), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(buildTaskProjection({ ...VALID_INPUT, id: "bad/id" }, null, "idle"), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(buildTaskProjection({ ...VALID_INPUT, id: "a".repeat(129) }, null, "idle"), "TASK_CONTRACT_INVALID_TASK_ID");
  // title: empty after trim / overlong / non-string
  fail(buildTaskProjection({ ...VALID_INPUT, displayName: "   " }, null, "idle"), "TASK_CONTRACT_INVALID_TITLE");
  fail(buildTaskProjection({ ...VALID_INPUT, displayName: "x".repeat(201) }, null, "idle"), "TASK_CONTRACT_INVALID_TITLE");
  fail(buildTaskProjection({ ...VALID_INPUT, displayName: 42 }, null, "idle"), "TASK_CONTRACT_INVALID_TITLE");
  // projectPath: relative / overlong / non-windows-absolute
  fail(buildTaskProjection({ ...VALID_INPUT, projectPath: "relative/path" }, null, "idle"), "TASK_CONTRACT_INVALID_PROJECT_PATH");
  fail(buildTaskProjection({ ...VALID_INPUT, projectPath: "C:\\" + "a".repeat(1024) }, null, "idle"), "TASK_CONTRACT_INVALID_PROJECT_PATH");
  fail(buildTaskProjection({ ...VALID_INPUT, projectPath: "/unix/path" }, null, "idle"), "TASK_CONTRACT_INVALID_PROJECT_PATH");
  // timestamps: not ISO-8601 round-trippable
  fail(buildTaskProjection({ ...VALID_INPUT, updatedAt: "2026-08-24" }, null, "idle"), "TASK_CONTRACT_INVALID_TIMESTAMP");
  fail(buildTaskProjection({ ...VALID_INPUT, updatedAt: "yesterday" }, null, "idle"), "TASK_CONTRACT_INVALID_TIMESTAMP");
  // writeMode: outside closed union
  fail(buildTaskProjection({ ...VALID_INPUT, writeMode: "read-write" }, null, "idle"), "TASK_CONTRACT_INVALID_ORIGIN");
  // runtime state: outside closed union (explicit argument)
  fail(buildTaskProjection(VALID_INPUT, null, "paused"), "TASK_CONTRACT_INVALID_RUNTIME_STATE");
});

test("session-id guard follows the observed Task 1 rule", () => {
  expect(ok(parseSessionId("2026-08-21T14-35-29-102Z_01a024bf-8fce-7606-9084-25af26d20c37"))).toBe(
    "2026-08-21T14-35-29-102Z_01a024bf-8fce-7606-9084-25af26d20c37"
  );
  expect(ok(parseSessionId("a._-9"))).toBe("a._-9");
  fail(parseSessionId(""), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(parseSessionId("space out"), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(parseSessionId("x/y"), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(parseSessionId("x".repeat(129)), "TASK_CONTRACT_INVALID_TASK_ID");
  fail(parseSessionId(7), "TASK_CONTRACT_INVALID_TASK_ID");
});

test("combination constraints reject impossible states", () => {
  // terminal-history must be read-only AND idle
  fail(
    parseTaskProjection({
      taskId: VALID_INPUT.id,
      title: VALID_INPUT.displayName,
      origin: "terminal-history",
      writable: false,
      projectPath: VALID_INPUT.projectPath,
      runtimeState: "running",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: VALID_INPUT.updatedAt
    }),
    "TASK_CONTRACT_INVALID_COMBINATION"
  );
  fail(
    parseTaskProjection({
      taskId: VALID_INPUT.id,
      title: VALID_INPUT.displayName,
      origin: "terminal-history",
      writable: true,
      projectPath: VALID_INPUT.projectPath,
      runtimeState: "idle",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: VALID_INPUT.updatedAt
    }),
    "TASK_CONTRACT_INVALID_COMBINATION"
  );
  // desktop-owned implies writable
  fail(
    parseTaskProjection({
      taskId: VALID_INPUT.id,
      title: VALID_INPUT.displayName,
      origin: "desktop-owned",
      writable: false,
      projectPath: VALID_INPUT.projectPath,
      runtimeState: "idle",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: VALID_INPUT.updatedAt
    }),
    "TASK_CONTRACT_INVALID_COMBINATION"
  );
  // completed only when idle or failed
  for (const state of ["running", "waiting-user"] as const) {
    fail(
      parseTaskProjection({
        taskId: VALID_INPUT.id,
        title: VALID_INPUT.displayName,
        origin: "desktop-owned",
        writable: true,
        projectPath: VALID_INPUT.projectPath,
        runtimeState: state,
        completed: true,
        pinned: false,
        lastViewedAt: null,
        updatedAt: VALID_INPUT.updatedAt
      }),
      "TASK_CONTRACT_INVALID_COMBINATION"
    );
  }
  // metadata carrying completed=true cannot combine with running via build either
  fail(
    buildTaskProjection(
      VALID_INPUT,
      { completed: true, pinned: false, lastViewedAt: null },
      "running"
    ),
    "TASK_CONTRACT_INVALID_COMBINATION"
  );
});

test("metadata record parsing drops unknown fields and validates values", () => {
  expect(ok(parseTaskMetadataRecord({ completed: true, pinned: false, lastViewedAt: null }))).toEqual({
    completed: true,
    pinned: false,
    lastViewedAt: null
  });
  expect(ok(parseTaskMetadataRecord({ completed: false, pinned: true, lastViewedAt: "2026-08-24T10:00:00.000Z", junk: 1 }))).toEqual({
    completed: false,
    pinned: true,
    lastViewedAt: "2026-08-24T10:00:00.000Z"
  });
  fail(parseTaskMetadataRecord(null), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskMetadataRecord({}), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskMetadataRecord({ completed: "yes", pinned: false, lastViewedAt: null }), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskMetadataRecord({ completed: false, pinned: false, lastViewedAt: "not-iso" }), "TASK_CONTRACT_INVALID_TIMESTAMP");
});

test("metadata index parsing reports dropped entries without failing and caps size", () => {
  const parsed = ok(
    parseTaskMetadataIndex({
      "session-a": { completed: true, pinned: false, lastViewedAt: null },
      "session-b": { broken: true }
    })
  );
  expect(parsed.index["session-a"]).toEqual({ completed: true, pinned: false, lastViewedAt: null });
  expect(Object.hasOwn(parsed.index, "session-b")).toBe(false);
  expect(parsed.droppedCount).toBe(1);

  const oversized: TaskMetadataIndex = {};
  for (let i = 0; i < 5001; i += 1) oversized[`session-${i}`] = { completed: false, pinned: false, lastViewedAt: null };
  fail(parseTaskMetadataIndex(oversized), "TASK_METADATA_INDEX_TOO_LARGE");

  fail(parseTaskMetadataIndex([1, 2]), "TASK_CONTRACT_INVALID_INPUT");
  fail(parseTaskMetadataIndex("nope"), "TASK_CONTRACT_INVALID_INPUT");
});

test("prune removes only orphan keys and returns the removal count", () => {
  const index: TaskMetadataIndex = {
    live: { completed: false, pinned: true, lastViewedAt: null },
    orphan: { completed: true, pinned: false, lastViewedAt: null }
  };
  expect(pruneTaskMetadataIndex(index, ["live"])).toBe(1);
  expect(Object.keys(index)).toEqual(["live"]);
  expect(pruneTaskMetadataIndex(index, ["live", "fresh"])).toBe(0);
});

test("product-contracts.ts stays pure: no runtime imports of node, omp vendor, or @oh-my-pi", () => {
  const source = readFileSync(resolve(import.meta.dir, "../src/product-contracts.ts"), "utf8");
  expect(source).toContain("product-contracts");
  expect(source).not.toMatch(/@oh-my-pi/);
  expect(source).not.toMatch(/from "node:/);
  expect(source).not.toMatch(/omp-vendor/);
});
