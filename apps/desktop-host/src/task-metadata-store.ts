import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  parseTaskMetadataIndex,
  parseTaskMetadataRecord,
  type TaskMetadataIndex,
  type TaskMetadataRecord
} from "./product-contracts";
import { sweepOrphanTempFiles, writeFileAtomic } from "./harness-atomic-file";

/**
 * Per-project task organization metadata (`completed` / `pinned` / `lastViewedAt`,
 * keyed by session id), persisted at `<dataRoot>\OMP Desktop\tasks\projects\<projectId32>\task-metadata.json`.
 *
 * Concurrency: several Desktop Host processes (tabs on one project) can read-modify-write
 * the same file. Every set() serializes on an advisory lock file created by exclusive
 * create (`wx`); stale locks (older than LOCK_STALE_MS or held by a dead pid) are taken
 * over. get() reads without the lock — atomic rename guarantees no torn read.
 *
 * Degradation (documented, not silent): a hard kill between lock takeover and the atomic
 * rename loses that one update (last-write-wins). Losing this file only resets task
 * organization; sessions themselves are untouched.
 */

const LOCK_NAME = "task-metadata.lock";
const LOCK_STALE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_RETRY_DELAY_MS = 25;

export class TaskMetadataStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type TaskMetadataStoreOptions = {
  /** Injectable clock for stale-lock decisions (ms epoch). */
  now?: () => number;
  /** Bounded acquisition attempts before TASK_METADATA_LOCK_TIMEOUT. */
  maxAttempts?: number;
  /** Wait seam between attempts; injectable so tests never sleep on wall-clock time. */
  waitBetweenAttempts?: () => Promise<void>;
};

type LockContents = { pid: number; acquiredAt: number };

export class TaskMetadataStore {
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly waitBetweenAttempts: () => Promise<void>;

  constructor(
    private readonly filePath: string,
    options: TaskMetadataStoreOptions = {}
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
  async get(): Promise<TaskMetadataIndex> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return {};
    }
    const parsed = parseTaskMetadataIndex(safelyParseJson(raw));
    if (!parsed.ok) {
      if (parsed.code === "TASK_CONTRACT_INVALID_INPUT") return {}; // corrupt file ≈ lost file
      throw new TaskMetadataStoreError(parsed.code);
    }
    return parsed.value.index;
  }

  /**
   * Load → merge → atomic write, serialized by the advisory lock. Accepts ids absent
   * from session discovery; orphan cleanup is explicit maintenance elsewhere.
   */
  async set(sessionId: string, patch: Partial<TaskMetadataRecord>): Promise<TaskMetadataRecord> {
    // The lock file lives in the project dir, so the directory must exist before wx acquisition.
    await mkdir(this.projectDir, { recursive: true });
    const acquiredAt = await this.acquireLock();
    try {
      const index = await this.loadIndexUnderLock();
      const current = index[sessionId] ?? { completed: false, pinned: false, lastViewedAt: null };
      const merged = { ...current, ...patch };
      const validated = parseTaskMetadataRecord(merged);
      if (!validated.ok) throw new TaskMetadataStoreError(validated.code);
      index[sessionId] = validated.value;
      await mkdir(this.projectDir, { recursive: true });
      // Stable key order keeps the persisted file diff-friendly across writers.
      const ordered: TaskMetadataIndex = {};
      for (const key of Object.keys(index).sort()) ordered[key] = index[key];
      await writeFileAtomic(this.filePath, new TextEncoder().encode(JSON.stringify(ordered)));
      await sweepOrphanTempFiles(this.projectDir);
      return validated.value;
    } finally {
      await this.releaseLock(acquiredAt);
    }
  }

  private async loadIndexUnderLock(): Promise<TaskMetadataIndex> {
    let raw: string | null = null;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return {};
    }
    const parsed = parseTaskMetadataIndex(safelyParseJson(raw));
    if (!parsed.ok) {
      if (parsed.code === "TASK_CONTRACT_INVALID_INPUT") return {}; // corrupt file ≈ lost file
      throw new TaskMetadataStoreError(parsed.code);
    }
    return parsed.value.index;
  }

  /** Exclusive-create acquisition with bounded retry and stale takeover. Returns our acquiredAt. */
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
        if (!isExistsError(error)) throw new TaskMetadataStoreError("TASK_METADATA_STORE_UNAVAILABLE");
      }
      if (await this.takeOverStaleLock()) continue;
    }
    throw new TaskMetadataStoreError("TASK_METADATA_LOCK_TIMEOUT");
  }

  /** Replaces the lock if it is expired or its holder is dead; false when it is live. */
  private async takeOverStaleLock(): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(this.lockPath, "utf8");
    } catch {
      return true; // vanished between the failed wx and the read — retry immediately
    }
    let holder: unknown;
    try {
      holder = JSON.parse(raw);
    } catch {
      await unlink(this.lockPath).catch(() => undefined);
      return true;
    }
    if (
      typeof holder !== "object" ||
      holder === null ||
      typeof (holder as LockContents).pid !== "number" ||
      typeof (holder as LockContents).acquiredAt !== "number"
    ) {
      await unlink(this.lockPath).catch(() => undefined);
      return true;
    }
    const { pid, acquiredAt } = holder as LockContents;
    const expired = this.now() - acquiredAt > LOCK_STALE_MS;
    if (!expired && isProcessAlive(pid)) return false;
    await unlink(this.lockPath).catch(() => undefined);
    return true;
  }

  /** Removes the lock only if we still own it (a takeover may have replaced it). */
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

function safelyParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null; // unparseable input is rejected downstream as invalid input shape
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
