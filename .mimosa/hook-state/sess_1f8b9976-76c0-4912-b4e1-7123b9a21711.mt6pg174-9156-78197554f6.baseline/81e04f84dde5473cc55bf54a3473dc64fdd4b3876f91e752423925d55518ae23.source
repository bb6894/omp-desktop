import type {
  HarnessCompatibility,
  HarnessEvidence,
  HarnessInspection,
  HarnessInspectorApi,
  HarnessKnowledgeEntry
} from "./harness-contracts";
import type {
  ApplyWireOutcome,
  HarnessMutationApi,
  HarnessMutationExecutorApi,
  HarnessPreviewErrorCode,
  HarnessPreviewRequest,
  PreviewOutcome,
  RollbackWireOutcome
} from "./harness-mutation-contracts";
import { harnessProjectId } from "./harness-store";
import type { MemoryProposalPreview } from "./proposal-contracts";
import { ProposalPolicyError } from "./proposal-policy";
import { createMemoryAddPreview, createMemoryReplacePreview } from "./memory-proposal-preview";

const PINNED_COMPATIBILITY: HarnessCompatibility = Object.freeze({ runtimeVersion: "17.4.1", hostProtocol: 1 });
const HUMAN_REVIEW_EVIDENCE: readonly HarnessEvidence[] = [
  Object.freeze({
    kind: "user-feedback",
    reference: "desktop://human-governed-review",
    summary: "Submitted through the desktop proposal review flow"
  })
];
const MAX_TITLE_BYTES = 16 * 1024;
const MAX_CONTENT_BYTES = 16 * 1024;
const MAX_REASON_BYTES = 16 * 1024;
const MAX_IDENTIFIER_CHARS = 128;
const MAX_ISSUED_PREVIEWS = 64;
const INVALID_REQUEST = "HARNESS_MUTATION_INVALID_REQUEST" as const;

/**
 * Host-owned proposal construction: derives projectId, scope, compatibility,
 * timestamp, and static evidence from the fixed process cwd and live store
 * state. Renderer payloads never reach the preview builder unvalidated and
 * this module performs no filesystem writes — the executor stays the sole writer.
 */
export class HarnessMutationService implements HarnessMutationApi {
  /** Frozen previews this Host issued in-process; apply is only possible for these. */
  private readonly issuedPreviews = new Map<string, MemoryProposalPreview>();

  constructor(
    private readonly projectPath: string,
    private readonly inspector: HarnessInspectorApi,
    private readonly executor: HarnessMutationExecutorApi,
    private readonly clock: () => Date = () => new Date()
  ) {}

  async preview(payload: unknown): Promise<PreviewOutcome> {
    const request = parsePreviewPayload(payload);
    if (typeof request === "string") return previewRejected(request);
    let inspection: HarnessInspection;
    try { inspection = await this.inspector.inspect(); }
    catch { return previewRejected("HARNESS_STATE_INACCESSIBLE"); }
    const shared = {
      projectId: harnessProjectId(this.projectPath),
      compatibility: PINNED_COMPATIBILITY,
      scope: "project" as const,
      evidence: HUMAN_REVIEW_EVIDENCE,
      createdAt: this.clock().toISOString()
    };
    try {
      if (request.operation === "memory.add") {
        const preview = createMemoryAddPreview({ ...shared, title: request.title, content: request.content });
        this.rememberIssued(preview);
        return Object.freeze({ status: "previewed", preview });
      }
      const target = resolveTarget(inspection.state.memories, request.targetId);
      if (typeof target === "string") return previewRejected(target);
      const preview = createMemoryReplacePreview({ ...shared, title: request.title, content: request.content, target });
      this.rememberIssued(preview);
      return Object.freeze({ status: "previewed", preview });
    } catch (error: unknown) {
      return policyRejection(error);
    }
  }

  async apply(payload: unknown): Promise<ApplyWireOutcome> {
    const parsed = parseApplyPayload(payload);
    if (parsed === "invalid") return Object.freeze({ status: "rejected" as const, code: INVALID_REQUEST });
    if (parsed === "approval") return Object.freeze({ status: "rejected" as const, code: "APPLY_APPROVAL_REQUIRED" as const });
    // The exact-preview contract is enforced against what THIS Host issued:
    // the submitted preview must be structurally complete and byte-equal to a
    // frozen cached preview, and the cached original — never the renderer's
    // copy — travels to the executor. Host restarts clear the cache, so stale
    // previews fail closed and the user simply re-previews.
    const issued = this.issuedPreviews.get(parsed.preview.digest.sha256);
    if (issued === undefined || !structurallyEqual(parsed.preview, issued)) {
      return Object.freeze({ status: "rejected" as const, code: "APPLY_PREVIEW_UNISSUED" as const });
    }
    return this.executor.applyMemoryProposal({ preview: issued, approval: parsed.approval });
  }

  async rollback(payload: unknown): Promise<RollbackWireOutcome> {
    const reason = parseRollbackPayload(payload);
    if (reason === null) return Object.freeze({ status: "rejected" as const, code: INVALID_REQUEST });
    return this.executor.rollbackToLatestSnapshot(reason);
  }

  private rememberIssued(preview: MemoryProposalPreview): void {
    this.issuedPreviews.set(preview.digest.sha256, preview);
    while (this.issuedPreviews.size > MAX_ISSUED_PREVIEWS) {
      const oldest = this.issuedPreviews.keys().next();
      if (oldest.done) break;
      this.issuedPreviews.delete(oldest.value);
    }
  }
}

