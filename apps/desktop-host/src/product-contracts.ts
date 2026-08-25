/**
 * Product DTO contracts — the single source of every product-facing task type.
 *
 * Purity rule (enforced by product-contracts.test.ts): this module performs zero
 * runtime imports of any kind — no filesystem, no path utilities, no OMP vendor
 * packages, no React — so it is bundle-safe in any environment, browser included.
 * The Windows absolute-path guard is therefore a local regex check instead of a
 * path-library helper.
 *
 * Every parse helper returns a discriminated ParseResult and never throws with
 * payload echoes; error messages are stable codes only.
 */

export type TaskRuntimeState = "idle" | "running" | "waiting-user" | "failed";
export type TaskOrigin = "desktop-owned" | "terminal-history";
export type WriteMode = "history-readonly" | "desktop-owned";

export type TaskProjection = {
  taskId: string;
  title: string;
  origin: TaskOrigin;
  writable: boolean;
  projectPath: string;
  runtimeState: TaskRuntimeState;
  completed: boolean;
  pinned: boolean;
  lastViewedAt: string | null;
  updatedAt: string;
};

export type TaskMetadataRecord = {
  completed: boolean;
  pinned: boolean;
  lastViewedAt: string | null;
};

/** Key = sessionId. */
export type TaskMetadataIndex = Record<string, TaskMetadataRecord>;

export type TaskContractErrorCode =
  | "TASK_CONTRACT_INVALID_INPUT"
  | "TASK_CONTRACT_UNKNOWN_FIELD"
  | "TASK_CONTRACT_INVALID_TASK_ID"
  | "TASK_CONTRACT_INVALID_TITLE"
  | "TASK_CONTRACT_INVALID_PROJECT_PATH"
  | "TASK_CONTRACT_INVALID_TIMESTAMP"
  | "TASK_CONTRACT_INVALID_ORIGIN"
  | "TASK_CONTRACT_INVALID_RUNTIME_STATE"
  | "TASK_CONTRACT_INVALID_COMBINATION";

export type TaskMetadataErrorCode =
  | "TASK_METADATA_INVALID_REQUEST"
  | "TASK_METADATA_INVALID_SESSION_ID"
  | "TASK_METADATA_STORE_UNAVAILABLE"
  | "TASK_METADATA_INDEX_TOO_LARGE"
  | "TASK_METADATA_LOCK_TIMEOUT";

export type TaskErrorCode = TaskContractErrorCode | TaskMetadataErrorCode;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: TaskErrorCode };

/** Closed structural shape of the session-record fields the projection needs (Task 1 evidence). */
export type SessionRecordInput = {
  id: string;
  displayName: string;
  projectPath: string;
  updatedAt: string;
  writeMode: WriteMode;
};

export type ParsedTaskMetadataIndex = {
  index: TaskMetadataIndex;
  droppedCount: number;
};

// Bounds (plan §Field bounds): session ids observed as `<ISO-timestamp>_<UUIDv7>` stems,
// guarded by charset + length only so OMP may vary the id shape between versions.
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_PROJECT_PATH_LENGTH = 1024;
const METADATA_INDEX_LIMIT = 5000;
// node:path is forbidden here (purity); this regex accepts drive-absolute and UNC paths.
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = keys.length;
  if (Object.keys(input).length !== expected) return false;
  return keys.every((key) => Object.hasOwn(input, key));
}

function parseSessionIdValue(value: unknown): ParseResult<string> {
  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
    return { ok: false, code: "TASK_CONTRACT_INVALID_TASK_ID" };
  }
  return { ok: true, value };
}

export function parseSessionId(input: unknown): ParseResult<string> {
  return parseSessionIdValue(input);
}

function parseTitle(value: unknown): ParseResult<string> {
  if (typeof value !== "string") return { ok: false, code: "TASK_CONTRACT_INVALID_TITLE" };
  if (value.trim().length === 0 || value.length > MAX_TITLE_LENGTH) {
    return { ok: false, code: "TASK_CONTRACT_INVALID_TITLE" };
  }
  return { ok: true, value };
}

