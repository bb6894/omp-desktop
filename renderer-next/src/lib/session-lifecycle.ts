/**
 * Session lifecycle helpers for the per-session-Host-child model (decision B):
 * every desktop session owns one Host child route; terminal histories stay
 * read-only and continue only through the proven fork path.
 */

/** Structural view type: Host `SessionView` satisfies this at the seam. */
export type SessionViewData = {
  id: string;
  title: string;
  projectPath: string;
  updatedAt: string;
  writeMode: "desktop-owned" | "history-readonly";
  runtimeState: "idle" | "running" | "waiting-user" | "failed";
};

const ROUTE_PREFIX = "session-";

/**
 * Legacy-compatible route id (`session-<epoch-ms>`), disambiguated with a
 * process-wide counter when several are minted in the same millisecond.
 */
export function nextRouteId(nowMs: number = Date.now()): string {
  const unique = nextRouteId as { seq?: number };
  unique.seq = (unique.seq ?? 0) + 1;
  // Hyphen, not dot: route ids end up in Tauri event names (`agent://line/<id>`),
  // and dots are outside the allowed charset there.
  return `${ROUTE_PREFIX}${nowMs}-${unique.seq}`;
}

/** uuid → owning route. Desktop sessions remember which child runs them. */
export type RouteRegistry = Map<string, string>;

export function routesToProject(): RouteRegistry {
  return new Map<string, string>();
}

/** Newest discovered record belonging to one project path, or null. */
export function newestRecordForProject(
  views: readonly SessionViewData[],
  projectPath: string
): SessionViewData | null {
  const matching = views
    .filter((view) => view.projectPath === projectPath)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matching[0] ?? null;
}

/** Only terminal histories may be forked; writable sessions never re-fork. */
export function isForkable(view: SessionViewData): boolean {
  return view.writeMode === "history-readonly";
}

export type SessionGroup = "进行中" | "等待你处理" | "已完成";
export type SessionGrouping = Record<SessionGroup, SessionViewData[]>;

function byRecency(a: SessionViewData, b: SessionViewData): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Total function over sessions (v1): 进行中 = idle/running; 等待你处理 =
 * waiting-user ranked above failed, each recency-descending; 已完成 stays
 * empty until the archived marker ships. Every session lands exactly once.
 */
export function groupSessionsByState(views: readonly SessionViewData[]): SessionGrouping {
  const grouping: SessionGrouping = { "进行中": [], "等待你处理": [], 已完成: [] };
  for (const view of views) {
    if (view.runtimeState === "waiting-user") grouping["等待你处理"].push(view);
    else if (view.runtimeState === "failed") grouping["等待你处理"].push(view);
    else grouping["进行中"].push(view);
  }
  for (const key of ["进行中", "等待你处理"] as const) {
    grouping[key].sort(byRecency);
  }
  grouping["等待你处理"].sort((a, b) =>
    a.runtimeState === b.runtimeState ? byRecency(a, b) : a.runtimeState === "waiting-user" ? -1 : 1
  );
  return grouping;
}
