import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sweepOrphanTempFiles, writeFileAtomic } from "./harness-atomic-file";

/**
 * Non-content session metadata for one project (Phase 1): `archived` /
 * `pinned` / `lastViewedAt`, keyed by the canonical session UUID, persisted at
 * `<dataRoot>\OMP Desktop\sessions\projects\<projectId32>\metadata.json`.
 *
 * Discipline (same family as the harness store): every mutating call runs
 * load → merge → atomic write inside an advisory lock taken by exclusive
 * create (`wx`); stale locks (older than LOCK_STALE_MS or held by a dead pid)
 * are taken over; orphan `.tmp` files are swept after writes. Reads take no
 * lock — atomic rename guarantees no torn read. Losing this file only resets
 * organization markers; sessions themselves are untouched.
 *
 * Never stores message content, prompts, paths, or any other field.
 */

const LOCK_NAME = "session-metadata.lock";
const LOCK_STALE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_RETRY_DELAY_MS = 25;

export class SessionMetadataStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type SessionMetadataRecord = {
  archived: boolean;
  pinned: boolean;
  lastViewedAt: string | null;
};

export type SessionMetadataIndex = Record<string, SessionMetadataRecord>;

export type SessionMetadataPatch = Partial<Omit<SessionMetadataRecord, "lastViewedAt">> & {
  lastViewedAt?: string | null;
};

export type SessionMetadataStoreOptions = {
  /** Injectable clock for stale-lock decisions (ms epoch). */
  now?: () => number;
  /** Bounded acquisition attempts before SESSION_METADATA_LOCK_TIMEOUT. */
  maxAttempts?: number;
  /** Wait seam between attempts; injectable so tests never sleep on wall-clock. */
  waitBetweenAttempts?: () => Promise<void>;
};

type LockContents = { pid: number; acquiredAt: number };

