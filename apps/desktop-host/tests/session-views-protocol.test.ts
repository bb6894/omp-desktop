import { describe, expect, test } from "bun:test";
import { SessionService, type AgentServiceApi } from "../src/session-service";
import type { OmpSessionAdapter } from "../src/omp-adapter";
import type { AgentState } from "../src/agent-service";
import type { SessionRecord } from "../src/contracts";
import type { SessionMetadataIndex, SessionMetadataPatch, SessionMetadataRecord } from "../src/session-metadata-store";

/**
 * Phase 2 wire surface: `session.views` + `session.metadata.set` ride the
 * existing allowlisted dispatch. Real assembly path, real metadata seam;
 * runtime states come from the AgentService read-only accessor.
 */

const RECORD_ID = "01a03730-a280-7000-bf3c-1d0a82be2f31";

function record(overrides?: Partial<SessionRecord>): SessionRecord {
  return {
    id: RECORD_ID,
    sourcePath: "C:\\Users\\yyds\\.omp\\agent\\sessions\\proj\\2026-08-25T04-32-09-344Z_01a03730-a280-7000-bf3c-1d0a82be2f31.jsonl",
    displayName: "重构 RPC 桥",
    projectPath: "C:\\Users\\yyds\\Documents\\demo-project",
    updatedAt: "2026-08-25T04:32:09.344Z",
    writeMode: "desktop-owned",
    sourceSessionId: null,
    parentSessionId: null,
    owner: "desktop",
    handoffState: "none",
    size: 0,
    ...overrides
  };
}

function fakeSessions(records: SessionRecord[] = []): OmpSessionAdapter {
  return {
    listReadOnly: async () => records,
    loadMessagesReadOnly: async () => {
      throw new Error("unused");
    },
    forkFrom: async () => {
      throw new Error("unused");
    }
  };
}

function isValidIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

