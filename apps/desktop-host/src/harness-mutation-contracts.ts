import type { HarnessState } from "./harness-contracts";
import type { MemoryProposalPreview, ProposalPolicyCode } from "./proposal-contracts";
export type MutationApproval = Readonly<{ approvedBy: string; reason: string }>;
export type HarnessPreviewRequest =
  | Readonly<{ operation: "memory.add"; title: string; content: string }>
  | Readonly<{ operation: "memory.replace"; title: string; content: string; targetId: string }>;
export type HarnessRollbackRequest = Readonly<{ reason: string }>;
export type ApplyRequest = Readonly<{ preview: MemoryProposalPreview; approval: MutationApproval }>;
export type MutationErrorCode =
  | "APPLY_APPROVAL_REQUIRED" | "APPLY_GLOBAL_SCOPE_UNSUPPORTED" | "APPLY_PREVIEW_DIGEST_MISMATCH"
  | "APPLY_PREVIEW_FORGED" | "APPLY_POLICY_REJECTED" | "APPLY_STALE_TARGET" | "APPLY_TARGET_MISSING"
  | "APPLY_REPLAY_COLLISION" | "APPLY_STATE_INCOMPATIBLE" | "APPLY_WRITE_FAILED"
  | "ROLLBACK_NO_SNAPSHOT" | "ROLLBACK_SNAPSHOT_CORRUPT" | "ROLLBACK_FAILED";
export type ApplyOutcome =
  | Readonly<{ status: "applied" | "already-applied"; proposalId: string; snapshotId: string; state: HarnessState }>
  | Readonly<{ status: "rejected"; code: MutationErrorCode; detail?: readonly ProposalPolicyCode[] }>;
export type RollbackOutcome =
  | Readonly<{ status: "rolled-back"; snapshotId: string; state: HarnessState }>
  | Readonly<{ status: "rejected"; code: "ROLLBACK_NO_SNAPSHOT" | "ROLLBACK_SNAPSHOT_CORRUPT" | "ROLLBACK_FAILED" }>;
export type HarnessPreviewErrorCode =
  | "HARNESS_MUTATION_INVALID_REQUEST" | "HARNESS_TARGET_NOT_FOUND" | "HARNESS_TARGET_INACTIVE"
  | "HARNESS_STATE_INACCESSIBLE" | "PREVIEW_POLICY_REJECTED";
export type PreviewOutcome =
  | Readonly<{ status: "previewed"; preview: MemoryProposalPreview }>
  | Readonly<{ status: "rejected"; code: HarnessPreviewErrorCode; detail?: readonly ProposalPolicyCode[] }>;
export type ApplyWireOutcome =
  | ApplyOutcome
  | Readonly<{ status: "rejected"; code: "HARNESS_MUTATION_INVALID_REQUEST" }>
  | Readonly<{ status: "rejected"; code: "APPLY_PREVIEW_UNISSUED" }>;
export type RollbackWireOutcome = RollbackOutcome | Readonly<{ status: "rejected"; code: "HARNESS_MUTATION_INVALID_REQUEST" }>;
export type HarnessMutationExecutorApi = {
  applyMemoryProposal(request: ApplyRequest): Promise<ApplyOutcome>;
  rollbackToLatestSnapshot(reason: string): Promise<RollbackOutcome>;
};
/** Host-side seam consumed by the request dispatcher; payloads arrive untrusted from the wire. */
export type HarnessMutationApi = {
  preview(payload: unknown): Promise<PreviewOutcome>;
  apply(payload: unknown): Promise<ApplyWireOutcome>;
  rollback(payload: unknown): Promise<RollbackWireOutcome>;
};
