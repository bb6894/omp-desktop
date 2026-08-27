import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveProfilePaths } from "../src/profile-paths";

test("derives a project session directory and isolated desktop child", () => {
  const root = mkdtempSync(join(tmpdir(), "omp-desktop-path-test-"));
  const result = resolveProfilePaths(join(root, "repo"), join(root, "profile"));
  expect(result.profileDir).toBe(join(root, "profile"));
  expect(result.terminalSessionsDir).toContain(join(root, "profile", "sessions"));
  expect(result.desktopSessionsDir).toBe(result.terminalSessionsDir + "\\desktop-sessions");
  expect(result.desktopSessionsDir).not.toBe(result.terminalSessionsDir);
});

test("rejects a relative profile path", () => {
  expect(() => resolveProfilePaths("C:\\work\\repo", ".omp\\agent")).toThrow("PATH_MUST_BE_ABSOLUTE");
});
