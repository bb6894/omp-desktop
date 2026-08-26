import { dirname } from "node:path";
import type { HostEvent } from "./contracts";
import type { InteractionResponse } from "../../../protocol/domain";
import { OmpRpcBridge, type RpcFrame } from "./rpc-bridge";
import { spawnVerifiedRuntime, type RuntimeProcess } from "./runtime";
import { extractApprovalTool, type ApprovalRuleBook } from "./approval-rules";

type AgentEntry = {
  bridge: OmpRpcBridge;
  process: RuntimeProcess;
  state: AgentState;
};

export type AgentState =
  | "idle"
  | "starting"
  | "streaming"
  | "awaiting-tool"
  | "awaiting-interaction"
  | "stopping"
  | "completed"
  | "interrupted"
  | "failed";

export type AgentServiceOptions = {
  runtimePath: string;
  cwd: string;
  sessionDir: string;
  onEvent: (event: HostEvent) => void;
  onDiagnostic?: (message: string) => void;
  /** Desktop-side approval grants; absent in fixture mode. */
  ruleBook?: ApprovalRuleBook;
};

const INTERACTIVE_UI_METHODS: Record<"confirm" | "select" | "input" | "editor", true> = {
  confirm: true,
  select: true,
  input: true,
  editor: true
};

/** Owns verified OMP Runtime processes and exposes a narrow command surface. */
export class AgentService {
  private readonly agents = new Map<string, AgentEntry>();
  private readonly sequences = new Map<string, number>();

  constructor(private readonly options: AgentServiceOptions) {}

  async start(sessionId: string, prompt: string): Promise<unknown> {
    if (this.agents.has(sessionId)) throw new Error("AGENT_ALREADY_RUNNING");
    const entry = await this.create(sessionId);
    this.setState(sessionId, entry, "streaming");
    await entry.bridge.request({ type: "prompt", message: prompt });
    return { state: "streaming" };
  }

  async stop(sessionId: string): Promise<unknown> {
    const entry = this.agents.get(sessionId);
    if (!entry) return { state: "idle" };
    this.setState(sessionId, entry, "stopping");
    this.agents.delete(sessionId);
    await entry.bridge.stop();
    this.emitState(sessionId, "interrupted");
    return { state: "stopped" };
  }

  /**
   * The Runtime resolves dialogs by reading TOP-LEVEL fields of the whole
   * `extension_ui_response` frame (`confirmed` / `value` / `cancelled`) — a
   * nested `value` payload silently reads as "deny". Validate at this boundary
   * and spread the patch onto the frame.
   */
  async respond(
    sessionId: string,
    interactionId: string,
    response: InteractionResponse
  ): Promise<unknown> {
    if (!isValidInteractionResponse(response)) throw new Error("INTERACTION_RESPONSE_INVALID");
    return this.command(sessionId, {
      type: "extension_ui_response",
      id: interactionId,
      ...response
    });
  }

  async command(sessionId: string, command: Record<string, unknown>): Promise<unknown> {
    let entry = this.agents.get(sessionId);
    if (!entry) entry = await this.create(sessionId);
    if (command.type === "prompt" || command.type === "follow_up" || command.type === "steer") {
      this.setState(sessionId, entry, "streaming");
    } else if (command.type === "abort") {
      this.setState(sessionId, entry, "stopping");
    }
    const response = sanitizeFrame(await entry.bridge.request(command));
    if (command.type === "abort") this.setState(sessionId, entry, "interrupted");
    return response;
  }

  /** Read-only state view for Host-owned projection assembly; never spawns or mutates. */
  stateOf(sessionId: string): AgentState | null {
    return this.agents.get(sessionId)?.state ?? null;
  }

  async stopAll(): Promise<void> {
    const entries = [...this.agents.entries()];
    this.agents.clear();
    await Promise.all(entries.map(([, entry]) => entry.bridge.stop().catch(() => undefined)));
  }

