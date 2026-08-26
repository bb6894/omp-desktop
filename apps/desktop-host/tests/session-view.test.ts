import { describe, expect, test } from "bun:test";
import {
  assembleSessionViews,
  sessionRuntimeState,
  toSessionViewInput
} from "../src/session-view";
import type { SessionRecord } from "../src/contracts";
import type { AgentState } from "../src/agent-service";

const RECORD: SessionRecord = {
  id: "01a03730-a280-7000-bf3c-1d0a82be2f31",
  sourcePath: "C:\\Users\\yyds\\.omp\\agent\\sessions\\proj\\2026-08-25T04-32-09-344Z_01a03730-a280-7000-bf3c-1d0a82be2f31.jsonl",
  displayName: "重构 RPC 桥",
  projectPath: "C:\\Users\\yyds\\Documents\\demo-project",
  updatedAt: "2026-08-25T04:32:09.344Z",
  writeMode: "desktop-owned",
  sourceSessionId: null,
  parentSessionId: null,
  owner: "desktop",
  handoffState: "none",
  size: 0
};

function recordWith(overrides: Partial<SessionRecord>): SessionRecord {
  return { ...RECORD, ...overrides };
}

test("toSessionView picks exactly the session-facing fields", () => {
  const input = toSessionViewInput(RECORD);
  expect(Object.keys(input).sort()).toEqual([
    "displayName",
    "id",
    "projectPath",
    "updatedAt",
    "writeMode"
  ]);
});

describe("sessionRuntimeState maps the agent-state table", () => {
  const idleCases: readonly (AgentState | null)[] = [null, "idle", "completed", "interrupted"];
  const runningCases: readonly AgentState[] = ["starting", "streaming", "awaiting-tool", "stopping"];

  test("idle family", () => {
    for (const state of idleCases) expect(sessionRuntimeState(state)).toBe("idle");
  });

  test("running family", () => {
    for (const state of runningCases) expect(sessionRuntimeState(state)).toBe("running");
  });

  test("waiting-user and failed", () => {
    expect(sessionRuntimeState("awaiting-interaction")).toBe("waiting-user");
    expect(sessionRuntimeState("failed")).toBe("failed");
  });
});

test("history-readonly sessions always render idle even with a phantom agent entry", () => {
  const history = recordWith({
    id: "01a024bf-8fce-7606-9084-25af26d20c37",
    writeMode: "history-readonly",
    owner: "terminal"
  });
  const result = assembleSessionViews([history], { [history.id]: "streaming" });
  expect(result.skipped).toBe(0);
  expect(result.views[0]).toMatchObject({
    id: history.id,
    writeMode: "history-readonly",
    runtimeState: "idle"
  });
});

test("assembly merges nothing else: no metadata, no content, bounded fields only", () => {
  const result = assembleSessionViews([RECORD], { [RECORD.id]: "awaiting-interaction" });
  expect(result.views[0]).toEqual({
    id: RECORD.id,
    title: RECORD.displayName,
    projectPath: RECORD.projectPath,
    updatedAt: RECORD.updatedAt,
    writeMode: "desktop-owned",
    runtimeState: "waiting-user"
  });
});

test("views come back ordered by updatedAt descending regardless of input order", () => {
  const older = recordWith({
    id: "01a02e3d-8904-7000-86d6-344782e8deb7",
    updatedAt: "2026-08-23T10:49:39.845Z"
  });
  const forward = assembleSessionViews([older, RECORD], {});
  const backward = assembleSessionViews([RECORD, older], {});
  for (const result of [forward, backward]) {
    expect(result.views.map((view) => view.id)).toEqual([RECORD.id, older.id]);
  }
});

test("guard violations count as skipped instead of failing the listing", () => {
  const badTitle = recordWith({ displayName: "   " });
  const badPath = recordWith({
    id: "01a03318-d247-7680-afcf-15b1345393e6",
    projectPath: "not/absolute",
    updatedAt: "2026-08-24T09:40:18.123Z"
  });
  const result = assembleSessionViews([badTitle, badPath], {});
  expect(result.views).toHaveLength(0);
  expect(result.skipped).toBe(2);
});

test("empty discovery yields an empty listing", () => {
  expect(assembleSessionViews([], {})).toEqual({ views: [], skipped: 0 });
});