const DEFAULT_RECORD: SessionMetadataRecord = {
  archived: false,
  pinned: false,
  lastViewedAt: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/** Strict on types; tolerant on absent optional fields. Unknown keys drop. */
function parseRecord(input: unknown): SessionMetadataRecord | null {
  if (!isRecord(input)) return null;
  const merged: SessionMetadataRecord = { ...DEFAULT_RECORD };
  if ("archived" in input) {
    if (typeof input.archived !== "boolean") return null;
    merged.archived = input.archived;
  }
  if ("pinned" in input) {
    if (typeof input.pinned !== "boolean") return null;
    merged.pinned = input.pinned;
  }
  if ("lastViewedAt" in input && input.lastViewedAt !== null && input.lastViewedAt !== undefined) {
    if (!isValidIsoTimestamp(input.lastViewedAt)) return null;
    merged.lastViewedAt = input.lastViewedAt;
  }
  return merged;
}

function safelyParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "EEXIST";
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class SessionMetadataStore {
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly waitBetweenAttempts: () => Promise<void>;

  constructor(
    private readonly filePath: string,
    options: SessionMetadataStoreOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.waitBetweenAttempts =
      options.waitBetweenAttempts ??
      (() => new Promise<void>((resolve) => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS)));
  }

  private get projectDir(): string {
    return dirname(this.filePath);
  }

  private get lockPath(): string {
    return join(this.projectDir, LOCK_NAME);
  }

  /** Reads the index without taking the lock; missing or corrupt files degrade to {}. */
  async get(): Promise<SessionMetadataIndex> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return {};
    }
    const parsed = safelyParseJson(raw);
    if (!isRecord(parsed)) return {}; // corrupt file ≈ lost file
    const index: SessionMetadataIndex = {};
    let corrupted = false;
    for (const [key, value] of Object.entries(parsed)) {
      const record = parseRecord(value);
      if (record === null) corrupted = true;
      else index[key] = record;
    }
    if (corrupted && Object.keys(index).length === 0) return {};
    return index;
  }

  /**
   * Load → merge → atomic write under the advisory lock. Accepts ids absent
   * from session discovery; orphan cleanup is explicit maintenance elsewhere.
   */
  async set(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataRecord> {
    await mkdir(this.projectDir, { recursive: true });
    const acquiredAt = await this.acquireLock();
    try {
      const index = await this.loadIndexUnderLock();
      const current = index[sessionId] ?? { ...DEFAULT_RECORD };
      const merged = parseRecord({ ...current, ...patch });
      if (merged === null) throw new SessionMetadataStoreError("SESSION_METADATA_INVALID_RECORD");
      index[sessionId] = merged;
      await this.persist(index);
      return { ...merged };
    } finally {
      await this.releaseLock(acquiredAt);
    }
  }

  /**
   * Explicit maintenance only: drop keys absent from liveSessionIds, persist
   * when something was removed, return the removal count. Never invoked
   * implicitly by get()/set().
   */
  async prune(liveSessionIds: readonly string[]): Promise<number> {
    await mkdir(this.projectDir, { recursive: true });
    const acquiredAt = await this.acquireLock();
    try {
      const index = await this.loadIndexUnderLock();
      const live = new Set(liveSessionIds);
      let removed = 0;
      for (const key of Object.keys(index)) {
        if (!live.has(key)) {
          delete index[key];
          removed += 1;
        }
      }
      if (removed > 0) await this.persist(index);
      return removed;
    } finally {
      await this.releaseLock(acquiredAt);
    }
  }

  private async loadIndexUnderLock(): Promise<SessionMetadataIndex> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return {};
    }
    const parsed = safelyParseJson(raw);
    if (!isRecord(parsed)) return {};
    const index: SessionMetadataIndex = {};
    for (const [key, value] of Object.entries(parsed)) {
      const record = parseRecord(value);
      if (record !== null) index[key] = record;
    }
    return index;
  }

  /** Stable key order keeps the persisted file diff-friendly across writers. */
  private async persist(index: SessionMetadataIndex): Promise<void> {
    await mkdir(this.projectDir, { recursive: true });
    const ordered: SessionMetadataIndex = {};
    for (const key of Object.keys(index).sort()) ordered[key] = index[key];
    await writeFileAtomic(this.filePath, new TextEncoder().encode(JSON.stringify(ordered)));
    await sweepOrphanTempFiles(this.projectDir);
  }

  private async acquireLock(): Promise<number> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) await this.waitBetweenAttempts();
      const contents: LockContents = { pid: process.pid, acquiredAt: this.now() };
      try {
        const handle = await open(this.lockPath, "wx");
        try {
          await handle.write(new TextEncoder().encode(JSON.stringify(contents)));
        } finally {
          await handle.close();
        }
        return contents.acquiredAt;
      } catch (error: unknown) {
        if (!isExistsError(error)) throw new SessionMetadataStoreError("SESSION_METADATA_STORE_UNAVAILABLE");
      }
      if (await this.takeOverStaleLock()) continue;
    }
    throw new SessionMetadataStoreError("SESSION_METADATA_LOCK_TIMEOUT");
  }

  private async takeOverStaleLock(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(this.lockPath, "utf8");
    } catch {
      return true; // vanished between failed wx and read — retry immediately
    }
    let holder: unknown;
    try {
      holder = JSON.parse(raw);
    } catch {
      await unlink(this.lockPath).catch(() => undefined);
      return true;
    }
    if (
      !isRecord(holder) ||
      typeof holder.pid !== "number" ||
      typeof holder.acquiredAt !== "number"
    ) {
      await unlink(this.lockPath).catch(() => undefined);
      return true;
    }
    const expired = this.now() - holder.acquiredAt > LOCK_STALE_MS;
    if (!expired && isProcessAlive(holder.pid)) return false;
    await unlink(this.lockPath).catch(() => undefined);
    return true;
  }

  private async releaseLock(acquiredAt: number): Promise<void> {
    try {
      const raw = await readFile(this.lockPath, "utf8");
      const holder = JSON.parse(raw) as Partial<LockContents>;
      if (holder.pid === process.pid && holder.acquiredAt === acquiredAt) {
        await unlink(this.lockPath);
      }
    } catch {
      /* already gone or replaced — nothing to release */
    }
  }
}
