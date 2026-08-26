import { describe, expect, test } from "bun:test";
import {
  buildDiff,
  collectStatus,
  validateRelativePath,
  WORKSPACE_LIMITS
} from "../src/workspace";

/**
 * Phase 7 bounded workspace surface. The exec seam stands in for the git CLI
 * so every cap/escape/binary case is deterministic; a real-git smoke runs
 * separately when git is on PATH.
 */

function fakeExec(script: Record<string, string>) {
  return async (_command: string, args: readonly string[], _cwd: string) => {
    const key = args.join(" ");
    if (!(key in script)) throw new Error(`unexpected args: ${key}`);
    return { stdout: script[key], stderr: "", exitCode: 0 };
  };
}

describe("validateRelativePath", () => {
  test("accepts plain relative paths", () => {
    expect(validateRelativePath("src/main.ts").ok).toBe(true);
    expect(validateRelativePath("docs/deep/nested/file.md").ok).toBe(true);
  });

  test("rejects absolute, escape, drive and empty paths with one code", () => {
    for (const bad of [
      "",
      "/abs/path",
      "C:\\win\\path",
      "C:/win/path",
      "\\\\server\\share",
      "../escape",
      "a/../../escape",
      "a/../b/../.."
    ]) {
      const result = validateRelativePath(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("WORKSPACE_PATH_INVALID");
    }
  });
});

test("collectStatus parses porcelain v1 and enforces the file-count cap", async () => {
  const porcelain = [
    " M src/a.ts",
    "?? new.txt",
    "A  docs/b.md",
    ""
  ].join("\n");
  const exec = fakeExec({ "status --porcelain=v1": porcelain });
  const listing = await collectStatus("C:\\proj", exec);
  expect(listing.truncated).toBe(false);
  expect(listing.files).toEqual([
    { path: "src/a.ts", code: "M" },
    { path: "new.txt", code: "??" },
    { path: "docs/b.md", code: "A" }
  ]);

  const many = Array.from(
    { length: WORKSPACE_LIMITS.maxFiles + 10 },
    (_, index) => ` M f${index}.txt`
  ).join("\n");
  const capped = await collectStatus("C:\\proj", fakeExec({ "status --porcelain=v1": many }));
  expect(capped.files).toHaveLength(WORKSPACE_LIMITS.maxFiles);
  expect(capped.truncated).toBe(true);
});

test("buildDiff bounds size, truncates long lines, detects binary and untracked", async () => {
  const longLine = "x".repeat(WORKSPACE_LIMITS.maxLineLength + 50);
  const oversized = Array.from(
    { length: WORKSPACE_LIMITS.maxDiffLines + 5 },
    () => "line"
  ).join("\n");

  const boundedExec = fakeExec({
    "diff HEAD --numstat -- src/big.ts": "10\t2\tsrc/big.ts",
    "diff HEAD -- src/big.ts": oversized + "\n" + longLine
  });
  const bounded = await buildDiff("C:\\proj", "src/big.ts", boundedExec);
  if (bounded.kind !== "text") throw new Error("expected text diff");
  expect(bounded.truncated).toBe(true);
  expect(bounded.diff.split("\n").length).toBeLessThanOrEqual(WORKSPACE_LIMITS.maxDiffLines);
  for (const line of bounded.diff.split("\n")) {
    expect(line.length).toBeLessThanOrEqual(WORKSPACE_LIMITS.maxLineLength);
  }

  const binaryExec = fakeExec({
    "diff HEAD --numstat -- logo.png": "-\t-\tlogo.png",
    "diff HEAD -- logo.png": ""
  });
  const binary = await buildDiff("C:\\proj", "logo.png", binaryExec);
  expect(binary.kind).toBe("binary");

  const untrackedExec = fakeExec({
    "diff HEAD --numstat -- new.txt": ""
  });
  const untracked = await buildDiff("C:\\proj", "new.txt", untrackedExec);
  expect(untracked.kind).toBe("untracked");
});

test("git failures surface the stable unavailable code", async () => {
  const exec = async () => ({ stdout: "", stderr: "fatal: not a git repository", exitCode: 128 });
  const listing = await collectStatus("C:\\proj", exec);
  expect(listing.code).toBe("WORKSPACE_UNAVAILABLE");
});
