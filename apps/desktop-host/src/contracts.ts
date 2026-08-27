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
  | { type: "get_messages_page"; requestId: string; sessionId: string; cursor: string | null; limit: number }
  | { type: "session.messages"; requestId: string; sessionId: string; cursor: string | null; limit: number }
  | { type: "session.fork"; requestId: string; sessionId: string }
  | { type: "harness.inspect"; requestId: string }
  | { type: "agent.start"; requestId: string; sessionId: string; prompt: string }
  | { type: "agent.stop"; requestId: string; sessionId: string }
  | { type: "interaction.respond"; requestId: string; sessionId: string; interactionId: string; value: unknown }
  | { type: "agent.command"; requestId: string; sessionId: string; command: Record<string, unknown> };

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

export type ClipboardImage = {
  data: string;
  mimeType: string;
};

export type HostToolRequest =
  | { type: "clipboard.read" }
  | { type: "clipboard.write"; text: string }
  | { type: "clipboard.read-image" }
  | { type: "clipboard.write-image"; image: ClipboardImage };
