import { expect, test } from "bun:test";
import { SessionService } from "../src/session-service";
import type { OmpSessionAdapter } from "../src/omp-adapter";
import type { TaskMetadataIndex, TaskMetadataRecord } from "../src/product-contracts";

const SESSION_ID = "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8";

function fakeSessions(): OmpSessionAdapter {
  return {
    listReadOnly: async () => [],
    loadMessagesReadOnly: async () => {
      throw new Error("unused");
    },
    forkFrom: async () => {
      throw new Error("unused");
    }
  };
}

type StoreStub = {
  get(): Promise<TaskMetadataIndex>;
  set(sessionId: string, patch: Partial<TaskMetadataRecord>): Promise<TaskMetadataRecord>;
};

function fakeStore(overrides?: Partial<StoreStub>): StoreStub {
  const index: TaskMetadataIndex = {};
  return {
    get: overrides?.get ?? (async () => index),
    set:
      overrides?.set ??
      (async (sessionId, patch) => {
        const current = index[sessionId] ?? { completed: false, pinned: false, lastViewedAt: null };
        index[sessionId] = { ...current, ...patch };
        return index[sessionId];
      })
  };
}

async function dispatch(service: SessionService, body: Record<string, unknown>) {
  return service.dispatch({ requestId: "req-1", type: "task.metadata.get", ...body });
}

test("task.metadata.get returns the whole index through the allowlisted dispatch", async () => {
  const store = fakeStore({
    get: async () => ({ [SESSION_ID]: { completed: true, pinned: false, lastViewedAt: null } })
  });
  const service = new SessionService(fakeSessions(), null, null, store);
  const response = await dispatch(service, {});
  expect(response).toEqual({
    type: "response",
    requestId: "req-1",
    ok: true,
    value: { index: { [SESSION_ID]: { completed: true, pinned: false, lastViewedAt: null } } }
  });
});

test("task.metadata.set validates shape and merges via the store", async () => {
  const store = fakeStore();
  const service = new SessionService(fakeSessions(), null, null, store);
  const set = service.dispatch({
    requestId: "req-1",
    type: "task.metadata.set",
    sessionId: SESSION_ID,
    patch: { pinned: true }
  });
  expect(await set).toEqual({
    type: "response",
    requestId: "req-1",
    ok: true,
    value: { record: { completed: false, pinned: true, lastViewedAt: null } }
  });
});

test("malformed requests fail closed with stable codes and no echoes", async () => {
  const store = fakeStore();
  const service = new SessionService(fakeSessions(), null, null, store);

  // unknown top-level field
  expect(
    (await service.dispatch({ requestId: "a", type: "task.metadata.get", junk: 1 })).code
  ).toBe("INVALID_REQUEST");

  // empty patch
  expect(
    (
      await service.dispatch({
        requestId: "b",
        type: "task.metadata.set",
        sessionId: SESSION_ID,
        patch: {}
      })
    ).code
  ).toBe("TASK_METADATA_INVALID_REQUEST");

  // unknown patch field
  expect(
    (
      await service.dispatch({
        requestId: "c",
        type: "task.metadata.set",
        sessionId: SESSION_ID,
        patch: { pinned: true, sneaky: "x" }
      })
    ).code
  ).toBe("TASK_METADATA_INVALID_REQUEST");

  // invalid patch value
  expect(
    (
      await service.dispatch({
        requestId: "d",
        type: "task.metadata.set",
        sessionId: SESSION_ID,
        patch: { pinned: "yes" }
      })
    ).code
  ).toBe("TASK_METADATA_INVALID_REQUEST");

  // non-ISO lastViewedAt
  expect(
    (
      await service.dispatch({
        requestId: "e",
        type: "task.metadata.set",
        sessionId: SESSION_ID,
        patch: { lastViewedAt: "2026-08-24" }
      })
    ).code
  ).toBe("TASK_METADATA_INVALID_REQUEST");
});

test("bad session ids map to TASK_METADATA_INVALID_SESSION_ID", async () => {
  const store = fakeStore();
  const service = new SessionService(fakeSessions(), null, null, store);
  for (const bad of ["", "bad/id", "x".repeat(129)]) {
    const response = await service.dispatch({
      requestId: `r-${bad.length}`,
      type: "task.metadata.set",
      sessionId: bad,
      patch: { pinned: true }
    });
    expect(response.code).toBe("TASK_METADATA_INVALID_SESSION_ID");
  }
});

test("duplicate request-id replays are still rejected on the metadata surface", async () => {
  const store = fakeStore();
  const service = new SessionService(fakeSessions(), null, null, store);
  const first = await service.dispatch({ requestId: "dup", type: "task.metadata.get" });
  expect(first.ok).toBe(true);
  const replay = await service.dispatch({ requestId: "dup", type: "task.metadata.get" });
  expect(replay.code).toBe("DUPLICATE_REQUEST_ID");
});

test("an unavailable store yields TASK_METADATA_STORE_UNAVAILABLE", async () => {
  const service = new SessionService(fakeSessions(), null, null, null);
  const got = await service.dispatch({ requestId: "g", type: "task.metadata.get" });
  expect(got.code).toBe("TASK_METADATA_STORE_UNAVAILABLE");
  const set = await service.dispatch({
    requestId: "s",
    type: "task.metadata.set",
    sessionId: SESSION_ID,
    patch: { pinned: true }
  });
  expect(set.code).toBe("TASK_METADATA_STORE_UNAVAILABLE");
});

test("coded store failures map to their stable boundary codes", async () => {
  const store = fakeStore({
    set: async () => {
      throw new Error("TASK_METADATA_LOCK_TIMEOUT");
    }
  });
  const service = new SessionService(fakeSessions(), null, null, store);
  const response = await service.dispatch({
    requestId: "t",
    type: "task.metadata.set",
    sessionId: SESSION_ID,
    patch: { pinned: true }
  });
  expect(response.code).toBe("TASK_METADATA_LOCK_TIMEOUT");
});