function parseProjectPath(value: unknown): ParseResult<string> {
  if (
    typeof value !== "string" ||
    value.length > MAX_PROJECT_PATH_LENGTH ||
    !WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)
  ) {
    return { ok: false, code: "TASK_CONTRACT_INVALID_PROJECT_PATH" };
  }
  return { ok: true, value };
}

function parseIsoTimestamp(value: unknown): ParseResult<string> {
  if (!isValidIsoTimestamp(value)) return { ok: false, code: "TASK_CONTRACT_INVALID_TIMESTAMP" };
  return { ok: true, value };
}

function parseOrigin(value: unknown): ParseResult<TaskOrigin> {
  if (value === "desktop-owned" || value === "terminal-history") return { ok: true, value };
  return { ok: false, code: "TASK_CONTRACT_INVALID_ORIGIN" };
}

function parseWriteMode(value: unknown): ParseResult<WriteMode> {
  if (value === "desktop-owned" || value === "history-readonly") return { ok: true, value };
  return { ok: false, code: "TASK_CONTRACT_INVALID_ORIGIN" };
}

function parseRuntimeState(value: unknown): ParseResult<TaskRuntimeState> {
  if (value === "idle" || value === "running" || value === "waiting-user" || value === "failed") {
    return { ok: true, value };
  }
  return { ok: false, code: "TASK_CONTRACT_INVALID_RUNTIME_STATE" };
}

/** Spec's Task Model: terminal history is read-only and never live; completion implies quiescence. */
function validateCombination(
  origin: TaskOrigin,
  writable: boolean,
  runtimeState: TaskRuntimeState,
  completed: boolean
): ParseResult<true> {
  if (writable !== (origin === "desktop-owned")) {
    return { ok: false, code: "TASK_CONTRACT_INVALID_COMBINATION" };
  }
  if (origin === "terminal-history" && runtimeState !== "idle") {
    return { ok: false, code: "TASK_CONTRACT_INVALID_COMBINATION" };
  }
  if (completed && runtimeState !== "idle" && runtimeState !== "failed") {
    return { ok: false, code: "TASK_CONTRACT_INVALID_COMBINATION" };
  }
  return { ok: true, value: true };
}

function assembleProjection(fields: {
  taskId: string;
  title: string;
  origin: TaskOrigin;
  writable: boolean;
  projectPath: string;
  runtimeState: TaskRuntimeState;
  completed: boolean;
  pinned: boolean;
  lastViewedAt: string | null;
  updatedAt: string;
}): ParseResult<TaskProjection> {
  const combination = validateCombination(
    fields.origin,
    fields.writable,
    fields.runtimeState,
    fields.completed
  );
  if (!combination.ok) return combination;
  return { ok: true, value: fields };
}

export function buildTaskProjection(
  raw: SessionRecordInput,
  metadata: TaskMetadataRecord | null,
  runtimeState: TaskRuntimeState
): ParseResult<TaskProjection> {
  if (!isRecord(raw) || !exactKeys(raw, ["id", "displayName", "projectPath", "updatedAt", "writeMode"])) {
    return { ok: false, code: "TASK_CONTRACT_UNKNOWN_FIELD" };
  }
  const state = parseRuntimeState(runtimeState);
  if (!state.ok) return state;
  const taskId = parseSessionIdValue(raw.id);
  if (!taskId.ok) return taskId;
  const title = parseTitle(raw.displayName);
  if (!title.ok) return title;
  const projectPath = parseProjectPath(raw.projectPath);
  if (!projectPath.ok) return projectPath;
  const updatedAt = parseIsoTimestamp(raw.updatedAt);
  if (!updatedAt.ok) return updatedAt;
  const writeMode = parseWriteMode(raw.writeMode);
  if (!writeMode.ok) return writeMode;
  const completed = metadata?.completed ?? false;
  return assembleProjection({
    taskId: taskId.value,
    title: title.value,
    origin: writeMode.value === "desktop-owned" ? "desktop-owned" : "terminal-history",
    writable: writeMode.value === "desktop-owned",
    projectPath: projectPath.value,
    runtimeState: state.value,
    completed,
    pinned: metadata?.pinned ?? false,
    lastViewedAt: metadata?.lastViewedAt ?? null,
    updatedAt: updatedAt.value
  });
}

