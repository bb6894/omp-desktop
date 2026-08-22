import {
  MAX_RPC_FRAME_BYTES,
  MAX_RPC_REASSEMBLED_BYTES,
  RpcFrameDecoder
} from "./omp-vendor";

const OMP_RPC_LIMITS = {
  physicalFrameBytes: MAX_RPC_FRAME_BYTES,
  reassembledFrameBytes: MAX_RPC_REASSEMBLED_BYTES
} as const;
import type { RuntimeProcess } from "./runtime";

export type RpcStatus = "starting" | "ready" | "running" | "stopping" | "closed" | "failed";

export type RpcCapabilities = {
  protocolVersion: 1 | 2;
  physicalFrameBytes: typeof OMP_RPC_LIMITS.physicalFrameBytes;
  reassembledFrameBytes: typeof OMP_RPC_LIMITS.reassembledFrameBytes;
};

export type RpcFrame = Record<string, unknown>;

export type RpcBridgeOptions = {
  process: RuntimeProcess;
  onFrame?: (frame: RpcFrame) => void;
  onDiagnostic?: (message: string) => void;
  readyTimeoutMs?: number;
};

type PendingRequest = {
  resolve: (frame: RpcFrame) => void;
  reject: (error: Error) => void;
};

function isRecord(value: unknown): value is RpcFrame {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Converts arbitrary stdout chunks into complete JSONL frames with hard byte limits. */
export class RpcLineDecoder {
  private pending = Buffer.alloc(0);
  private readonly logical = new RpcFrameDecoder();

  push(chunk: Uint8Array): RpcFrame[] {
    if (chunk.byteLength === 0) return [];
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    const output: RpcFrame[] = [];
    while (true) {
      const newline = this.pending.indexOf(0x0a);
      if (newline < 0) {
        if (this.pending.byteLength >= OMP_RPC_LIMITS.physicalFrameBytes) throw new Error("RPC_FRAME_TOO_LARGE");
        break;
      }
      const lineWithNewline = this.pending.subarray(0, newline + 1);
      if (lineWithNewline.byteLength > OMP_RPC_LIMITS.physicalFrameBytes) throw new Error("RPC_FRAME_TOO_LARGE");
      let line = lineWithNewline.subarray(0, newline);
      this.pending = this.pending.subarray(newline + 1);
      if (line.byteLength > 0 && line[line.byteLength - 1] === 0x0d) line = line.subarray(0, line.byteLength - 1);
      if (line.byteLength === 0) throw new Error("RPC_EMPTY_FRAME");
      let parsed: unknown;
      try {
        parsed = JSON.parse(decodeUtf8(line));
      } catch {
        throw new Error("RPC_INVALID_JSON");
      }
      let decoded: object | undefined;
      try {
        decoded = this.logical.push(parsed);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "RPC_FRAME_ERROR");
      }
      if (decoded !== undefined) {
        if (!isRecord(decoded)) throw new Error("RPC_FRAME_NOT_OBJECT");
        output.push(decoded);
      }
    }
    return output;
  }

  finish(): void {
    if (this.pending.byteLength !== 0) throw new Error("RPC_TRUNCATED_FRAME");
  }
}

export class OmpRpcBridge {
  private readonly decoder = new RpcLineDecoder();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly onFrame?: (frame: RpcFrame) => void;
  private readonly onDiagnostic?: (message: string) => void;
  private readonly readyTimeoutMs: number;
  private readTask: Promise<void> | null = null;
  private sequence = 0;
  private status: RpcStatus = "starting";
  private capabilities: RpcCapabilities | null = null;
  private failure: Error | null = null;
  private readyFrame: RpcFrame | null = null;
  private readonly readyWaiters = new Set<{
    resolve: (frame: RpcFrame) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly process: RuntimeProcess, options: Omit<RpcBridgeOptions, "process"> = {}) {
    this.onFrame = options.onFrame;
    this.onDiagnostic = options.onDiagnostic;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 30_000;
    this.readTask = this.readOutput();
  }

  getStatus(): RpcStatus {
    return this.status;
  }