  private async create(sessionId: string): Promise<AgentEntry> {
    const spawned = await spawnVerifiedRuntime({
      runtimePath: this.options.runtimePath,
      cwd: this.options.cwd,
      sessionDir: this.options.sessionDir,
      // The Runtime's own default is `yolo` (every tier auto-approved). A
      // desktop product never inherits that silently: exec-tier tools now
      // prompt, and explicit desktop rules may answer those prompts.
      args: ["--approval-mode", "write"]
    });

    let entry: AgentEntry;
    const bridge = new OmpRpcBridge(spawned.process, {
      onFrame: (frame) => this.handleFrame(sessionId, frame),
      onDiagnostic: (message) => this.options.onDiagnostic?.(`[omp/${sessionId}] ${message}`)
    });
    entry = { bridge, process: spawned.process, state: "starting" };
    this.agents.set(sessionId, entry);
    this.emitState(sessionId, "starting");
    try {
      await bridge.start();
    } catch (error) {
      this.agents.delete(sessionId);
      this.emitState(sessionId, "failed");
      await bridge.stop().catch(() => undefined);
      throw error;
    }
    this.setState(sessionId, entry, "idle");
    return entry;
  }

  private handleFrame(sessionId: string, frame: RpcFrame): void {
    // Approval-rule interception happens BEFORE the ask is journaled or the
    // state machine flips to awaiting-interaction: a granted tool prompt is
    // answered in place and surfaces as a system note, not a phantom card.
    if (this.options.ruleBook) {
      const approvalTool = extractApprovalTool(frame);
      if (approvalTool && this.options.ruleBook.has(approvalTool, sessionId)) {
        const entry = this.agents.get(sessionId);
        if (entry && typeof frame.id === "string") {
          entry.bridge
            .request({ type: "extension_ui_response", id: frame.id, value: "Approve" })
            .then(() => this.emitNote(sessionId, `已按你的审批规则自动放行：${approvalTool}`))
            .catch((error: unknown) =>
              this.options.onDiagnostic?.(`[omp/${sessionId}] 规则应答失败：${String(error)}`)
            );
          return;
        }
      }
    }
    const sequence = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, sequence);
    this.options.onEvent({
      type: "event",
      sessionId,
      sequence,
      name: "runtime.frame",
      payload: sanitizeFrame(frame)
    });
    const entry = this.agents.get(sessionId);
    if (entry) {
      const next = stateForRuntimeFrame(frame, entry.state);
      if (next !== entry.state) this.setState(sessionId, entry, next);
    }
    if (frame.type === "ready") return;
    if (frame.type === "response" && frame.success === false && frame.error) {
      this.options.onDiagnostic?.(`[omp/${sessionId}] ${String(frame.error)}`);
    }
  }

  private setState(sessionId: string, entry: AgentEntry, state: AgentState): void {
    entry.state = state;
    this.emitState(sessionId, state);
  }

  private emitState(sessionId: string, state: AgentState): void {
    const sequence = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, sequence);
    this.options.onEvent({
      type: "event",
      sessionId,
      sequence,
      name: "agent.state",
      payload: { state }
    });
  }

  private emitNote(sessionId: string, text: string): void {
    const sequence = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.set(sessionId, sequence);
    this.options.onEvent({
      type: "event",
      sessionId,
      sequence,
      name: "agent.note",
      payload: { text }
    });
  }
}

function isValidInteractionResponse(response: InteractionResponse): boolean {
  if (typeof response !== "object" || response === null) return false;
  const keys = Object.keys(response);
  if ("confirmed" in response) {
    return keys.length === 1 && typeof response.confirmed === "boolean";
  }
  if ("value" in response) {
    return keys.length === 1 && typeof response.value === "string";
  }
  if ("cancelled" in response) {
    return keys.length === 1 && response.cancelled === true;
  }
  return false;
}

export function sanitizeFrame(frame: RpcFrame): RpcFrame {
  return sanitizeValue(frame) as RpcFrame;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(headers|authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|password|secret|credential)$/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = sanitizeValue(child);
    }
  }
  return output;
}

export function defaultRuntimePath(executablePath: string): string {
  return `${dirname(executablePath)}\\omp-windows-x64.exe`;
}

function stateForRuntimeFrame(frame: RpcFrame, current: AgentState): AgentState {
  switch (frame.type) {
    case "turn_start":
      return "streaming";
    case "tool_execution_start":
      return "awaiting-tool";
    case "extension_ui_request": {
      const method = typeof frame.method === "string" ? frame.method : "";
      return method in INTERACTIVE_UI_METHODS ? "awaiting-interaction" : current;
    }
    case "turn_end":
    case "agent_end":
      return "completed";
    case "response":
      return frame.success === false ? "failed" : current === "completed" ? "idle" : current;
    default:
      return current;
  }
}