const PROJECTION_KEYS = [
  "taskId",
  "title",
  "origin",
  "writable",
  "projectPath",
  "runtimeState",
  "completed",
  "pinned",
  "lastViewedAt",
  "updatedAt"
] as const;

export function parseTaskProjection(input: unknown): ParseResult<TaskProjection> {
  if (!isRecord(input) || !exactKeys(input, PROJECTION_KEYS)) {
    return { ok: false, code: input === null || input === undefined || !isRecord(input) ? "TASK_CONTRACT_INVALID_INPUT" : "TASK_CONTRACT_UNKNOWN_FIELD" };
  }
  const taskId = parseSessionIdValue(input.taskId);
  if (!taskId.ok) return taskId;
  const title = parseTitle(input.title);
  if (!title.ok) return title;
  const origin = parseOrigin(input.origin);
  if (!origin.ok) return origin;
  if (typeof input.writable !== "boolean") return { ok: false, code: "TASK_CONTRACT_INVALID_COMBINATION" };
  const projectPath = parseProjectPath(input.projectPath);
  if (!projectPath.ok) return projectPath;
  const runtimeState = parseRuntimeState(input.runtimeState);
  if (!runtimeState.ok) return runtimeState;
  if (typeof input.completed !== "boolean" || typeof input.pinned !== "boolean") {
    return { ok: false, code: "TASK_CONTRACT_INVALID_INPUT" };
  }
  const updatedAt = parseIsoTimestamp(input.updatedAt);
  if (!updatedAt.ok) return updatedAt;
  let lastViewedAt: string | null = null;
  if (input.lastViewedAt !== null) {
    const parsed = parseIsoTimestamp(input.lastViewedAt);
    if (!parsed.ok) return parsed;
    lastViewedAt = parsed.value;
  }
  return assembleProjection({
    taskId: taskId.value,
    title: title.value,
    origin: origin.value,
    writable: input.writable,
    projectPath: projectPath.value,
    runtimeState: runtimeState.value,
    completed: input.completed,
    pinned: input.pinned,
    lastViewedAt,
    updatedAt: updatedAt.value
  });
}

export function parseTaskMetadataRecord(input: unknown): ParseResult<TaskMetadataRecord> {
  if (!isRecord(input)) return { ok: false, code: "TASK_CONTRACT_INVALID_INPUT" };
  // Unknown fields are dropped here (index tolerance), unlike SessionRecordInput which rejects.
  const completed = input.completed;
  const pinned = input.pinned;
  if (typeof completed !== "boolean" || typeof pinned !== "boolean") {
    return { ok: false, code: "TASK_CONTRACT_INVALID_INPUT" };
  }
  let lastViewedAt: string | null = null;
  if (input.lastViewedAt !== null && input.lastViewedAt !== undefined) {
    const parsed = parseIsoTimestamp(input.lastViewedAt);
    if (!parsed.ok) return parsed;
    lastViewedAt = parsed.value;
  }
  return { ok: true, value: { completed, pinned, lastViewedAt } };
}

export function parseTaskMetadataIndex(input: unknown): ParseResult<ParsedTaskMetadataIndex> {
  if (!isRecord(input)) return { ok: false, code: "TASK_CONTRACT_INVALID_INPUT" };
  if (Object.keys(input).length > METADATA_INDEX_LIMIT) {
    return { ok: false, code: "TASK_METADATA_INDEX_TOO_LARGE" };
  }
  const index: TaskMetadataIndex = {};
  let droppedCount = 0;
  for (const [key, value] of Object.entries(input)) {
    const record = parseTaskMetadataRecord(value);
    if (!record.ok) {
      droppedCount += 1;
      continue;
    }
    index[key] = record.value;
  }
  return { ok: true, value: { index, droppedCount } };
}

/** Removes keys absent from liveSessionIds; returns how many entries were removed. */
export function pruneTaskMetadataIndex(index: TaskMetadataIndex, liveSessionIds: readonly string[]): number {
  const live = new Set(liveSessionIds);
  let removed = 0;
  for (const key of Object.keys(index)) {
    if (!live.has(key)) {
      delete index[key];
      removed += 1;
    }
  }
  return removed;
}
