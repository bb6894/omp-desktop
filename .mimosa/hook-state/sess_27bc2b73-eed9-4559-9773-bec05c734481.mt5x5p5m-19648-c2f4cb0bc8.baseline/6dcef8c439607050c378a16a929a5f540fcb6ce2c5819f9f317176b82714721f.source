import type { HostEvent } from "./contracts";
import type { AgentServiceApi } from "./session-service";

/**
 * Deterministic, offline-only Agent used by the Stage 0 protocol probe.
 * It is available only when the Host receives the explicit `--fixture` flag.
 */
export class FixtureAgentService implements AgentServiceApi {
  private sequence = 0;
  private pendingInteraction: { sessionId: string; interactionId: string } | null = null;

  constructor(private readonly onEvent: (event: HostEvent) => void) {}

  async start(sessionId: string, _prompt: string): Promise<unknown> {
    if (this.pendingInteraction) throw new Error("AGENT_ALREADY_RUNNING");
    this.emit(sessionId, "agent.state", { state: "starting" });
    this.emitRuntime(sessionId, { type: "ready", supportedProtocolVersions: [1, 2] });
    this.emit(sessionId, "agent.state", { state: "streaming" });
    this.emitRuntime(sessionId, { type: "turn_start", turnIndex: 1 });
    this.emitRuntime(sessionId, { type: "message_start", message: { role: "assistant", content: [] } });
    this.emitRuntime(sessionId, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "fixture response" }
    });
    this.emit(sessionId, "agent.state", { state: "awaiting-tool" });
    this.emitRuntime(sessionId, { type: "tool_execution_start", toolCallId: "fixture-tool", toolName: "read", args: {} });
    this.emitRuntime(sessionId, { type: "tool_execution_end", toolCallId: "fixture-tool", toolName: "read", isError: false });
    this.pendingInteraction = { sessionId, interactionId: "fixture-choice" };
    this.emit(sessionId, "agent.state", { state: "awaiting-interaction" });
    this.emitRuntime(sessionId, {
      type: "extension_ui_request",
      id: "fixture-choice",
      method: "select",
      title: "Fixture choice",
      options: ["continue", "stop"]
    });
    return { state: "awaiting-interaction" };
  }

  async stop(sessionId: string): Promise<unknown> {
    this.pendingInteraction = null;
    this.emit(sessionId, "agent.state", { state: "stopping" });
    this.emit(sessionId, "agent.state", { state: "interrupted" });
    return { state: "stopped" };
  }

  async respond(sessionId: string, interactionId: string, _value: unknown): Promise<unknown> {
    if (
      !this.pendingInteraction ||
      this.pendingInteraction.sessionId !== sessionId ||
      this.pendingInteraction.interactionId !== interactionId
    ) {
      throw new Error("INTERACTION_NOT_FOUND");
    }
    this.pendingInteraction = null;
    this.emitRuntime(sessionId, { type: "message_end", message: { role: "assistant", content: "fixture response" } });
    this.emitRuntime(sessionId, { type: "turn_end", turnIndex: 1, message: { role: "assistant" } });
    this.emitRuntime(sessionId, { type: "agent_end", willContinue: false });
    this.emit(sessionId, "agent.state", { state: "completed" });
    return { accepted: true };
  }

  async command(sessionId: string, command: Record<string, unknown>): Promise<unknown> {
    if (command.type === "prompt") return this.start(sessionId, String(command.message ?? ""));
    if (command.type === "abort") return this.stop(sessionId);
    if (command.type === "get_state") {
      this.emitRuntime(sessionId, {
        type: "response",
        id: command.id ?? "fixture-state",
        command: "get_state",
        success: true,
        data: { isStreaming: false, messageCount: 0 }
      });
      return { type: "response", command: "get_state", success: true, data: { isStreaming: false, messageCount: 0 } };
    }
    return { type: "response", command: command.type, success: true, data: {} };
  }

  private emitRuntime(sessionId: string, payload: Record<string, unknown>): void {
    this.emit(sessionId, "runtime.frame", payload);
  }

  private emit(sessionId: string, name: string, payload: unknown): void {
    this.sequence += 1;
    this.onEvent({ type: "event", sessionId, sequence: this.sequence, name, payload });
  }
}