type MetaStub = {
  get(): Promise<SessionMetadataIndex>;
  set(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataRecord>;
  prune(liveSessionIds: readonly string[]): Promise<number>;
};

function fakeMeta(overrides?: Partial<MetaStub>): MetaStub {
  const index: SessionMetadataIndex = {};
  return {
    get: overrides?.get ?? (async () => structuredClone(index)),
    set:
      overrides?.set ??
      (async (sessionId, patch) => {
        const current = index[sessionId] ?? { archived: false, pinned: false, lastViewedAt: null };
        const merged = { ...current, ...patch };
        if (
          typeof merged.archived !== "boolean" ||
          typeof merged.pinned !== "boolean" ||
          !(merged.lastViewedAt === null || isValidIso(merged.lastViewedAt))
        ) {
          throw new Error("SESSION_METADATA_INVALID_RECORD");
        }
        index[sessionId] = merged;
        return { ...merged };
      }),
    prune: overrides?.prune ?? (async () => 0)
  };
}

function fakeAgent(state: AgentState | null): AgentServiceApi {
  return {
    stateOf: () => state,
    start: async () => {
      throw new Error("unused");
    },
    stop: async () => {
      throw new Error("unused");
    },
    respond: async () => {
      throw new Error("unused");
    },
    command: async () => {
      throw new Error("unused");
    }
  };
}

function serviceWith(
  records: SessionRecord[],
  meta: MetaStub,
  state: AgentState | null = null
): SessionService {
  const service = new SessionService(fakeSessions(records), null, null, meta);
  service.setAgentService(fakeAgent(state));
  return service;
}

test("session.views returns assembled views, metadata, and prune count", async () => {
  const meta = fakeMeta({
    get: async () => ({
      [RECORD_ID]: { archived: false, pinned: true, lastViewedAt: "2026-08-25T05:00:00.000Z" }
    }),
    prune: async () => 2
  });
  const service = serviceWith([record()], meta, "streaming");
  const response = await service.dispatch({ requestId: "v1", type: "session.views" });
  expect(response.ok).toBe(true);
  if (!response.ok) return;
  expect(response.value).toEqual({
    views: [
      {
        id: RECORD_ID,
        title: "重构 RPC 桥",
        projectPath: "C:\\Users\\yyds\\Documents\\demo-project",
        updatedAt: "2026-08-25T04:32:09.344Z",
        writeMode: "desktop-owned",
        runtimeState: "running"
      }
    ],
    skipped: 0,
    pruned: 2,
    metadata: {
      [RECORD_ID]: { archived: false, pinned: true, lastViewedAt: "2026-08-25T05:00:00.000Z" }
    }
  });
});

test("session.views counts malformed records as skipped without failing", async () => {
  const broken = record({
    id: "01a03318-d247-7680-afcf-15b1345393e6",
    projectPath: "not/absolute"
  });
  const service = serviceWith([record(), broken], fakeMeta());
  const response = await service.dispatch({ requestId: "v2", type: "session.views" });
  expect(response).toMatchObject({ ok: true, value: { skipped: 1, pruned: 0 } });
  if (!response.ok) return;
  expect(response.value.views.map((view) => view.id)).toEqual([RECORD_ID]);
});

test("session.metadata.set merges through the store and echoes the record", async () => {
  const service = serviceWith([], fakeMeta());
  const response = await service.dispatch({
    requestId: "m1",
    type: "session.metadata.set",
    sessionId: RECORD_ID,
    patch: { pinned: true }
  });
  expect(response).toMatchObject({
    ok: true,
    value: { record: { archived: false, pinned: true, lastViewedAt: null } }
  });
});

test("session.metadata.set rejects bad ids and malformed patches with stable codes", async () => {
  const service = serviceWith([], fakeMeta());

  const badId = await service.dispatch({
    requestId: "m2",
    type: "session.metadata.set",
    sessionId: "",
    patch: { pinned: true }
  });
  expect(badId).toMatchObject({ ok: false, code: "SESSION_METADATA_INVALID_SESSION_ID" });

  const notRecord = await service.dispatch({
    requestId: "m3",
    type: "session.metadata.set",
    sessionId: RECORD_ID,
    patch: "pinned"
  });
  expect(notRecord).toMatchObject({ ok: false, code: "INVALID_REQUEST" });

  const badValue = await service.dispatch({
    requestId: "m4",
    type: "session.metadata.set",
    sessionId: RECORD_ID,
    patch: { lastViewedAt: "not-an-iso" }
  });
  expect(badValue).toMatchObject({ ok: false, code: "SESSION_METADATA_INVALID_REQUEST" });
});

test("session surfaces fail closed when the metadata seam is unwired", async () => {
  const bare = new SessionService(fakeSessions(), null, null, null);
  bare.setAgentService(fakeAgent(null));
  const views = await bare.dispatch({ requestId: "w1", type: "session.views" });
  expect(views).toMatchObject({ ok: false, code: "SESSION_METADATA_STORE_UNAVAILABLE" });
  const set = await bare.dispatch({
    requestId: "w2",
    type: "session.metadata.set",
    sessionId: RECORD_ID,
    patch: { pinned: true }
  });
  expect(set).toMatchObject({ ok: false, code: "SESSION_METADATA_STORE_UNAVAILABLE" });
});

test("malformed extra keys and duplicate replays stay rejected on the new ops", async () => {
  const service = serviceWith([], fakeMeta());

  const extra = await service.dispatch({ requestId: "x1", type: "session.views", extra: 1 });
  expect(extra).toMatchObject({ ok: false, code: "INVALID_REQUEST" });

  await service.dispatch({ requestId: "dup", type: "session.views" });
  const replay = await service.dispatch({ requestId: "dup", type: "session.views" });
  expect(replay).toMatchObject({ ok: false, code: "DUPLICATE_REQUEST_ID" });
});

test("session.open_runtime binds a desktop-owned record's file through the Host", async () => {
  let capturedCommand: Record<string, unknown> | null = null;
  let capturedSessionId: string | null = null;
  const agent: AgentServiceApi = {
    ...fakeAgent("idle"),
    command: async (sessionId, command) => {
      capturedSessionId = sessionId;
      capturedCommand = command;
      return { success: true };
    }
  };
  const service = new SessionService(fakeSessions([record()]), null, null, fakeMeta());
  service.setAgentService(agent);
  const response = await service.dispatch({
    requestId: "o1",
    type: "session.open_runtime",
    routeSessionId: "route-1",
    sessionId: RECORD_ID
  });
  expect(response.ok).toBe(true);
  expect(capturedSessionId).toBe("route-1");
  expect(capturedCommand).toEqual({
    type: "switch_session",
    sessionPath: record().sourcePath
  });
});

test("session.open_runtime refuses histories and unknown ids with stable codes", async () => {
  const history = record({
    id: "01a024bf-8fce-7606-9084-25af26d20c37",
    writeMode: "history-readonly"
  });
  const service = new SessionService(
    fakeSessions([record(), history]),
    null,
    null,
    fakeMeta()
  );
  service.setAgentService(fakeAgent(null));

  const readonly = await service.dispatch({
    requestId: "o2",
    type: "session.open_runtime",
    sessionId: history.id
  });
  expect(readonly).toMatchObject({ ok: false, code: "SESSION_SOURCE_READONLY" });

  const missing = await service.dispatch({
    requestId: "o3",
    type: "session.open_runtime",
    sessionId: "01a03324-missing"
  });
  expect(missing).toMatchObject({ ok: false, code: "SESSION_NOT_FOUND" });
});

describe("bounded workspace surface", () => {
  function serviceWithWorkspace(workspace: unknown): SessionService {
    const service = new SessionService(fakeSessions(), null, null, fakeMeta());
    (
      service as unknown as { setWorkspace(api: unknown): void }
    ).setWorkspace(workspace);
    return service;
  }

  test("workspace.status passes the bounded listing through", async () => {
    const listing = {
      files: [{ path: "src/a.ts", code: "M" }],
      truncated: false
    };
    const service = serviceWithWorkspace({ status: async () => listing });
    const response = await service.dispatch({ requestId: "ws1", type: "workspace.status" });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value).toEqual(listing);
  });

  test("workspace.diff validates the relative path before touching git", async () => {
    const service = serviceWithWorkspace({ diff: async () => ({}) });
    const response = await service.dispatch({
      requestId: "wd1",
      type: "workspace.diff",
      path: "../escape"
    });
    expect(response).toMatchObject({ ok: false, code: "WORKSPACE_PATH_INVALID" });
  });

  test("unwired workspace degrades to the stable unavailable code", async () => {
    const service = new SessionService(fakeSessions(), null, null, fakeMeta());
    const response = await service.dispatch({ requestId: "ws2", type: "workspace.status" });
    expect(response).toMatchObject({ ok: false, code: "WORKSPACE_UNAVAILABLE" });
  });
});
