import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defaultHarnessDataRoot, HarnessStore, resolveHarnessStorePath } from "./harness-store";
import type { HarnessCompatibility, HarnessInspection, HarnessKnowledgeEntry, HarnessProposal, HarnessState } from "./harness-contracts";
import type { ApplyOutcome, ApplyRequest, MutationApproval, RollbackOutcome } from "./harness-mutation-contracts";
import { sweepOrphanTempFiles, writeFileAtomic } from "./harness-atomic-file";
import { loadSnapshotBytes, persistSnapshot, pruneSnapshotRing, quarantineSnapshot, retainedSnapshotRing, verifySnapshotIntegrity } from "./harness-snapshot";
import { PROPOSAL_DIGEST_SCHEMA_VERSION, type MemoryProposalDigestPayload, type MemoryProposalInput, type MemoryProposalPreview } from "./proposal-contracts";
import { digestCanonicalProposal } from "./proposal-digest";
import { evaluateMemoryProposalPolicy } from "./proposal-policy";
const PINNED_COMPATIBILITY: HarnessCompatibility = { runtimeVersion: "17.4.1", hostProtocol: 1 };
export class HarnessMutationExecutor {
  private readonly projectPath: string;
  private readonly dataRoot: string;
  private readonly storePath: string;
  private readonly projectDirectory: string;
  private readonly verifyWrite: (projectPath: string, dataRoot: string) => Promise<HarnessInspection>;
  constructor(projectPath: string, dataRoot = defaultHarnessDataRoot(), verifyWrite: (projectPath: string, dataRoot: string) => Promise<HarnessInspection> = (path, root) => new HarnessStore(path, root).inspect()) {
    this.projectPath = projectPath; this.dataRoot = dataRoot;
    this.storePath = resolveHarnessStorePath(projectPath, dataRoot); this.projectDirectory = dirname(this.storePath); this.verifyWrite = verifyWrite;
  }
  async applyMemoryProposal(request: ApplyRequest): Promise<ApplyOutcome> {
    const approvalError = validateApproval(request?.approval);
    if (approvalError !== null) return rejected(approvalError);
    const preview = request.preview;
    if (preview.after.scope !== "project") return rejected("APPLY_GLOBAL_SCOPE_UNSUPPORTED");
    const binding = validatePreviewBinding(preview);
    if (binding !== null) return rejected(binding);
    const policy = evaluateMemoryProposalPolicy(createProposalInput(preview));
    if (!policy.accepted) return frozen({ status: "rejected", code: "APPLY_POLICY_REJECTED", detail: policy.codes });
    let currentInspection: HarnessInspection;
    try { currentInspection = await this.verifyWrite(this.projectPath, this.dataRoot); }
    catch (error: unknown) { if (isCompatibilityError(error)) return rejected("APPLY_STATE_INCOMPATIBLE"); throw error; }
    const current = currentInspection.state;
    if (preview.projectId !== current.projectId || !isPinnedCompatibility(current.compatibility) || !isPinnedCompatibility(preview.after.compatibility)) {
      return rejected(preview.projectId !== current.projectId ? "APPLY_PREVIEW_FORGED" : "APPLY_STATE_INCOMPATIBLE");
    }
    const replay = findReplay(current, preview.proposal);
    if (replay === "collision") return rejected("APPLY_REPLAY_COLLISION");
    if (replay !== null) return frozen({ status: "already-applied", proposalId: preview.proposal.id, snapshotId: current.snapshots.at(-1)?.id ?? "", state: current });
    if (preview.operation === "memory.replace") {
      const targetError = validateReplaceTarget(current, preview);
      if (targetError !== null) return rejected(targetError);
    } else if (preview.operation !== "memory.add") return rejected("APPLY_PREVIEW_FORGED");
    const stateBytes = await this.readCurrentStateBytes(current);
    let stateWriteStarted = false;
    try {
      await sweepOrphanTempFiles(this.projectDirectory);
      const snapshot = await persistSnapshot(this.projectDirectory, stateBytes, "before " + preview.operation, preview.after.updatedAt);
      const allSnapshots = [...current.snapshots, snapshot];
      const nextState = createNextState(current, preview, request.approval, snapshot);
      stateWriteStarted = true;
      await writeFileAtomic(this.storePath, Buffer.from(JSON.stringify(nextState), "utf8"));
      const verified = await this.verifyWrite(this.projectPath, this.dataRoot);
      await pruneSnapshotRing(this.projectDirectory, allSnapshots).catch(() => undefined);
      return frozen({ status: "applied", proposalId: preview.proposal.id, snapshotId: snapshot.id, state: verified.state });
    } catch {
      if (stateWriteStarted) await writeFileAtomic(this.storePath, stateBytes).catch(() => undefined);
      return rejected("APPLY_WRITE_FAILED");
    }
  }
  async rollbackToLatestSnapshot(reason: string): Promise<RollbackOutcome> {
    let inspection: HarnessInspection;
    try { inspection = await this.verifyWrite(this.projectPath, this.dataRoot); }
    catch { return rollbackRejected("ROLLBACK_FAILED"); }
    const latestSnapshot = inspection.state.snapshots.at(-1);
    if (latestSnapshot === undefined) return rollbackRejected("ROLLBACK_NO_SNAPSHOT");
    if (!/^snapshot-[a-f0-9]{24}$/.test(latestSnapshot.id)) return rollbackRejected("ROLLBACK_SNAPSHOT_CORRUPT");
    let snapshotBytes: Uint8Array;
    let restoredState: HarnessState;
    try {
      snapshotBytes = await loadSnapshotBytes(this.projectDirectory, latestSnapshot.id);
      if (!verifySnapshotIntegrity(latestSnapshot, snapshotBytes)) throw new Error("ROLLBACK_SNAPSHOT_HASH_MISMATCH");
      restoredState = parseRestorableState(snapshotBytes, inspection.state);
    } catch {
      try { await quarantineSnapshot(this.projectDirectory, latestSnapshot.id); }
      catch { return rollbackRejected("ROLLBACK_FAILED"); }
      return rollbackRejected("ROLLBACK_SNAPSHOT_CORRUPT");
    }
    let currentBytes: Uint8Array;
    try { currentBytes = await this.readCurrentStateBytes(inspection.state); }
    catch { return rollbackRejected("ROLLBACK_FAILED"); }
    const createdAt = new Date().toISOString();
    const proposalId = latestApprovedProposalId(inspection.state) ?? "manual";
    const rollbackDigest = digestCanonicalProposal({ kind: "rollback", snapshotId: latestSnapshot.id, proposalId, reason, createdAt });
    let rollbackSnapshot: Awaited<ReturnType<typeof persistSnapshot>> | null;
    try {
      await sweepOrphanTempFiles(this.projectDirectory);
      rollbackSnapshot = await persistSnapshot(this.projectDirectory, currentBytes, "before rollback: " + reason, createdAt);
    } catch {
      rollbackSnapshot = null;
    }
    if (rollbackSnapshot === null) return rollbackRejected("ROLLBACK_FAILED");
    const allSnapshots = [...restoredState.snapshots, rollbackSnapshot];
    const nextState: HarnessState = {
      ...restoredState,
      refinementHistory: [...restoredState.refinementHistory, { id: "history-" + rollbackDigest.sha256.slice(0, 24), proposalId, outcome: "reverted", reason, createdAt }],
      snapshots: retainedSnapshotRing(allSnapshots)
    };
    let stateWriteStarted = false;
    try {
      stateWriteStarted = true;
      await writeFileAtomic(this.storePath, Buffer.from(JSON.stringify(nextState), "utf8"));
      const verified = await this.verifyWrite(this.projectPath, this.dataRoot);
      await pruneSnapshotRing(this.projectDirectory, allSnapshots).catch(() => undefined);
      return rollbackApplied(latestSnapshot.id, verified.state);
    } catch {
      if (stateWriteStarted) await writeFileAtomic(this.storePath, currentBytes).catch(() => undefined);
      return rollbackRejected("ROLLBACK_FAILED");
    }
  }
  private async readCurrentStateBytes(state: HarnessState): Promise<Uint8Array> {
    try { return await readFile(this.storePath); }
    catch (error: unknown) { if (!isMissingFile(error)) throw error; return Buffer.from(JSON.stringify(state), "utf8"); }
  }
}
function validateApproval(approval: MutationApproval | null | undefined): "APPLY_APPROVAL_REQUIRED" | null {
  if (approval === null || typeof approval !== "object") return "APPLY_APPROVAL_REQUIRED";
  if (typeof approval.approvedBy !== "string" || approval.approvedBy.trim().length === 0 || typeof approval.reason !== "string" || approval.reason.trim().length === 0) return "APPLY_APPROVAL_REQUIRED";
  return null;
}
function validatePreviewBinding(preview: MemoryProposalPreview): "APPLY_PREVIEW_DIGEST_MISMATCH" | "APPLY_PREVIEW_FORGED" | null {
  const payload: MemoryProposalDigestPayload = { kind: "proposal", schemaVersion: PROPOSAL_DIGEST_SCHEMA_VERSION, payload: { projectId: preview.projectId, operation: preview.operation, targetId: preview.proposal.targetId, memory: { title: preview.after.title, content: preview.after.content, scope: preview.after.scope, compatibility: preview.after.compatibility, evidence: preview.after.evidence } } };
  const digest = digestCanonicalProposal(payload);
  if (digest.sha256 !== preview.digest.sha256) return "APPLY_PREVIEW_DIGEST_MISMATCH";
  const expectedProposalId = "proposal-" + digest.sha256.slice(0, 24);
  const expectedMemoryId = "memory-" + digest.sha256.slice(0, 24);
  if (preview.proposal.id !== expectedProposalId) return "APPLY_PREVIEW_FORGED";
  const expectedTargetId = preview.operation === "memory.add" ? null : preview.before?.id ?? null;
  const expectedSummary = (preview.operation === "memory.add" ? "Add" : "Replace") + " memory: " + preview.after.title;
  if (!preview.readOnly || preview.persisted || preview.activated || preview.applied || preview.after.status !== "proposed" || preview.proposal.kind !== "memory" || preview.proposal.status !== "proposed" || preview.proposal.targetId !== expectedTargetId || preview.proposal.summary !== expectedSummary || preview.proposal.proposedValue !== preview.after.content || JSON.stringify(preview.proposal.evidence) !== JSON.stringify(preview.after.evidence) || preview.proposal.createdAt !== preview.after.updatedAt) return "APPLY_PREVIEW_FORGED";
  if (preview.operation === "memory.add" && preview.after.id !== expectedMemoryId) return "APPLY_PREVIEW_FORGED";
  if (preview.operation === "memory.replace" && preview.after.id !== preview.proposal.targetId) return "APPLY_PREVIEW_FORGED";
  return null;
}
function createProposalInput(preview: MemoryProposalPreview): MemoryProposalInput {
  return { operation: preview.operation, projectId: preview.projectId, compatibility: preview.after.compatibility, target: preview.before, title: preview.after.title, content: preview.after.content, scope: preview.after.scope, evidence: preview.after.evidence, createdAt: preview.after.updatedAt };
}
function createNextState(current: HarnessState, preview: MemoryProposalPreview, approval: MutationApproval, snapshot: HarnessState["snapshots"][number]): HarnessState {
  const memory: HarnessKnowledgeEntry = { ...preview.after, status: "active" };
  const proposal: HarnessProposal = { ...preview.proposal, status: "approved" };
  const memories = preview.operation === "memory.add" ? [...current.memories, memory] : current.memories.map((entry) => entry.id === memory.id ? memory : entry);
  const allSnapshots = [...current.snapshots, snapshot];
  return { ...current, memories, proposals: [...current.proposals, proposal], refinementHistory: [...current.refinementHistory, { id: "history-" + preview.digest.sha256.slice(0, 24), proposalId: proposal.id, outcome: "approved", reason: approval.reason, createdAt: preview.after.updatedAt }], snapshots: retainedSnapshotRing(allSnapshots) };
}
function validateReplaceTarget(state: HarnessState, preview: MemoryProposalPreview): "APPLY_TARGET_MISSING" | "APPLY_STALE_TARGET" | null {
  const targetId = preview.proposal.targetId;
  if (targetId === null) return "APPLY_TARGET_MISSING";
  const target = state.memories.find((entry) => entry.id === targetId);
  if (target === undefined) return "APPLY_TARGET_MISSING";
  return preview.before === null || target.status !== "active" || target.updatedAt !== preview.before.updatedAt ? "APPLY_STALE_TARGET" : null;
}
function findReplay(state: HarnessState, proposal: HarnessProposal): HarnessProposal | "collision" | null {
  const existing = state.proposals.find((candidate) => candidate.id === proposal.id);
  if (existing === undefined) return null;
  if (existing.status !== "approved") return "collision";
  return existing.kind === proposal.kind && existing.targetId === proposal.targetId && existing.summary === proposal.summary && existing.proposedValue === proposal.proposedValue && JSON.stringify(existing.evidence) === JSON.stringify(proposal.evidence) ? existing : "collision";
}
function isPinnedCompatibility(value: HarnessCompatibility): boolean {
  return value.runtimeVersion === PINNED_COMPATIBILITY.runtimeVersion && value.hostProtocol === PINNED_COMPATIBILITY.hostProtocol;
}
function rejected(code: "APPLY_APPROVAL_REQUIRED" | "APPLY_GLOBAL_SCOPE_UNSUPPORTED" | "APPLY_PREVIEW_DIGEST_MISMATCH" | "APPLY_PREVIEW_FORGED" | "APPLY_REPLAY_COLLISION" | "APPLY_STATE_INCOMPATIBLE" | "APPLY_TARGET_MISSING" | "APPLY_STALE_TARGET" | "APPLY_WRITE_FAILED"): ApplyOutcome {
  return Object.freeze({ status: "rejected", code });
}
function rollbackApplied(snapshotId: string, state: HarnessState): RollbackOutcome { return Object.freeze({ status: "rolled-back", snapshotId, state }); }
function rollbackRejected(code: "ROLLBACK_NO_SNAPSHOT" | "ROLLBACK_SNAPSHOT_CORRUPT" | "ROLLBACK_FAILED"): RollbackOutcome { return Object.freeze({ status: "rejected", code }); }
function frozen<T extends ApplyOutcome>(outcome: T): T { return Object.freeze(outcome); }
function isMissingFile(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
function isCompatibilityError(error: unknown): boolean { return error instanceof Error && error.message === "HARNESS_INCOMPATIBLE"; }
function latestApprovedProposalId(state: HarnessState): string | null {
  for (let index = state.proposals.length - 1; index >= 0; index -= 1) if (state.proposals[index]?.status === "approved") return state.proposals[index]?.id ?? null;
  return null;
}
function parseRestorableState(bytes: Uint8Array, current: HarnessState): HarnessState {
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (!isRecord(parsed) || parsed.schemaVersion !== current.schemaVersion || parsed.projectId !== current.projectId || parsed.projectPath !== current.projectPath || !Array.isArray(parsed.refinementHistory) || !Array.isArray(parsed.snapshots)) throw new Error("ROLLBACK_SNAPSHOT_STATE_INVALID");
  return parsed as HarnessState;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
