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
