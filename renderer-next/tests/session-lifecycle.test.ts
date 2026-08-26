import { describe, expect, test } from "bun:test";
import {
  isForkable,
  newestRecordForProject,
  nextRouteId,
  routesToProject,
  groupSessionsByState,
} from "../src/lib/session-lifecycle";
import type { SessionViewData } from "../src/lib/session-lifecycle";

function view(id: string, updatedAt: string, overrides: Partial<SessionViewData> = {}): SessionViewData {
  return {
    id,
    title: `s ${id}`,
    projectPath: "C:\\proj-a",
    updatedAt,
    writeMode: "desktop-owned",
    runtimeState: "idle",
    ...overrides
  };
}

describe("route ids", () => {
  test("follow the legacy convention and stay unique under counter pressure", () => {
    const first = nextRouteId(1_000);
    const second = nextRouteId(1_000);
    expect(first.startsWith("session-")).toBe(true);
    expect(second.startsWith("session-")).toBe(true);
    expect(first).not.toBe(second);
  });
});

test("routesToProject tracks which route owns which discovered session", () => {
  const routes = routesToProject();
  const routeId = nextRouteId(5_000);
  routes.set("01a03730-a280", routeId);
  expect(routes.get("01a03730-a280")).toBe(routeId);
});

test("newestRecordForProject picks the latest updatedAt among matching paths", () => {
  const views = [
    view("a", "2026-08-24T00:00:00.000Z"),
    view("b", "2026-08-25T08:00:00.000Z"),
    view("other-project", "2026-08-26T00:00:00.000Z", { projectPath: "C:\\elsewhere" })
  ];
  expect(newestRecordForProject(views, "C:\\proj-a")?.id).toBe("b");
});

describe("fork gating", () => {
  test("terminal histories are forkable, desktop-owned sessions are not", () => {
    expect(isForkable(view("h", "2026-08-25T09:00:00.000Z", { writeMode: "history-readonly" }))).toBe(true);
    expect(isForkable(view("d", "2026-08-25T09:00:00.000Z"))).toBe(false);
  });
});

describe("groupSessionsByState", () => {
  test("every session lands exactly once and groups stay total", () => {
    const views = [
      view("run", "2026-08-25T09:00:00.000Z", { runtimeState: "running" }),
      view("wait", "2026-08-25T08:00:00.000Z", { runtimeState: "waiting-user" }),
      view("fail", "2026-08-25T07:00:00.000Z", { runtimeState: "failed" }),
      view("idle", "2026-08-25T06:00:00.000Z")
    ];
    const groups = groupSessionsByState(views);
    const total =
      groups["进行中"].length + groups["等待你处理"].length + groups["已完成"].length;
    expect(total).toBe(views.length);
    expect(groups["进行中"].map((s) => s.id)).toEqual(["run", "idle"]);
    // waiting-user ranks above failed regardless of recency
    expect(groups["等待你处理"].map((s) => s.id)).toEqual(["wait", "fail"]);
  });

  test("history-readonly sessions participate like any other state", () => {
    const views = [
      view("h", "2026-08-24T00:00:00.000Z", { writeMode: "history-readonly" })
    ];
    const groups = groupSessionsByState(views);
    expect(groups["进行中"].map((s) => s.id)).toEqual(["h"]);
  });
});
