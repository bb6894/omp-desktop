import type { HostEvent, HostResponse } from "./contracts";
import type { OmpSessionAdapter } from "./omp-adapter";

export type AgentServiceApi = {
  start(sessionId: string, prompt: string): Promise<unknown>;
  stop(sessionId: string): Promise<unknown>;
  respond(sessionId: string, interactionId: string, value: unknown): Promise<unknown>;
  command(sessionId: string, command: Record<string, unknown>): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseError(requestId: string, code: string, message = code): HostResponse {
  return { type: "response", requestId, ok: false, code, message };
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function knownError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  return new Set([
    "SESSION_NOT_FOUND",
    "SESSION_ALREADY_DESKTOP_OWNED",
    "STALE_CURSOR",
    "AGENT_ALREADY_RUNNING",
    "AGENT_NOT_RUNNING",
    "RUNTIME_NOT_FOUND",
    "RUNTIME_FILENAME_MISMATCH",
    "RUNTIME_HASH_MISMATCH"
  ]).has(message)
    ? message
    : null;
}

/** Local command boundary: only session read/fork operations are enabled before the Agent state machine is proven. */
export class SessionService {
  private readonly handledRequestIds = new Set<string>();
  private eventSink: (event: HostEvent) => void = () => undefined;
  private agentService: AgentServiceApi | null = null;

  constructor(private readonly sessions: OmpSessionAdapter) {}

  setAgentService(agentService: AgentServiceApi): void {
    this.agentService = agentService;
  }

  setEventSink(eventSink: (event: HostEvent) => void): void {
    this.eventSink = eventSink;
  }

  emit(event: HostEvent): void {
    this.eventSink(event);
  }

  async dispatch(input: unknown): Promise<HostResponse> {
    if (!isRecord(input) || !isRequestId(input.requestId) || typeof input.type !== "string") {
      return responseError("unknown", "INVALID_REQUEST");
    }
    const requestId = input.requestId;
    if (this.handledRequestIds.has(requestId)) return responseError(requestId, "DUPLICATE_REQUEST_ID");
    this.handledRequestIds.add(requestId);
    try {
      switch (input.type) {
        case "session.list":
          return { type: "response", requestId, ok: true, value: await this.sessions.listReadOnly() };
        case "session.messages":
          if (typeof input.sessionId !== "string" || (input.cursor !== null && typeof input.cursor !== "string") || typeof input.limit !== "number") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.sessions.loadMessagesReadOnly(input.sessionId, input.cursor, input.limit)
          };
        case "session.fork":
          if (typeof input.sessionId !== "string") return responseError(requestId, "INVALID_REQUEST");
          return { type: "response", requestId, ok: true, value: await this.sessions.forkFrom(input.sessionId) };
        case "agent.start":
          if (!this.agentService || typeof input.sessionId !== "string" || typeof input.prompt !== "string") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return { type: "response", requestId, ok: true, value: await this.agentService.start(input.sessionId, input.prompt) };
        case "agent.stop":
          if (!this.agentService || typeof input.sessionId !== "string") return responseError(requestId, "INVALID_REQUEST");
          return { type: "response", requestId, ok: true, value: await this.agentService.stop(input.sessionId) };
        case "interaction.respond":
          if (!this.agentService || typeof input.sessionId !== "string" || typeof input.interactionId !== "string") {
            return responseError(requestId, "INVALID_REQUEST");
          }
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.agentService.respond(input.sessionId, input.interactionId, input.value)
          };
        case "agent.command":
          if (!this.agentService || typeof input.sessionId !== "string" || !isRecord(input.command)) {
            return responseError(requestId, "INVALID_REQUEST");
          }
          if (!allowedAgentCommand(input.command)) return responseError(requestId, "COMMAND_NOT_ALLOWED");
          return {
            type: "response",
            requestId,
            ok: true,
            value: await this.agentService.command(input.sessionId, input.command)
          };
        default:
          return responseError(requestId, "UNKNOWN_COMMAND");
      }
    } catch (error) {
      const code = knownError(error);
      return responseError(requestId, code ?? "INTERNAL_ERROR");
    }
  }
}

const ALLOWED_AGENT_COMMANDS = new Set([
  "abort",
  "compact",
  "cycle_model",
  "cycle_thinking_level",
  "export_html",
  "extension_ui_response",
  "follow_up",
  "get_available_models",
  "get_login_providers",
  "get_messages",
  "get_session_stats",
  "get_state",
  "login",
  "new_session",
  "prompt",
  "set_model",
  "steer"
]);

function allowedAgentCommand(command: Record<string, unknown>): boolean {
  return typeof command.type === "string" && ALLOWED_AGENT_COMMANDS.has(command.type);
}
