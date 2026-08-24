import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryAddPreview } from "../src/memory-proposal-preview";
import { harnessProjectId } from "../src/harness-store";
import { HarnessMutationExecutor } from "../src/harness-mutation-executor";
import type { MutationApproval } from "../src/harness-mutation-contracts";

const MUTATION_MODULES = [
  "harness-mutation-contracts.ts",
  "harness-atomic-file.ts",
  "harness-snapshot.ts",
  "harness-mutation-executor.ts",
  "harness-mutation-service.ts"
] as const;
const ALLOWED_IMPORTS = new Set([
  "node:crypto",
  "node:fs/promises",
  "node:path"
]);
const APPROVAL: MutationApproval = {
  approvedBy: "boundary-test",
  reason: "Boundary test approval"
};

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("mutation modules stay inside the offline import allowlist", async () => {
  for (const file of MUTATION_MODULES) {
    const source = await readFile(resolve(import.meta.dir, "../src", file), "utf8");
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const allowed = ALLOWED_IMPORTS.has(specifier)
        || /^\.\/(?:harness|proposal|memory)-[a-z-]+$/.test(specifier.replace(/\.ts$/, ""));
      expect(allowed, `${file}: ${specifier}`).toBe(true);
    }
    expect(source, file).not.toMatch(/@oh-my-pi|session-service|host-server|live\.js|src-tauri|\bsrc\//i);
    if (file === "harness-mutation-service.ts") {
      // The service orchestrates only; the executor stays the sole filesystem writer.
      expect(source, file).not.toMatch(/node:fs|writeFile|mkdir|createWriteStream/i);
    }
  }
});

test("the Stage 3C mutation seam stays out of generic routing surfaces", async () => {
  const paths = [
    resolve(import.meta.dir, "../src/contracts.ts"),
    resolve(import.meta.dir, "../../../src/index.html")
  ];
  for (const path of paths) {
    const source = await readFile(path, "utf8");
    expect(source, path).not.toMatch(/harness-mutation|applyMemoryProposal|MutationApproval/);
  }
  const libSource = await readFile(resolve(import.meta.dir, "../../../src-tauri/src/lib.rs"), "utf8");
  for (const requestType of ["harness.preview", "harness.apply", "harness.rollback"]) {
    expect(libSource).toContain(`"${requestType}"`);
  }
  // Mutations travel through the dedicated wrappers only — never send_command.
  expect(libSource).not.toMatch(/send_command[^;]*harness\.(preview|apply|rollback)/);
});

test("apply and rollback leave source-session sentinels byte-identical", async () => {
  const root = temporaryDirectory("omp-desktop-mutation-boundary-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const sourceSessions = join(root, "source-sessions");
  const sentinelPaths = [
    join(sourceSessions, "session-a.jsonl"),
    join(sourceSessions, "nested", "session-b.jsonl")
  ];
  await mkdir(project, { recursive: true });
  await mkdir(join(sourceSessions, "nested"), { recursive: true });
  await writeFile(sentinelPaths[0], "source session A\n", "utf8");
  await writeFile(sentinelPaths[1], "source session B\n", "utf8");
  const before = await Promise.all(sentinelPaths.map((path) => readFile(path)));

  const preview = createMemoryAddPreview({
    projectId: harnessProjectId(project),
    compatibility: { runtimeVersion: "17.4.1", hostProtocol: 1 },
    title: "Boundary memory",
    content: "Persist only inside the harness-owned project store.",
    scope: "project",
    evidence: [{ kind: "test", reference: "boundary", summary: "Sentinel remains unchanged" }],
    createdAt: "2026-08-23T00:00:00.000Z"
  });
  const executor = new HarnessMutationExecutor(project, dataRoot);
  const applied = await executor.applyMemoryProposal({ preview, approval: APPROVAL });
  expect(applied.status).toBe("applied");
  const rolledBack = await executor.rollbackToLatestSnapshot("boundary rollback");
  expect(rolledBack.status).toBe("rolled-back");

  const after = await Promise.all(sentinelPaths.map((path) => readFile(path)));
  expect(after.map((bytes) => bytes.toString())).toEqual(before.map((bytes) => bytes.toString()));
});
