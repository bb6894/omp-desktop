import { execFile } from "node:child_process";

/**
 * Bounded workspace view (Phase 7, spec §Workspace changes): changed-file
 * summaries and per-file diffs against HEAD for THIS project (the Host cwd).
 * Static argv only — never a shell string; every response honours explicit
 * caps and stable codes; binary/oversized/outside-root/unavailable states are
 * reported, not improvised.
 */

export const WORKSPACE_LIMITS = {
  maxFiles: 200,
  maxDiffBytes: 256 * 1024,
  maxDiffLines: 2000,
  maxLineLength: 500
} as const;

const RELATIVE_PATH_PATTERN = /^(?!\/)[A-Za-z0-9._\-/\\]+$/;

export type WorkspaceCode =
  | "WORKSPACE_PATH_INVALID"
  | "WORKSPACE_UNAVAILABLE";

type ExecResult = { stdout: string; stderr: string; exitCode: number };
export type WorkspaceExec = (
  command: string,
  args: readonly string[],
  cwd: string
) => Promise<ExecResult>;

/** Node-backed default seam: static argv through execFile, no shell. */
export function nodeExec(command: string, args: readonly string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, maxBuffer: WORKSPACE_LIMITS.maxDiffBytes * 2 },
      (error, stdout, stderr) => {
        const code = (error as { code?: unknown } | null)?.code;
        resolve({
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          exitCode: typeof code === "number" ? code : error ? 1 : 0
        });
      }
    );
  });
}

export type PathCheck = { ok: true; value: string } | { ok: false; code: string };

/**
 * Accepts plain relative paths only. Absolute drives, UNC shares, leading
 * slashes, empty strings and any `..` escape segment are rejected with the
 * single stable code WORKSPACE_PATH_INVALID.
 */
export function validateRelativePath(input: string): PathCheck {
  const looksAbsolute =
    input.startsWith("/") || input.startsWith("\\") || /^[A-Za-z]:/.test(input);
  if (
    input.length === 0 ||
    looksAbsolute ||
    !RELATIVE_PATH_PATTERN.test(input) ||
    input.split(/[\\/]/).includes("..")
  ) {
    return { ok: false, code: "WORKSPACE_PATH_INVALID" };
  }
  return { ok: true, value: input.replace(/\\/g, "/") };
}

export type FileStatusEntry = { path: string; code: string };
export type StatusListing = {
  files: FileStatusEntry[];
  truncated: boolean;
  code?: string;
};

function runGit(root: string, args: readonly string[], exec: WorkspaceExec) {
  return exec("git", args, root);
}

/** `git status --porcelain=v1` with the file-count cap applied in order. */
export async function collectStatus(root: string, exec: WorkspaceExec): Promise<StatusListing> {
  try {
    const result = await runGit(root, ["status", "--porcelain=v1"], exec);
    if (result.exitCode !== 0) {
      return { files: [], truncated: false, code: "WORKSPACE_UNAVAILABLE" };
    }
    const files: FileStatusEntry[] = [];
    let truncated = false;
    for (const line of result.stdout.split("\n")) {
      if (line.length === 0) continue;
      if (files.length >= WORKSPACE_LIMITS.maxFiles) {
        truncated = true;
        break;
      }
      const code = line.slice(0, 2).trim() || line.slice(0, 2);
      const path = line.slice(3).replace(/^"|"$/g, "");
      if (path.length === 0) continue;
      files.push({ path, code });
    }
    return { files, truncated };
  } catch {
    return { files: [], truncated: false, code: "WORKSPACE_UNAVAILABLE" };
  }
}

export type DiffResult =
  | { kind: "text"; diff: string; truncated: boolean }
  | { kind: "binary" }
  | { kind: "untracked" };

function truncateDiff(raw: string): { diff: string; truncated: boolean } {
  let truncated = false;
  let lines = raw.split("\n");
  if (lines.length > WORKSPACE_LIMITS.maxDiffLines) {
    lines = lines.slice(0, WORKSPACE_LIMITS.maxDiffLines);
    truncated = true;
  }
  lines = lines.map((line) =>
    line.length > WORKSPACE_LIMITS.maxLineLength
      ? line.slice(0, WORKSPACE_LIMITS.maxLineLength)
      : line
  );
  let diff = lines.join("\n");
  if (!truncated && diff.length > WORKSPACE_LIMITS.maxDiffBytes) {
    diff = diff.slice(0, WORKSPACE_LIMITS.maxDiffBytes);
    truncated = true;
  }
  return { diff, truncated };
}

/**
 * Per-file diff vs HEAD. Binary detection via numstat `- -`; untracked files
 * report their own kind (nothing to diff against HEAD).
 */
