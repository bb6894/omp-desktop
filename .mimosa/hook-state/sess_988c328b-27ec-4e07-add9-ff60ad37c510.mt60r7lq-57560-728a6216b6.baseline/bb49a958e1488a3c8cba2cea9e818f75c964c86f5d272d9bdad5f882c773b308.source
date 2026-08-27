import type {
  HarnessCompatibility,
  HarnessEvidence,
  HarnessKnowledgeEntry,
  HarnessProposal,
  HarnessScope
} from "./harness-contracts";

export const PROPOSAL_DIGEST_SCHEMA_VERSION = 1 as const;
export type MemoryProposalOperation = "memory.add" | "memory.replace";

export type MemoryProposalInput = {
  operation: MemoryProposalOperation;
  projectId: string;
  compatibility: HarnessCompatibility;
  target: HarnessKnowledgeEntry | null;
  title: string;
  content: string;
  scope: HarnessScope;
  evidence: readonly HarnessEvidence[];
  createdAt: string;
};
export type MemoryAddProposalInput = Omit<MemoryProposalInput, "operation" | "target">;
export type MemoryReplaceProposalInput = Omit<MemoryProposalInput, "operation"> & {
  target: HarnessKnowledgeEntry;
};

export type MemoryProposalDigestPayload = {
  kind: "proposal";
  schemaVersion: typeof PROPOSAL_DIGEST_SCHEMA_VERSION;
  payload: {
    projectId: string;
    operation: MemoryProposalOperation;
    targetId: string | null;
    memory: {
      title: string;
      content: string;
      scope: HarnessScope;
      compatibility: HarnessCompatibility;
      evidence: readonly HarnessEvidence[];
    };
  };
};

export type MemoryProposalDigest = {
  readonly algorithm: "sha256";
  readonly sha256: string;
  readonly canonicalJson: string;
};

export type ProposalPolicyCode =
  | "PROPOSAL_PROJECT_ID_INVALID"
  | "PROPOSAL_COMPATIBILITY_UNSUPPORTED"
  | "PROPOSAL_TITLE_EMPTY"
  | "PROPOSAL_CONTENT_EMPTY"
  | "PROPOSAL_TEXT_LIMIT_EXCEEDED"
  | "PROPOSAL_EVIDENCE_REQUIRED"
  | "PROPOSAL_EVIDENCE_LIMIT_EXCEEDED"
  | "PROPOSAL_EVIDENCE_INVALID"
  | "PROPOSAL_SECRET_DETECTED"
  | "PROPOSAL_PROTECTED_PATH_REFERENCED"
  | "PROPOSAL_PROMPT_INJECTION_DETECTED"
  | "PROPOSAL_ADD_TARGET_FORBIDDEN"
  | "PROPOSAL_REPLACE_TARGET_REQUIRED"
  | "PROPOSAL_REPLACE_TARGET_INVALID"
  | "PROPOSAL_REPLACE_TARGET_INCOMPATIBLE";

export type ProposalPolicyDecision =
  | { readonly accepted: true; readonly codes: readonly [] }
  | { readonly accepted: false; readonly codes: readonly ProposalPolicyCode[] };

export type MemoryProposalPreview = {
  readonly readOnly: true;
  readonly persisted: false;
  readonly activated: false;
  readonly applied: false;
  readonly operation: MemoryProposalOperation;
  readonly projectId: string;
  readonly before: HarnessKnowledgeEntry | null;
  readonly after: HarnessKnowledgeEntry;
  readonly proposal: HarnessProposal;
  readonly digest: MemoryProposalDigest;
  readonly policy: { readonly accepted: true; readonly codes: readonly [] };
};
