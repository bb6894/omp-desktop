export type WriteMode = "history-readonly" | "desktop-owned";
export type HandoffState = "none" | "stopped-for-terminal" | "terminal-owned" | "reclaimable";

export type SessionRecord = {
  id: string;
  sourcePath: string;
  displayName: string;
  projectPath: string;
  updatedAt: string;
  writeMode: WriteMode;
  sourceSessionId: string | null;
  parentSessionId: string | null;
  owner: "none" | "desktop" | "terminal";
  handoffState: HandoffState;
  size: number;
};

export type MessagePage = {
  sessionId: string;
  messages: readonly unknown[];
  nextCursor: string | null;
  staleCursor: boolean;
};

export type HostRequest =
  | { type: "session.list"; requestId: string }
  | { type: "session.messages"; requestId: string; sessionId: string; cursor: string | null; limit: number }
  | { type: "session.fork"; requestId: string; sessionId: string }
  | { type: "agent.start"; requestId: string; sessionId: string; prompt: string }
  | { type: "agent.stop"; requestId: string; sessionId: string }
  | { type: "interaction.respond"; requestId: string; sessionId: string; interactionId: string; value: unknown };

export type HostResponse =
  | { type: "response"; requestId: string; ok: true; value: unknown }
  | { type: "response"; requestId: string; ok: false; code: string; message: string };

export type HostEvent = {
  type: "event";
  sessionId: string;
  sequence: number;
  name: string;
  payload: unknown;
};
