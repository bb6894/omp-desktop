import { dirname } from "node:path";
import type { HostEvent } from "./contracts";
import { OmpRpcBridge, type RpcFrame } from "./rpc-bridge";
import { spawnVerifiedRuntime, type RuntimeProcess } from "./runtime";

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

  async respond(sessionId: string, interactionId: string, value: unknown): Promise<unknown> {
    return this.command(sessionId, { type: "extension_ui_response", id: interactionId, value });
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

  async stopAll(): Promise<void> {
    const entries = [...this.agents.entries()];
    this.agents.clear();
    await Promise.all(entries.map(([, entry]) => entry.bridge.stop().catch(() => undefined)));
  }

  private async create(sessionId: string): Promise<AgentEntry> {
    const spawned = await spawnVerifiedRuntime({
      runtimePath: this.options.runtimePath,
      cwd: this.options.cwd,
      sessionDir: this.options.sessionDir
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
      return new Set(["input", "select", "confirm", "editor"]).has(method)
        ? "awaiting-interaction"
        : current;
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
