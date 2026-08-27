import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  HARNESS_SCHEMA_VERSION,
  type HarnessCompatibility,
  type HarnessInspection,
  type HarnessInspectorApi,
  type HarnessState
} from "./harness-contracts";
import { normalizeAbsoluteWindowsPath } from "./profile-paths";

const DEFAULT_COMPATIBILITY: HarnessCompatibility = { runtimeVersion: "17.4.1", hostProtocol: 1 };
const MAX_HARNESS_FILE_BYTES = 1024 * 1024;
const MAX_HARNESS_TEXT_BYTES = 16 * 1024;
const MAX_HARNESS_COLLECTION_ENTRIES = 512;
const MAX_HARNESS_EVIDENCE_ENTRIES = 64;
const SECRET_PATTERNS = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
  /\bbearer\s+[a-z0-9._~+/=-]{8,}/i,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\b\s*[:=]\s*["']?[^\s"',;]{6,}/i,
  /\b(?:sk-(?:proj-)?[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{16,}|xox[baprs]-[a-z0-9-]{16,})\b/i
] as const;

export function defaultHarnessDataRoot(): string {
  const fallback = join(homedir(), "AppData", "Local");
  return normalizeAbsoluteWindowsPath(process.env.LOCALAPPDATA ?? fallback);
}

export function harnessProjectId(projectPath: string): string {
  const normalized = normalizeAbsoluteWindowsPath(projectPath).toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

export function resolveHarnessStorePath(projectPath: string, dataRoot = defaultHarnessDataRoot()): string {
  const normalizedRoot = normalizeAbsoluteWindowsPath(dataRoot);
  return join(normalizedRoot, "OMP Desktop", "harness", "projects", harnessProjectId(projectPath), "state.json");
}

export function createEmptyHarnessState(
  projectPath: string,
  compatibility: HarnessCompatibility = DEFAULT_COMPATIBILITY
): HarnessState {
  const normalizedProjectPath = normalizeAbsoluteWindowsPath(projectPath);
  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    projectId: harnessProjectId(normalizedProjectPath),
    projectPath: normalizedProjectPath,
    compatibility,
    goals: [],
    memories: [],
    skills: [],
    agentProfiles: [],
    proposals: [],
    refinementHistory: [],
    snapshots: []
  };
}

export class HarnessStore implements HarnessInspectorApi {
  private readonly projectPath: string;
  private readonly storePath: string;

  constructor(
    projectPath: string,
    dataRoot = defaultHarnessDataRoot(),
    private readonly compatibility: HarnessCompatibility = DEFAULT_COMPATIBILITY
  ) {
    this.projectPath = normalizeAbsoluteWindowsPath(projectPath);
    this.storePath = resolveHarnessStorePath(this.projectPath, dataRoot);
  }

  async inspect(): Promise<HarnessInspection> {
    try {
      const file = await open(this.storePath, "r");
      let text: string;
      try {
        const stats = await file.stat();
        if (!stats.isFile() || stats.size > MAX_HARNESS_FILE_BYTES) {
          throw new Error("HARNESS_STATE_TOO_LARGE");
        }
        text = await file.readFile({ encoding: "utf8" });
        if (Buffer.byteLength(text, "utf8") > MAX_HARNESS_FILE_BYTES) {
          throw new Error("HARNESS_STATE_TOO_LARGE");
        }
      } finally {
        await file.close();
      }
      const parsed = parseHarnessJson(text);
      assertHarnessSchema(parsed);
      assertHarnessCollections(parsed);
      assertHarnessTextLimits(parsed);
      assertHarnessContainsNoSecrets(parsed);
      if (!matchesProjectPath(parsed.projectPath, this.projectPath)) {
        throw new Error("HARNESS_PROJECT_MISMATCH");
      }
      if (parsed.projectId !== harnessProjectId(this.projectPath)) {
        throw new Error("HARNESS_PROJECT_MISMATCH");
      }
      if (!isCompatible(parsed.compatibility, this.compatibility)) {
        throw new Error("HARNESS_INCOMPATIBLE");
      }
      assertHarnessEntries(parsed, this.compatibility);
      return { readOnly: true, source: "harness-store", projectId: parsed.projectId, state: parsed };
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      const state = createEmptyHarnessState(this.projectPath, this.compatibility);
      return { readOnly: true, source: "harness-store", projectId: state.projectId, state };
    }
  }
}

function parseHarnessJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("HARNESS_STATE_INVALID_JSON");
  }
}

function assertHarnessSchema(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value.schemaVersion !== HARNESS_SCHEMA_VERSION) {
    throw new Error("HARNESS_SCHEMA_UNSUPPORTED");
  }
}

function assertHarnessTextLimits(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (Buffer.byteLength(current, "utf8") > MAX_HARNESS_TEXT_BYTES) {
        throw new Error("HARNESS_STATE_LIMIT_EXCEEDED");
      }
    } else if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else if (isRecord(current)) {
      for (const item of Object.values(current)) pending.push(item);
    }
  }
}

