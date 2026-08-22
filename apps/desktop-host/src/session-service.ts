import type { HostResponse } from "./contracts";
import type { OmpSessionAdapter } from "./omp-adapter";

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
  return new Set(["SESSION_NOT_FOUND", "SESSION_ALREADY_DESKTOP_OWNED", "STALE_CURSOR"]).has(message)
    ? message
    : null;
}

/** Local command boundary: only session read/fork operations are enabled before the Agent state machine is proven. */
export class SessionService {
  private readonly handledRequestIds = new Set<string>();

  constructor(private readonly sessions: OmpSessionAdapter) {}

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
        case "agent.stop":
        case "interaction.respond":
          return responseError(requestId, "NOT_IMPLEMENTED");
        default:
          return responseError(requestId, "UNKNOWN_COMMAND");
      }
    } catch (error) {
      const code = knownError(error);
      return responseError(requestId, code ?? "INTERNAL_ERROR");
    }
  }
}
