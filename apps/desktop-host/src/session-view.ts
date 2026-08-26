import type { SessionRecord } from "./contracts";
import type { AgentState } from "./agent-service";

/**
 * Host-assembled session views for the workbench renderer (Phase 1). Pure
 * module: adapts real session records onto a bounded DTO and derives live
 * runtime state from the Agent service's per-session states. Type-only
 * imports keep this bundle-safe; the renderer consumes these as plain data.
 */

export type SessionRuntimeState = "idle" | "running" | "waiting-user" | "failed";

export type SessionView = {
  id: string;
  title: string;
  projectPath: string;
  updatedAt: string;
  writeMode: SessionRecord["writeMode"];
  runtimeState: SessionRuntimeState;
};

/** Wire-boundary guard for target session ids on metadata operations. */
export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && ID_PATTERN.test(value);
}

type SessionViewFields = {
  id: string;
  displayName: string;
  projectPath: string;
  updatedAt: string;
  writeMode: SessionRecord["writeMode"];
};

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_PROJECT_PATH_LENGTH = 1024;
// node:path is forbidden here (purity); accepts drive-absolute and UNC paths.
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/** Picks exactly the five session-facing fields off a discovery record. */
export function toSessionViewInput(record: SessionRecord): SessionViewFields {
  return {
    id: record.id,
    displayName: record.displayName,
    projectPath: record.projectPath,
    updatedAt: record.updatedAt,
    writeMode: record.writeMode
  };
}

/** Fixed derivation table; total over AgentState ∪ {null}. */
export function sessionRuntimeState(state: AgentState | null): SessionRuntimeState {
  if (state === null || state === "idle" || state === "completed" || state === "interrupted") {
    return "idle";
  }
  if (state === "starting" || state === "streaming" || state === "awaiting-tool" || state === "stopping") {
    return "running";
  }
  if (state === "awaiting-interaction") return "waiting-user";
  return "failed";
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/** Per-record guards; failures are counted, never fatal to the whole listing. */
function buildView(record: SessionRecord, liveState: AgentState | null): SessionView | null {
  const fields = toSessionViewInput(record);
  if (
    typeof fields.id !== "string" ||
    fields.id.length === 0 ||
    !ID_PATTERN.test(fields.id) ||
    typeof fields.displayName !== "string" ||
    fields.displayName.trim().length === 0 ||
    fields.displayName.length > MAX_TITLE_LENGTH ||
    typeof fields.projectPath !== "string" ||
    fields.projectPath.length > MAX_PROJECT_PATH_LENGTH ||
    !WINDOWS_ABSOLUTE_PATH_PATTERN.test(fields.projectPath) ||
    !isValidIsoTimestamp(fields.updatedAt) ||
    (fields.writeMode !== "desktop-owned" && fields.writeMode !== "history-readonly")
  ) {
    return null;
  }
  // Terminal histories never carry a live agent entry; forcing idle keeps a
  // phantom state from mislabeling a read-only source.
  const runtimeState =
    fields.writeMode === "history-readonly"
      ? "idle"
      : sessionRuntimeState(liveState);
  return {
    id: fields.id,
    title: fields.displayName,
    projectPath: fields.projectPath,
    updatedAt: fields.updatedAt,
    writeMode: fields.writeMode,
    runtimeState
  };
}

export type SessionViewListing = { views: SessionView[]; skipped: number };

/**
 * Assembles views for one discovery pass. Ordering is `updatedAt` descending
 * so the wire shape is deterministic regardless of discovery order.
 */
export function assembleSessionViews(
  records: readonly SessionRecord[],
  runStates: Readonly<Record<string, AgentState | null>>
): SessionViewListing {
  const views: SessionView[] = [];
  let skipped = 0;
  for (const record of records) {
    const view = buildView(record, runStates[record.id] ?? null);
    if (view === null) skipped += 1;
    else views.push(view);
  }
  // ISO-8601 UTC strings compare lexicographically; newest first.
  views.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { views, skipped };
}
