import type { HarnessKnowledgeEntry, HarnessProposal } from "./harness-contracts";
import {
  PROPOSAL_DIGEST_SCHEMA_VERSION,
  type MemoryAddProposalInput,
  type MemoryProposalDigestPayload,
  type MemoryProposalInput,
  type MemoryProposalPreview,
  type MemoryReplaceProposalInput
} from "./proposal-contracts";
import { digestCanonicalProposal } from "./proposal-digest";
import { assertMemoryProposalAllowed } from "./proposal-policy";

export function createMemoryAddPreview(input: MemoryAddProposalInput): MemoryProposalPreview {
  return createMemoryProposalPreview({ ...input, operation: "memory.add", target: null });
}
export function createMemoryReplacePreview(input: MemoryReplaceProposalInput): MemoryProposalPreview {
  return createMemoryProposalPreview({ ...input, operation: "memory.replace" });
}

function createMemoryProposalPreview(input: MemoryProposalInput): MemoryProposalPreview {
  assertMemoryProposalAllowed(input);
  const targetId = input.target === null ? null : input.target.id;
  const payload: MemoryProposalDigestPayload = {
    kind: "proposal",
    schemaVersion: PROPOSAL_DIGEST_SCHEMA_VERSION,
    payload: {
      projectId: input.projectId,
      operation: input.operation,
      targetId,
      memory: {
        title: input.title,
        content: input.content,
        scope: input.scope,
        compatibility: input.compatibility,
        evidence: input.evidence
      }
    }
  };
  const digest = digestCanonicalProposal(payload);
  const memoryId = targetId === null ? "memory-" + digest.sha256.slice(0, 24) : targetId;
  const evidence = Object.freeze(input.evidence.map((item) => Object.freeze({ ...item })));
  const after: HarnessKnowledgeEntry = Object.freeze({
    id: memoryId,
    title: input.title,
    content: input.content,
    scope: input.scope,
    status: "proposed",
    evidence,
    compatibility: Object.freeze({ ...input.compatibility }),
    updatedAt: input.createdAt
  });
  const proposal: HarnessProposal = Object.freeze({
    id: "proposal-" + digest.sha256.slice(0, 24),
    kind: "memory",
    targetId,
    summary: (input.operation === "memory.add" ? "Add" : "Replace") + " memory: " + input.title,
    proposedValue: input.content,
    status: "proposed",
    evidence,
    createdAt: input.createdAt
  });
  const before = input.target === null ? null : cloneEntry(input.target);
  return Object.freeze({
    readOnly: true,
    persisted: false,
    activated: false,
    applied: false,
    operation: input.operation,
    projectId: input.projectId,
    before,
    after,
    proposal,
    digest,
    policy: { accepted: true, codes: [] }
  });
}

function cloneEntry(entry: HarnessKnowledgeEntry): HarnessKnowledgeEntry {
  return Object.freeze({
    ...entry,
    evidence: Object.freeze(entry.evidence.map((item) => Object.freeze({ ...item }))),
    compatibility: Object.freeze({ ...entry.compatibility })
  });
}