function parsePreviewPayload(payload: unknown): HarnessPreviewRequest | typeof INVALID_REQUEST {
  if (!isRecord(payload)) return INVALID_REQUEST;
  if (payload.operation === "memory.add") {
    if (!hasExactKeys(payload, ["operation", "title", "content"])) return INVALID_REQUEST;
    const title = boundedText(payload.title, MAX_TITLE_BYTES);
    const content = boundedText(payload.content, MAX_CONTENT_BYTES);
    if (title === null || content === null) return INVALID_REQUEST;
    return { operation: "memory.add", title, content };
  }
  if (payload.operation === "memory.replace") {
    if (!hasExactKeys(payload, ["operation", "title", "content", "targetId"])) return INVALID_REQUEST;
    const title = boundedText(payload.title, MAX_TITLE_BYTES);
    const content = boundedText(payload.content, MAX_CONTENT_BYTES);
    const targetId = payload.targetId;
    if (title === null || content === null) return INVALID_REQUEST;
    if (typeof targetId !== "string" || targetId.trim().length === 0 || targetId.length > MAX_IDENTIFIER_CHARS) return INVALID_REQUEST;
    return { operation: "memory.replace", title, content, targetId };
  }
  return INVALID_REQUEST;
}

function parseApplyPayload(payload: unknown): ApplyRequest | "invalid" | "approval" {
  if (!isRecord(payload) || !hasExactKeys(payload, ["preview", "approval"])) return "invalid";
  const approval = payload.approval;
  if (!isRecord(approval) || !hasExactKeys(approval, ["approvedBy", "reason"])) return "approval";
  const { approvedBy, reason } = approval;
  if (typeof approvedBy !== "string" || approvedBy.trim().length === 0 || approvedBy.length > MAX_IDENTIFIER_CHARS) return "approval";
  if (typeof reason !== "string" || reason.trim().length === 0 || Buffer.byteLength(reason, "utf8") > MAX_REASON_BYTES) return "approval";
  if (!isWellFormedPreview(payload.preview)) return "invalid";
  return { preview: payload.preview, approval: { approvedBy, reason } };
}

function isWellFormedPreview(value: unknown): value is MemoryProposalPreview {
  return isRecord(value)
    && value.readOnly === true
    && value.persisted === false
    && value.activated === false
    && value.applied === false
    && (value.operation === "memory.add" || value.operation === "memory.replace")
    && typeof value.projectId === "string"
    && (value.before === null || isEntryShape(value.before))
    && isEntryShape(value.after)
    && isProposalShape(value.proposal)
    && isRecord(value.digest)
    && value.digest.algorithm === "sha256"
    && typeof value.digest.sha256 === "string"
    && /^[0-9a-f]{64}$/.test(value.digest.sha256)
    && typeof value.digest.canonicalJson === "string"
    && isRecord(value.policy)
    && value.policy.accepted === true
    && Array.isArray(value.policy.codes);
}

function isEntryShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.content === "string"
    && (value.scope === "project" || value.scope === "global")
    && typeof value.status === "string"
    && Array.isArray(value.evidence)
    && isRecord(value.compatibility)
    && typeof value.compatibility.runtimeVersion === "string"
    && typeof value.compatibility.hostProtocol === "number"
    && typeof value.updatedAt === "string";
}

function isProposalShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && value.kind === "memory"
    && (value.targetId === null || typeof value.targetId === "string")
    && typeof value.summary === "string"
    && typeof value.proposedValue === "string"
    && typeof value.status === "string"
    && Array.isArray(value.evidence)
    && typeof value.createdAt === "string";
}

/** Order-insensitive deep equality; the wire round trip may reorder JSON keys. */
function structurallyEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => structurallyEqual(item, right[index]));
  }
  if (isRecord(left)) {
    if (!isRecord(right)) return false;
    const leftKeys = Object.keys(left);
    return leftKeys.length === Object.keys(right).length
      && leftKeys.every((key) => key in right && structurallyEqual(left[key], right[key]));
  }
  return false;
}

function parseRollbackPayload(payload: unknown): string | null {
  if (!isRecord(payload) || !hasExactKeys(payload, ["reason"])) return null;
  return boundedText(payload.reason, MAX_REASON_BYTES);
}

function resolveTarget(
  memories: readonly HarnessKnowledgeEntry[],
  targetId: string
): HarnessKnowledgeEntry | "HARNESS_TARGET_NOT_FOUND" | "HARNESS_TARGET_INACTIVE" {
  const target = memories.find((entry) => entry.id === targetId);
  if (target === undefined) return "HARNESS_TARGET_NOT_FOUND";
  return target.status === "active" ? target : "HARNESS_TARGET_INACTIVE";
}

function policyRejection(error: unknown): PreviewOutcome {
  if (error instanceof ProposalPolicyError) {
    return Object.freeze({ status: "rejected", code: "PREVIEW_POLICY_REJECTED", detail: error.codes });
  }
  throw error;
}

function previewRejected(code: HarnessPreviewErrorCode): PreviewOutcome {
  return Object.freeze({ status: "rejected", code });
}

function boundedText(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || Buffer.byteLength(value, "utf8") > maxBytes) return null;
  return value;
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = new Set(allowed);
  return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => expected.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
