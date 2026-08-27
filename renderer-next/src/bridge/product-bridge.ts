import { createContext, createElement, useContext, type ReactNode } from "react";
import type {
  InteractionResponse,
  TimelineEvent,
  TimelineReplay
} from "../../../protocol/domain";
import type { SessionViewData } from "../lib/session-lifecycle";

/**
 * The single seam between the product renderer and the Tauri transport. The
 * fixture implementation is test-only and never selected by the shipping app.
 *
 * Routing note: Host requests route per active session/project (one Desktop
 * Host child per project window). Callers activate a session after creation or
 * startup restore; routed calls use that activation context.
 */
export type SessionMetadataRecord = {
  archived: boolean;
  pinned: boolean;
  lastViewedAt: string | null;
};

export type SessionMetadataIndex = Record<string, SessionMetadataRecord>;
export type WorkspaceFileEntry = { path: string; code: string };
export type WorkspaceStatus = { files: readonly WorkspaceFileEntry[]; truncated: boolean };
export type WorkspaceDiff =
  | { kind: "text"; diff: string; truncated: boolean }
  | { kind: "binary" }
  | { kind: "untracked" };


export type SessionListing = { views: SessionViewData[]; skipped: number; pruned: number };
export type MessagesPage = {
  sessionId: string;
  messages: readonly unknown[];
  nextCursor: string | null;
  staleCursor: boolean;
};

export type WorkbenchState = {
  model: string | null;
  thinkingLevel: string | null;
  models: readonly { id: string; provider: string }[];
  queuedCount: number | null;
  fastMode: boolean | null;
  autoCompaction: boolean | null;
  steeringMode: string | null;
  followUpMode: string | null;
  interruptMode: string | null;
  tokensPerSecond: number | null;
  contextPercent: number | null;
};

export type ApprovalRuleView = { id: string; tool: string; createdAt: string };
export type ApprovalRuleLists = { session: readonly ApprovalRuleView[]; project: readonly ApprovalRuleView[] };
export type ApprovalGrantOutcome = { created: boolean; rule: ApprovalRuleView | null };

export type BridgeHandlers = {
  onEvent(event: TimelineEvent): void;
  onExit(reason: string): void;
};

export type ProductBridge = {
  /** Sets the routing target for session-scoped calls; null clears it. */
  setActiveSession(sessionId: string | null): void;
  listSessions(): Promise<SessionListing>;
  listMessages(sessionId: string, cursor: string | null, limit: number): Promise<MessagesPage>;
  getSessionMetadata(): Promise<SessionMetadataIndex>;
  subscribeEvents(sessionId: string, handlers: BridgeHandlers): Promise<() => void>;
  setSessionMetadata(sessionId: string, patch: Partial<SessionMetadataRecord>): Promise<SessionMetadataRecord>;
  sessionStatus(sessionId: string): Promise<string | null>;
  openProjectPicker(): Promise<string | null>;
  createSession(cwd: string): Promise<string>;
  forkSession(sessionId: string): Promise<string>;
  fetchWorkbenchState(sessionId: string): Promise<WorkbenchState>;
  /** Runtime requires {provider, modelId}; a bare id silently no-ops. */
  setModel(sessionId: string, provider: string, modelId: string): Promise<void>;
  /** Mid-turn injection; only valid while the session's turn is active. */
  steerSession(sessionId: string, text: string): Promise<void>;
  /** Runs one allowlisted Runtime command (slash-palette surface). */
  runAgentCommand(sessionId: string, command: Record<string, unknown>): Promise<Record<string, unknown>>;
  cycleThinkingLevel(sessionId: string): Promise<void>;
  sendPrompt(sessionId: string, text: string, behavior?: "steer" | "followUp", images?: {type:string; data:string; mimeType:string}[]): Promise<void>;
  openRuntimeSession(sessionId: string): Promise<void>;
  /** Journaled timeline events after `afterSeq`; dropped=true forces re-hydration. */
  replayTimeline(sessionId: string, afterSeq: number): Promise<TimelineReplay>;
  /** Answers the CURRENT pending interaction; stale/cross-session answers fail closed. */
  respondInteraction(sessionId: string, interactionId: string, response: InteractionResponse): Promise<void>;
  /** Aborts the running agent for that session (existing abort semantics). */
  abortSession(sessionId: string): Promise<void>;
  /** Bounded changed-file summary vs HEAD for the active project root. */
  getWorkspaceChanges(): Promise<WorkspaceStatus>;
  /** Bounded per-file diff vs HEAD; path is project-relative (validated Host-side). */
  getWorkspaceDiff(path: string): Promise<WorkspaceDiff>;
  /** Desktop-side approval grants for the routed session (memory) + project (persisted). */
  listApprovalRules(): Promise<ApprovalRuleLists>;
  addApprovalRule(
    tool: string,
    scope: "session" | "project",
    sourceInteractionId: string | null
  ): Promise<ApprovalGrantOutcome>;
  removeApprovalRule(ruleId: string): Promise<void>;
  /** Renames a session by its id; empties or exceeds 64 chars are silently rejected. */
  renameSession(sessionId: string, name: string): Promise<void>;
};

export const ProductBridgeContext = createContext<ProductBridge | null>(null);
export function ProductBridgeProvider({
  bridge,
  children
}: {
  bridge: ProductBridge;
  children: ReactNode;
}) {
  return createElement(ProductBridgeContext.Provider, { value: bridge }, children);
}

export function useProductBridge(): ProductBridge {
  const bridge = useContext(ProductBridgeContext);
  if (!bridge) throw new Error("PRODUCT_BRIDGE_MISSING");
  return bridge;
}
