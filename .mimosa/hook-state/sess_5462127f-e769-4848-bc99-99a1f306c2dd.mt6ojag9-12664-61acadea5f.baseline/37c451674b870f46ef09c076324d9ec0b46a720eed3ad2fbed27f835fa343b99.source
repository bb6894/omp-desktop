import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { HarnessEvidence, HarnessKnowledgeEntry } from "../src/harness-contracts";
import {
  createEmptyHarnessState,
  HarnessStore,
  harnessProjectId,
  resolveHarnessStorePath
} from "../src/harness-store";
import { HarnessMutationExecutor } from "../src/harness-mutation-executor";
import { HarnessMutationService } from "../src/harness-mutation-service";
import type {
  ApplyOutcome,
  ApplyRequest,
  HarnessMutationApi,
  HarnessMutationExecutorApi,
  RollbackOutcome
} from "../src/harness-mutation-contracts";
import type { MemoryProposalPreview } from "../src/proposal-contracts";

const COMPATIBILITY = { runtimeVersion: "17.4.1", hostProtocol: 1 } as const;
const FIXED_NOW = new Date("2026-08-24T08:30:00.000Z");
const REVIEW_EVIDENCE: readonly HarnessEvidence[] = [
  { kind: "user-feedback", reference: "desktop://human-governed-review", summary: "Submitted through the desktop proposal review flow" }
];
const SENTINELS: readonly string[] = [
  "TOPSECRETPAYLOAD99",
  "C:\\Users\\leaky\\path",
  "leak-title-marker",
  "leak-reason-marker",
  "leak-approver-marker"
];

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createService(
  project: string,
  dataRoot: string,
  executor: HarnessMutationExecutorApi = new HarnessMutationExecutor(project, dataRoot),
  clock: () => Date = () => FIXED_NOW
): HarnessMutationApi {
  return new HarnessMutationService(project, new HarnessStore(project, dataRoot), executor, clock);
}

function activeTarget(): HarnessKnowledgeEntry {
  return {
    id: "memory-existing",
    title: "Existing memory",
    content: "Keep the old approved rule.",
    scope: "project",
    status: "active",
    evidence: REVIEW_EVIDENCE,
    compatibility: COMPATIBILITY,
    updatedAt: "2026-08-22T00:00:00.000Z"
  };
}

async function writeState(project: string, dataRoot: string, state: ReturnType<typeof createEmptyHarnessState>): Promise<string> {
  const statePath = resolveHarnessStorePath(project, dataRoot);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state), "utf8");
  return statePath;
}

function recordingExecutor(applyResult: ApplyOutcome, rollbackResult: RollbackOutcome): { api: HarnessMutationExecutorApi; applies: ApplyRequest[]; rollbacks: string[] } {
  const applies: ApplyRequest[] = [];
  const rollbacks: string[] = [];
  return {
    api: {
      applyMemoryProposal: async (request) => { applies.push(request); return applyResult; },
      rollbackToLatestSnapshot: async (reason) => { rollbacks.push(reason); return rollbackResult; }
    },
    applies,
    rollbacks
  };
}

function expectNoSecretEcho(outcome: unknown): void {
  const serialized = JSON.stringify(outcome) ?? "";
  for (const sentinel of SENTINELS) {
    expect(serialized).not.toContain(sentinel);
  }
}

test("previews a memory.add bound to the host project with pinned context and static evidence", async () => {
  const root = temporaryDirectory("omp-desktop-service-add-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");

  const outcome = await createService(project, dataRoot).preview({
    operation: "memory.add",
    title: "Pin review rules",
    content: "Every approved rule keeps a snapshot."
  });

  expect(outcome.status).toBe("previewed");
  if (outcome.status !== "previewed") throw new Error("expected a previewed outcome");
  const preview = outcome.preview;
  expect(preview.projectId).toBe(harnessProjectId(project));
  expect(preview.after.scope).toBe("project");
  expect(preview.after.compatibility).toEqual(COMPATIBILITY);
  expect(preview.after.updatedAt).toBe(FIXED_NOW.toISOString());
  expect(preview.proposal.createdAt).toBe(FIXED_NOW.toISOString());
  expect(preview.before).toBeNull();
  expect(preview.readOnly).toBe(true);
  expect(preview.persisted).toBe(false);
  expect(preview.applied).toBe(false);
  expect(preview.after.evidence).toEqual(REVIEW_EVIDENCE);
  expect(preview.proposal.evidence).toEqual(REVIEW_EVIDENCE);
  const storePath = resolveHarnessStorePath(project, dataRoot);
  expect(existsSync(storePath)).toBe(false);
  expect(existsSync(join(dirname(storePath), "snapshots"))).toBe(false);
});

