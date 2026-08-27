export const HARNESS_SCHEMA_VERSION = 1 as const;

export type HarnessScope = "project" | "global";
export type HarnessEntryStatus = "active" | "proposed" | "rejected" | "quarantined" | "reverted";

export type HarnessEvidence = {
  kind: "command" | "test" | "file" | "user-feedback";
  reference: string;
  summary: string;
};

export type HarnessCompatibility = {
  runtimeVersion: string;
  hostProtocol: number;
};

export type HarnessGoal = {
  id: string;
  title: string;
  status: "active" | "completed" | "paused";
  updatedAt: string;
};

export type HarnessKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  scope: HarnessScope;
  status: HarnessEntryStatus;
  evidence: readonly HarnessEvidence[];
  compatibility: HarnessCompatibility;
  updatedAt: string;
};

export type HarnessAgentProfile = HarnessKnowledgeEntry & {
  role: string;
};

export type HarnessProposal = {
  id: string;
  kind: "memory" | "skill" | "agent-profile" | "goal";
  targetId: string | null;
  summary: string;
  proposedValue: string;
  status: "proposed" | "approved" | "rejected" | "quarantined" | "reverted";
  evidence: readonly HarnessEvidence[];
  createdAt: string;
};

export type HarnessRefinementRecord = {
  id: string;
  proposalId: string;
  outcome: "approved" | "rejected" | "quarantined" | "reverted";
  reason: string;
  createdAt: string;
};

export type HarnessSnapshot = {
  id: string;
  createdAt: string;
  reason: string;
  stateHash: string;
};

export type HarnessState = {
  schemaVersion: typeof HARNESS_SCHEMA_VERSION;
  projectId: string;
  projectPath: string;
  compatibility: HarnessCompatibility;
  goals: readonly HarnessGoal[];
  memories: readonly HarnessKnowledgeEntry[];
  skills: readonly HarnessKnowledgeEntry[];
  agentProfiles: readonly HarnessAgentProfile[];
  proposals: readonly HarnessProposal[];
  refinementHistory: readonly HarnessRefinementRecord[];
  snapshots: readonly HarnessSnapshot[];
};

export type HarnessInspection = {
  readOnly: true;
  source: "harness-store";
  projectId: string;
  state: HarnessState;
};

export type HarnessInspectorApi = {
  inspect(): Promise<HarnessInspection>;
};