function assertHarnessContainsNoSecrets(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (SECRET_PATTERNS.some((pattern) => pattern.test(current))) {
        throw new Error("HARNESS_SECRET_DETECTED");
      }
    } else if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
    } else if (isRecord(current)) {
      for (const item of Object.values(current)) pending.push(item);
    }
  }
}

function matchesProjectPath(value: unknown, projectPath: string): boolean {
  if (typeof value !== "string") return false;
  try {
    return normalizeAbsoluteWindowsPath(value).toLowerCase() === projectPath.toLowerCase();
  } catch {
    return false;
  }
}

function isCompatible(value: unknown, expected: HarnessCompatibility): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["runtimeVersion", "hostProtocol"])
    && value.runtimeVersion === expected.runtimeVersion
    && value.hostProtocol === expected.hostProtocol;
}

function assertHarnessCollections(value: Record<string, unknown>): void {
  if (!hasOnlyKeys(value, [
    "schemaVersion",
    "projectId",
    "projectPath",
    "compatibility",
    "goals",
    "memories",
    "skills",
    "agentProfiles",
    "proposals",
    "refinementHistory",
    "snapshots"
  ])) {
    throw new Error("HARNESS_STATE_INVALID");
  }
  const names = ["goals", "memories", "skills", "agentProfiles", "proposals", "refinementHistory", "snapshots"] as const;
  for (const name of names) {
    const collection = value[name];
    if (!Array.isArray(collection)) {
      throw new Error("HARNESS_STATE_INVALID");
    }
    if (collection.length > MAX_HARNESS_COLLECTION_ENTRIES) {
      throw new Error("HARNESS_STATE_LIMIT_EXCEEDED");
    }
  }
}

function assertHarnessEntries(
  value: Record<string, unknown>,
  compatibility: HarnessCompatibility
): asserts value is Record<string, unknown> & HarnessState {
  const valid = (value.goals as unknown[]).every(isGoal)
    && (value.memories as unknown[]).every((entry) => isKnowledgeEntry(entry, compatibility, false))
    && (value.skills as unknown[]).every((entry) => isKnowledgeEntry(entry, compatibility, false))
    && (value.agentProfiles as unknown[]).every((entry) => isKnowledgeEntry(entry, compatibility, true))
    && (value.proposals as unknown[]).every(isProposal)
    && (value.refinementHistory as unknown[]).every(isRefinementRecord)
    && (value.snapshots as unknown[]).every(isSnapshot);
  if (!valid) {
    throw new Error("HARNESS_STATE_INVALID");
  }
}

function isGoal(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "title", "status", "updatedAt"])
    && isText(value.id)
    && isText(value.title)
    && isOneOf(value.status, ["active", "completed", "paused"])
    && isText(value.updatedAt);
}

function isKnowledgeEntry(value: unknown, compatibility: HarnessCompatibility, requiresRole: boolean): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, requiresRole
      ? ["id", "title", "content", "scope", "status", "evidence", "compatibility", "updatedAt", "role"]
      : ["id", "title", "content", "scope", "status", "evidence", "compatibility", "updatedAt"])
    && isText(value.id)
    && isText(value.title)
    && isText(value.content)
    && isOneOf(value.scope, ["project", "global"])
    && isOneOf(value.status, ["active", "proposed", "rejected", "quarantined", "reverted"])
    && isEvidenceList(value.evidence)
    && isCompatible(value.compatibility, compatibility)
    && isText(value.updatedAt)
    && (!requiresRole || isText(value.role));
}

function isEvidence(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["kind", "reference", "summary"])
    && isOneOf(value.kind, ["command", "test", "file", "user-feedback"])
    && isText(value.reference)
    && isText(value.summary);
}

function isProposal(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "kind", "targetId", "summary", "proposedValue", "status", "evidence", "createdAt"])
    && isText(value.id)
    && isOneOf(value.kind, ["memory", "skill", "agent-profile", "goal"])
    && (value.targetId === null || isText(value.targetId))
    && isText(value.summary)
    && isText(value.proposedValue)
    && isOneOf(value.status, ["proposed", "approved", "rejected", "quarantined", "reverted"])
    && isEvidenceList(value.evidence)
    && isText(value.createdAt);
}

function isRefinementRecord(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "proposalId", "outcome", "reason", "createdAt"])
    && isText(value.id)
    && isText(value.proposalId)
    && isOneOf(value.outcome, ["approved", "rejected", "quarantined", "reverted"])
    && isText(value.reason)
    && isText(value.createdAt);
}

function isEvidenceList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > MAX_HARNESS_EVIDENCE_ENTRIES) {
    throw new Error("HARNESS_STATE_LIMIT_EXCEEDED");
  }
  return value.every(isEvidence);
}

function isSnapshot(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "createdAt", "reason", "stateHash"])
    && isText(value.id)
    && isText(value.createdAt)
    && isText(value.reason)
    && isText(value.stateHash);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