  getCapabilities(): RpcCapabilities | null {
    return this.capabilities;
  }

  async start(): Promise<RpcCapabilities> {
    try {
      const ready = await this.waitForReady();
      const supported = Array.isArray(ready.supportedProtocolVersions) ? ready.supportedProtocolVersions : [];
      if (!supported.includes(2)) throw new Error("RPC_INCOMPATIBLE");
      if (
        ready.maxFrameBytes !== OMP_RPC_LIMITS.physicalFrameBytes ||
        ready.maxReassembledFrameBytes !== OMP_RPC_LIMITS.reassembledFrameBytes
      ) {
        throw new Error("RPC_FRAME_LIMIT_MISMATCH");
      }
      const response = await this.request({ type: "negotiate_protocol", protocolVersion: 2 });
      if (
        response.success !== true ||
        response.command !== "negotiate_protocol" ||
        !isRecord(response.data) ||
        response.data.protocolVersion !== 2
      ) {
        throw new Error("RPC_NEGOTIATION_FAILED");
      }
      this.capabilities = {
        protocolVersion: 2,
        physicalFrameBytes: OMP_RPC_LIMITS.physicalFrameBytes,
        reassembledFrameBytes: OMP_RPC_LIMITS.reassembledFrameBytes
      };
      this.status = "ready";
      return this.capabilities;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.fail(failure);
      this.process.kill();
      throw failure;
    }
  }

  async request(command: RpcFrame): Promise<RpcFrame> {
    if (this.status === "failed" || this.status === "closed") throw this.failure ?? new Error("RPC_CLOSED");
    const id = typeof command.id === "string" ? command.id : `desktop-${++this.sequence}`;
    if (this.pending.has(id)) throw new Error("DUPLICATE_REQUEST_ID");
    const frame = { ...command, id };
    const response = new Promise<RpcFrame>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    try {
      this.process.stdin.write(`${JSON.stringify(frame)}\n`);
    } catch (error) {
      this.pending.delete(id);
      throw error;
    }
    return response;
  }

  async stop(graceMs = 1_000): Promise<void> {
    if (this.status === "closed") return;
    this.status = "stopping";
    try {
      if (this.status !== "failed") await this.request({ type: "abort" }).catch(() => undefined);
    } finally {
      this.process.kill();
      await Promise.race([this.process.exited.catch(() => undefined), Bun.sleep(graceMs)]);
      this.status = "closed";
      this.rejectPending(new Error("RPC_CLOSED"));
    }
  }

  private async waitForReady(): Promise<RpcFrame> {
    if (this.readyFrame) return this.readyFrame;
    if (this.failure) throw this.failure;
    return new Promise<RpcFrame>((resolve, reject) => {
      let waiter: { resolve: (frame: RpcFrame) => void; reject: (error: Error) => void };
      const timer = setTimeout(() => {
        this.readyWaiters.delete(waiter);
        reject(new Error("RPC_READY_TIMEOUT"));
      }, this.readyTimeoutMs);
      waiter = {
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      };
      this.readyWaiters.add(waiter);
    });
  }

  private async readOutput(): Promise<void> {
    try {
      for await (const chunk of this.process.stdout) {
        for (const frame of this.decoder.push(chunk)) {
          if (frame.type === "ready") {
            this.readyFrame = frame;
            for (const waiter of this.readyWaiters) waiter.resolve(frame);
            this.readyWaiters.clear();
          }
          if (frame.type === "response" && typeof frame.id === "string") {
            const pending = this.pending.get(frame.id);
            if (pending) {
              this.pending.delete(frame.id);
              pending.resolve(frame);
            }
          }
          this.onFrame?.(frame);
        }
      }
      this.decoder.finish();
      if (this.status !== "stopping" && this.status !== "closed") this.fail(new Error("RPC_OUTPUT_CLOSED"));
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private fail(error: Error): void {
    this.failure = error;
    this.status = "failed";
    this.onDiagnostic?.(error.message);
    for (const waiter of this.readyWaiters) waiter.reject(error);
    this.readyWaiters.clear();
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