export async function buildDiff(
  root: string,
  relativePath: string,
  exec: WorkspaceExec
): Promise<DiffResult> {
  const check = validateRelativePath(relativePath);
  if (!check.ok) throw new SessionWorkspaceError(check.code);
  const safePath = check.value;

  const numstat = await runGit(root, ["diff", "HEAD", "--numstat", "--", safePath], exec);
  if (numstat.exitCode !== 0 && numstat.stderr.includes("not a git repository")) {
    throw new SessionWorkspaceError("WORKSPACE_UNAVAILABLE");
  }
  const firstLine = numstat.stdout.split("\n")[0] ?? "";
  const columns = firstLine.split("\t");
  if (columns[0] === "-" && columns[1] === "-") return { kind: "binary" };
  if (firstLine.trim() === "" ) return { kind: "untracked" };

  const text = await runGit(root, ["diff", "HEAD", "--", safePath], exec);
  if (text.exitCode !== 0 && text.stderr.includes("not a git repository")) {
    throw new SessionWorkspaceError("WORKSPACE_UNAVAILABLE");
  }
  return { kind: "text", ...truncateDiff(text.stdout) };
}

export class SessionWorkspaceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Accept a workspace change: keep the current file as-is (git add).
 * Reject: restore the file from HEAD (git checkout HEAD -- <path>).
 */
export async function applyWorkspaceChange(
  root: string,
  relativePath: string,
  action: "accept" | "reject",
  exec: WorkspaceExec
): Promise<{ ok: boolean; error?: string }> {
  const check = validateRelativePath(relativePath);
  if (!check.ok) {
    return { ok: false, error: `ERR_PATH_INVALID: 文件路径无效 (${check.code})` };
  }
  const safePath = check.value;
  try {
    if (action === "accept") {
      // Stage the file (git add) to mark as accepted
      const result = await runGit(root, ["add", safePath], exec);
      if (result.exitCode !== 0) {
        return { ok: false, error: `ERR_ACCEPT_FAILED: 无法接受变更 — ${result.stderr.trim() || "未知错误"}` };
      }
      return { ok: true };
    } else {
      // Restore from HEAD
      const result = await runGit(root, ["checkout", "HEAD", "--", safePath], exec);
      if (result.exitCode !== 0) {
        return { ok: false, error: `ERR_REJECT_FAILED: 无法回滚变更 — ${result.stderr.trim() || "未知错误"}` };
      }
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: `ERR_WORKSPACE_${action.toUpperCase()}: 操作失败 — ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Snapshot management for version rollback.
 * Takes git commits after each agent turn to enable rollback.
 */
export type WorkspaceSnapshot = {
  commitHash: string;
  sessionId: string;
  turnNumber: number;
  timestamp: string;
  changedFiles: string[];
};

export type SnapshotApi = {
  /** List all snapshots for a session */
  list(sessionId: string): Promise<WorkspaceSnapshot[]>;
  /** Rollback to a specific snapshot */
  rollback(sessionId: string, commitHash: string): Promise<{ ok: boolean; error?: string }>;
  /** Take a snapshot after an agent turn */
  take(sessionId: string, turnNumber: number, cwd: string, exec: WorkspaceExec): Promise<WorkspaceSnapshot | null>;
};

export function createSnapshotApi(root: string, exec: WorkspaceExec): SnapshotApi {
  const snapshots = new Map<string, WorkspaceSnapshot[]>();

  async function runGit(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return exec("git", args, root);
  }

  async function list(sessionId: string): Promise<WorkspaceSnapshot[]> {
    return snapshots.get(sessionId) ?? [];
  }

  async function rollback(sessionId: string, commitHash: string): Promise<{ ok: boolean; error?: string }> {
    const result = await runGit(["reset", "--hard", commitHash]);
    if (result.exitCode !== 0) {
      return { ok: false, error: `回滚失败: ${result.stderr.trim() || "未知错误"}` };
    }
    return { ok: true };
  }

  async function take(sessionId: string, turnNumber: number, cwd: string, localExec: WorkspaceExec): Promise<WorkspaceSnapshot | null> {
    // Check if there are any changes
    const statusResult = await localExec("git", ["status", "--porcelain"], cwd);
    if (statusResult.exitCode !== 0 || !statusResult.stdout.trim()) {
      return null; // No changes, skip
    }

    // Stage all changes
    const addResult = await localExec("git", ["add", "-A"], cwd);
    if (addResult.exitCode !== 0) {
      return null;
    }

    // Get changed files
    const diffResult = await localExec("git", ["diff", "--cached", "--name-only"], cwd);
    const changedFiles = diffResult.stdout.split("\n").filter(Boolean);

    if (changedFiles.length === 0) {
      return null; // No files changed
    }

    // Commit
    const commitMsg = `omp-snapshot: session-${sessionId} turn-${turnNumber}`;
    const commitResult = await localExec("git", ["commit", "-m", commitMsg], cwd);
    if (commitResult.exitCode !== 0) {
      return null;
    }

    // Get commit hash
    const hashResult = await localExec("git", ["rev-parse", "HEAD"], cwd);
    const commitHash = hashResult.stdout.trim();

    const snapshot: WorkspaceSnapshot = {
      commitHash,
      sessionId,
      turnNumber,
      timestamp: new Date().toISOString(),
      changedFiles
    };

    // Store snapshot
    const sessionSnapshots = snapshots.get(sessionId) ?? [];
    sessionSnapshots.push(snapshot);
    snapshots.set(sessionId, sessionSnapshots);

    return snapshot;
  }

  return { list, rollback, take };
}