test("previews a memory.replace whose target is resolved from current active memories", async () => {
  const root = temporaryDirectory("omp-desktop-service-replace-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const target = activeTarget();
  await writeState(project, dataRoot, { ...createEmptyHarnessState(project), memories: [target] });
  const beforeBytes = await readFile(resolveHarnessStorePath(project, dataRoot));

  const outcome = await createService(project, dataRoot).preview({
    operation: "memory.replace",
    title: "Replace the old rule",
    content: "The replacement rule stays reversible.",
    targetId: target.id
  });

  expect(outcome.status).toBe("previewed");
  if (outcome.status !== "previewed") throw new Error("expected a previewed outcome");
  expect(outcome.preview.before?.id).toBe(target.id);
  expect(outcome.preview.before?.updatedAt).toBe(target.updatedAt);
  expect(outcome.preview.after.id).toBe(target.id);
  expect(outcome.preview.proposal.targetId).toBe(target.id);
  expect((await readFile(resolveHarnessStorePath(project, dataRoot))).equals(beforeBytes)).toBe(true);
});

test("rejects replace previews when the target is missing or not active", async () => {
  const variants = [
    { label: "missing", memories: [], code: "HARNESS_TARGET_NOT_FOUND" },
    { label: "inactive", memories: [{ ...activeTarget(), status: "reverted" as const }], code: "HARNESS_TARGET_INACTIVE" }
  ];
  for (const variant of variants) {
    const root = temporaryDirectory(`omp-desktop-service-target-${variant.label}-`);
    const project = join(root, "repo");
    const dataRoot = join(root, "local-app-data");
    await writeState(project, dataRoot, { ...createEmptyHarnessState(project), memories: variant.memories });

    const outcome = await createService(project, dataRoot).preview({
      operation: "memory.replace",
      title: "Replace leak-title-marker",
      content: "Body text.",
      targetId: activeTarget().id
    });

    expect(outcome, variant.label).toEqual({ status: "rejected", code: variant.code });
    expectNoSecretEcho(outcome);
  }
});

test("rejects malformed preview payloads with renderer context fields and never touches the store", async () => {
  const root = temporaryDirectory("omp-desktop-service-invalid-preview-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const statePath = await writeState(project, dataRoot, createEmptyHarnessState(project));
  const beforeBytes = await readFile(statePath);
  const base = { operation: "memory.add", title: "Valid title", content: "Valid content." };
  const requests: unknown[] = [
    null,
    "add",
    42,
    [],
    {},
    { ...base, operation: "memory.delete" },
    { ...base, projectId: "0".repeat(32) },
    { ...base, cwd: "C:\\Users\\leaky\\path" },
    { ...base, scope: "global" },
    { ...base, compatibility: COMPATIBILITY },
    { ...base, createdAt: "2026-01-01T00:00:00.000Z" },
    { ...base, evidence: REVIEW_EVIDENCE },
    { ...base, digest: "forged" },
    { ...base, snapshotPath: "C:\\snap" },
    { ...base, targetId: "memory-extra" },
    { operation: "memory.add", content: "Missing title." },
    { operation: "memory.add", title: "Missing content." },
    { ...base, title: "   \t\n " },
    { ...base, content: null },
    { ...base, title: 7 },
    { ...base, content: "x".repeat(17 * 1024) },
    { operation: "memory.replace", title: "No target", content: "Body." },
    {
      operation: "memory.replace",
      title: "Blank target",
      content: "Body.",
      targetId: "  \t "
    },
    {
      operation: "memory.add",
      title: "Constructor key",
      content: "Body.",
      constructor: {}
    }
  ];

  const service = createService(project, dataRoot);
  for (const [index, request] of requests.entries()) {
    const outcome = await service.preview(request);
    expect(outcome, `request index ${index}`).toEqual({ status: "rejected", code: "HARNESS_MUTATION_INVALID_REQUEST" });
    expectNoSecretEcho(outcome);
  }
  expect((await readFile(statePath)).equals(beforeBytes)).toBe(true);
  expect(existsSync(join(dirname(statePath), "snapshots"))).toBe(false);
});

test("keeps digests deterministic per fixed binding and isolates later request mutations", async () => {
  const root = temporaryDirectory("omp-desktop-service-digest-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const service = createService(project, dataRoot);
  const payload = { operation: "memory.add", title: "Deterministic", content: "Same input yields same digest." };

  const first = await service.preview(payload);
  const second = await service.preview(payload);
  if (first.status !== "previewed" || second.status !== "previewed") throw new Error("expected two previews");
  expect(second.preview.digest.sha256).toBe(first.preview.digest.sha256);

  payload.title = "Mutated after preview";
  payload.content = "Changed after the fact.";
  expect(first.preview.after.title).toBe("Deterministic");
  expect(first.preview.after.content).toBe("Same input yields same digest.");
  expect(() => { (first.preview.after as { content: string }).content = "tampered"; }).toThrow();
  const third = await service.preview(payload);
  if (third.status !== "previewed") throw new Error("expected a previewed outcome");
  expect(third.preview.digest.sha256).not.toBe(first.preview.digest.sha256);
});

test("returns a stable redacted code when the live state cannot be inspected", async () => {
  const root = temporaryDirectory("omp-desktop-service-inaccessible-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  await writeState(project, dataRoot, createEmptyHarnessState(project));
  const service = new HarnessMutationService(
    project,
    { inspect: async () => { throw new Error("HARNESS_STATE_TOO_LARGE"); } },
    new HarnessMutationExecutor(project, dataRoot),
    () => FIXED_NOW
  );

  const outcome = await service.preview({ operation: "memory.add", title: "Title", content: "Content." });

  expect(outcome).toEqual({ status: "rejected", code: "HARNESS_STATE_INACCESSIBLE" });
});

test("maps builder policy rejections to enum-only codes without echoing the secret", async () => {
  const root = temporaryDirectory("omp-desktop-service-policy-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");

  const outcome = await createService(project, dataRoot).preview({
    operation: "memory.add",
    title: "Store the credential",
    content: 'api_key = "TOPSECRETPAYLOAD99"'
  });

  expect(outcome).toEqual({ status: "rejected", code: "PREVIEW_POLICY_REJECTED", detail: ["PROPOSAL_SECRET_DETECTED"] });
  expectNoSecretEcho(outcome);
});

test("delegates apply with the exact cached preview object and approval", async () => {
  const root = temporaryDirectory("omp-desktop-service-apply-delegate-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const applied: ApplyOutcome = { status: "applied", proposalId: "", snapshotId: "snapshot-" + "a".repeat(24), state: createEmptyHarnessState(project) };
  const recorded = recordingExecutor(applied, { status: "rejected", code: "ROLLBACK_NO_SNAPSHOT" });
  // One service issues AND applies: the cache belongs to the issuing instance.
  const service = createService(project, dataRoot, recorded.api);
  const previewed = await service.preview({ operation: "memory.add", title: "Delegate me", content: "Exact object handoff." });
  if (previewed.status !== "previewed") throw new Error("expected a previewed outcome");
  applied.proposalId = previewed.preview.proposal.id;
  const approval = { approvedBy: "human-reviewer", reason: "Approved after reading the preview" };

  const outcome = await service.apply({ preview: previewed.preview, approval });

  expect(outcome).toEqual(applied);
  expect(recorded.applies).toHaveLength(1);
  // The cached original — not a renderer-supplied copy or re-stamped variant —
  // travels to the executor, so the reviewed t1 preview is exactly what lands.
  expect(recorded.applies[0].preview).toBe(previewed.preview);
  expect(recorded.applies[0].preview.after.updatedAt).toBe(FIXED_NOW.toISOString());
  expect(recorded.applies[0].approval).toEqual(approval);
});

test("a preview tampered after issuance is rejected without delegation or writes", async () => {
  const root = temporaryDirectory("omp-desktop-service-tamper-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  await writeState(project, dataRoot, createEmptyHarnessState(project));
  const beforeBytes = await readFile(resolveHarnessStorePath(project, dataRoot));
  const previewed = await createService(project, dataRoot).preview({
    operation: "memory.add",
    title: "Tamper probe",
    content: "Any post-issuance edit must fail closed."
  });
  if (previewed.status !== "previewed") throw new Error("expected a previewed outcome");
  const recorded = recordingExecutor(
    { status: "rejected", code: "APPLY_WRITE_FAILED" },
    { status: "rejected", code: "ROLLBACK_FAILED" }
  );
  const service = createService(project, dataRoot, recorded.api);
  const approval = { approvedBy: "human-reviewer", reason: "Approved the untampered preview" };
  const variants = [
    (() => { const copy = structuredClone(previewed.preview); (copy.after as { updatedAt: string }).updatedAt = "2020-01-01T00:00:00.000Z"; return copy; })(),
    (() => { const copy = structuredClone(previewed.preview); (copy.after as { updatedAt: string }).updatedAt = "2020-01-01T00:00:00.000Z"; (copy.proposal as { createdAt: string }).createdAt = "2020-01-01T00:00:00.000Z"; return copy; })(),
    (() => { const copy = structuredClone(previewed.preview); (copy.after as { content: string }).content += " smuggled suffix"; return copy; })()
  ];

  for (const [index, preview] of variants.entries()) {
    const outcome = await service.apply({ preview, approval });
    expect(outcome, `variant ${index}`).toEqual({ status: "rejected", code: "APPLY_PREVIEW_UNISSUED" });
  }
  expect(recorded.applies).toHaveLength(0);
  expect((await readFile(resolveHarnessStorePath(project, dataRoot))).equals(beforeBytes)).toBe(true);
});

test("structurally incomplete previews fail with the stable code and never reach the executor", async () => {
  const root = temporaryDirectory("omp-desktop-service-malformed-preview-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const source = createService(project, dataRoot);
  const previewed = await source.preview({ operation: "memory.add", title: "Shape probe", content: "Body." });
  if (previewed.status !== "previewed") throw new Error("expected a previewed outcome");
  const base = previewed.preview;
  const recorded = recordingExecutor(
    { status: "rejected", code: "APPLY_WRITE_FAILED" },
    { status: "rejected", code: "ROLLBACK_FAILED" }
  );
  const service = createService(project, dataRoot, recorded.api);
  const approval = { approvedBy: "human-reviewer", reason: "Valid approval on purpose" };
  const malformedPreviews: unknown[] = [
    null,
    {},
    { after: { scope: "project" }, proposal: {} },
    { ...base, readOnly: false },
    { ...base, persisted: true },
    { ...base, operation: "memory.delete" },
    { ...base, projectId: 42 },
    { ...base, before: {} },
    { ...base, after: { scope: "project" } },
    { ...base, proposal: {} },
    { ...base, digest: { algorithm: "sha256", sha256: "not-a-digest", canonicalJson: "{}" } },
    { ...base, policy: { accepted: false, codes: [] } }
  ];

  for (const [index, preview] of malformedPreviews.entries()) {
    const outcome = await service.apply({ preview, approval });
    expect(outcome, `malformed preview ${index}`).toEqual({ status: "rejected", code: "HARNESS_MUTATION_INVALID_REQUEST" });
  }
  expect(recorded.applies).toHaveLength(0);
});

test("a well-formed preview from another host instance is treated as unissued", async () => {
  const root = temporaryDirectory("omp-desktop-service-unissued-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const issuer = createService(project, dataRoot);
  const outsider = createService(project, dataRoot);
  const previewed = await issuer.preview({ operation: "memory.add", title: "Foreign host", content: "Never cached here." });
  if (previewed.status !== "previewed") throw new Error("expected a previewed outcome");

  const outcome = await outsider.apply({
    preview: previewed.preview,
    approval: { approvedBy: "human-reviewer", reason: "Approved after review" }
  });

  expect(outcome).toEqual({ status: "rejected", code: "APPLY_PREVIEW_UNISSUED" });
});

test("rejects malformed apply payloads before reaching the executor", async () => {
  const root = temporaryDirectory("omp-desktop-service-apply-invalid-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const recorded = recordingExecutor(
    { status: "rejected", code: "APPLY_WRITE_FAILED" },
    { status: "rejected", code: "ROLLBACK_FAILED" }
  );
  const service = createService(project, dataRoot, recorded.api);
  const junkPreview = { stale: true } as unknown;
  const validApproval = { approvedBy: "human-reviewer", reason: "Approved after review" };
  const requests: ReadonlyArray<readonly [string, unknown, string]> = [
    ["missing everything", null, "HARNESS_MUTATION_INVALID_REQUEST"],
    ["missing approval", { preview: junkPreview }, "HARNESS_MUTATION_INVALID_REQUEST"],
    ["extra top-level field", { preview: junkPreview, approval: validApproval, cwd: "C:\\x" }, "HARNESS_MUTATION_INVALID_REQUEST"],
    ["approval not a record", { preview: junkPreview, approval: "yes" }, "APPLY_APPROVAL_REQUIRED"],
    ["blank approvedBy", { preview: junkPreview, approval: { approvedBy: "  ", reason: "r" } }, "APPLY_APPROVAL_REQUIRED"],
    ["missing reason", { preview: junkPreview, approval: { approvedBy: "u" } }, "APPLY_APPROVAL_REQUIRED"],
    ["approval extra key", { preview: junkPreview, approval: { ...validApproval, delegatedBy: "model" } }, "APPLY_APPROVAL_REQUIRED"],
    ["overlong reason", { preview: junkPreview, approval: { approvedBy: "u", reason: "r".repeat(17 * 1024) } }, "APPLY_APPROVAL_REQUIRED"]
  ];

  for (const [label, request, code] of requests) {
    const outcome = await service.apply(request);
    expect(outcome, label).toEqual({ status: "rejected", code });
    expectNoSecretEcho(outcome);
  }
  expect(recorded.applies).toHaveLength(0);
  expect(existsSync(resolveHarnessStorePath(project, dataRoot))).toBe(false);
});

test("delegates rollback with only the validated reason and rejects malformed payloads", async () => {
  const root = temporaryDirectory("omp-desktop-service-rollback-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const rolledBack: RollbackOutcome = { status: "rolled-back", snapshotId: "snapshot-" + "b".repeat(24), state: createEmptyHarnessState(project) };
  const recorded = recordingExecutor({ status: "rejected", code: "APPLY_WRITE_FAILED" }, rolledBack);
  const service = createService(project, dataRoot, recorded.api);

  const outcome = await service.rollback({ reason: "user requested revert" });
  expect(outcome).toEqual(rolledBack);
  expect(recorded.rollbacks).toEqual(["user requested revert"]);

  const invalidRequests: unknown[] = [
    null,
    {},
    { reason: "" },
    { reason: "   " },
    { reason: 9 },
    { reason: "valid", snapshotPath: "C:\\snap" }
  ];
  for (const [index, request] of invalidRequests.entries()) {
    const rejected = await service.rollback(request);
    expect(rejected, `rollback request index ${index}`).toEqual({
      status: "rejected",
      code: "HARNESS_MUTATION_INVALID_REQUEST"
    });
  }
  expect(recorded.rollbacks).toHaveLength(1);
});

test("an applied service preview survives the real executor end to end and replays idempotently", async () => {
  const root = temporaryDirectory("omp-desktop-service-e2e-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const service = createService(project, dataRoot);
  const previewed = await service.preview({ operation: "memory.add", title: "End-to-end rule", content: "Applied through service and executor." });
  if (previewed.status !== "previewed") throw new Error("expected a previewed outcome");
  const approval = { approvedBy: "human-reviewer", reason: "Approved in the desktop review flow" };

  const applied = await service.apply({ preview: previewed.preview, approval });
  expect(applied.status).toBe("applied");

  // The cache retains issued previews after a successful apply so an identical
  // resubmission reaches the executor's already-applied path instead of UNISSUED.
  const replay = await service.apply({ preview: previewed.preview, approval });
  expect(replay).toMatchObject({ status: "already-applied", proposalId: previewed.preview.proposal.id });

  const inspection = await new HarnessStore(project, dataRoot).inspect();
  expect(inspection.state.memories).toHaveLength(1);
  expect(inspection.state.memories[0]).toMatchObject({ id: previewed.preview.after.id, status: "active" });
  expect(inspection.state.proposals[0]).toMatchObject({ id: previewed.preview.proposal.id, status: "approved" });
  expect(inspection.state.refinementHistory[0]).toMatchObject({ outcome: "approved", reason: "Approved in the desktop review flow" });
  expect(inspection.state.snapshots).toHaveLength(1);
});

test("the issued-preview cache is bounded and evicts the oldest entries", async () => {
  const root = temporaryDirectory("omp-desktop-service-cache-ring-");
  const project = join(root, "repo");
  const dataRoot = join(root, "local-app-data");
  const recorded = recordingExecutor(
    { status: "rejected", code: "APPLY_WRITE_FAILED" },
    { status: "rejected", code: "ROLLBACK_FAILED" }
  );
  const service = createService(project, dataRoot, recorded.api);
  const issued: MemoryProposalPreview[] = [];
  for (let index = 0; index < 65; index += 1) {
    const outcome = await service.preview({ operation: "memory.add", title: `Ring ${index}`, content: `Ring rule ${index}.` });
    if (outcome.status === "previewed") issued.push(outcome.preview);
  }
  expect(issued).toHaveLength(65);
  const approval = { approvedBy: "human-reviewer", reason: "Cache ring probe" };

  const evicted = await service.apply({ preview: issued[0], approval });
  expect(evicted).toEqual({ status: "rejected", code: "APPLY_PREVIEW_UNISSUED" });
  // The newest entry is still cached: delegation reaches the recording executor,
  // which returns its canned outcome.
  const retained = await service.apply({ preview: issued[64], approval });
  expect(retained).toEqual({ status: "rejected", code: "APPLY_WRITE_FAILED" });
  expect(recorded.applies).toHaveLength(1);
});
