import {
  MAX_RPC_FRAME_BYTES,
  MAX_RPC_REASSEMBLED_BYTES,
  FileSessionStorage,
  listSessionsReadOnly,
  loadSessionMessagesReadOnly,
  RpcFrameDecoder,
  SessionManager
} from "./omp-vendor";
import type { SessionInfo } from "./omp-vendor";
import { mkdir } from "node:fs/promises";
import { resolveProfilePaths, type ProfilePaths } from "./profile-paths";
import type { MessagePage, SessionRecord } from "./contracts";

type SessionSource = "terminal" | "desktop";

export const OMP_RPC_LIMITS = {
  physicalFrameBytes: MAX_RPC_FRAME_BYTES,
  reassembledFrameBytes: MAX_RPC_REASSEMBLED_BYTES
} as const;

export type OmpRpcFrameDecoder = Pick<RpcFrameDecoder, "push">;

export function createOmpRpcFrameDecoder(): OmpRpcFrameDecoder {
  return new RpcFrameDecoder();
}

export type OmpSessionAdapter = {
  listReadOnly(): Promise<readonly SessionRecord[]>;
  loadMessagesReadOnly(sessionId: string, cursor: string | null, limit: number): Promise<MessagePage>;
  forkFrom(sessionId: string): Promise<SessionRecord>;
};

export class OfficialOmpSessionAdapter implements OmpSessionAdapter {
  private readonly storage = new FileSessionStorage();

  constructor(
    private readonly cwd: string,
    private readonly paths: ProfilePaths = resolveProfilePaths(cwd)
  ) {}

  async listReadOnly(): Promise<readonly SessionRecord[]> {
    const [terminal, desktop] = await Promise.all([
      this.listDirectory(this.paths.terminalSessionsDir, "terminal"),
      this.listDirectory(this.paths.desktopSessionsDir, "desktop")
    ]);
    return [...terminal, ...desktop].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadMessagesReadOnly(sessionId: string, cursor: string | null, limit: number): Promise<MessagePage> {
    const records = await this.listReadOnly();
    const record = records.find((item) => item.id === sessionId);
    if (!record) {
      throw new Error("SESSION_NOT_FOUND");
    }
    const pageSize = Math.max(1, Math.min(200, Math.floor(limit)));
    const messages = await loadSessionMessagesReadOnly(record.sourcePath);
    const expectedPrefix = String(record.size) + ":";
    const offset = cursor === null ? 0 : this.parseCursor(cursor, expectedPrefix);
    const page = messages.slice(offset, offset + pageSize);
    const nextCursor = offset + page.length < messages.length
      ? String(record.size) + ":" + String(offset + page.length)
      : null;
    return {
      sessionId,
      messages: page,
      nextCursor,
      staleCursor: false,
      hasMore: nextCursor !== null
    };
  }

  async forkFrom(sessionId: string): Promise<SessionRecord> {
    const records = await this.listReadOnly();
    const source = records.find((item) => item.id === sessionId);
    if (!source) {
      throw new Error("SESSION_NOT_FOUND");
    }
    if (source.writeMode === "desktop-owned") {
      throw new Error("SESSION_ALREADY_DESKTOP_OWNED");
    }
    await mkdir(this.paths.desktopSessionsDir, { recursive: true });
    const manager = await SessionManager.forkFrom(
      source.sourcePath,
      source.projectPath || this.cwd,
      this.paths.desktopSessionsDir,
      this.storage,
      { copyArtifacts: false, suppressBreadcrumb: true }
    );
    try {
      const forkPath = manager.getSessionFile();
      if (!forkPath) {
        throw new Error("FORK_DID_NOT_PERSIST");
      }
      await manager.flush();
      const forked = await this.readInfo(forkPath, "desktop");
      if (!forked) {
        throw new Error("FORK_NOT_LISTABLE");
      }
      return {
        ...forked,
        sourceSessionId: source.id,
        parentSessionId: source.id,
        owner: "desktop",
        handoffState: "none",
        writeMode: "desktop-owned"
      };
    } finally {
      await manager.close();
    }
  }

  private async listDirectory(directory: string, source: SessionSource): Promise<SessionRecord[]> {
    await mkdir(directory, { recursive: true });
    const infos = await listSessionsReadOnly(directory, this.storage);
    return infos.map((info) => this.mapInfo(info, source));
  }

  private async readInfo(filePath: string, source: SessionSource): Promise<SessionRecord | null> {
    const infos = await listSessionsReadOnly(this.paths.desktopSessionsDir, this.storage);
    const info = infos.find((item) => item.path === filePath);
    return info ? this.mapInfo(info, source) : null;
  }

  private mapInfo(info: SessionInfo, source: SessionSource): SessionRecord {
    return {
      id: info.id,
      sourcePath: info.path,
      displayName: info.title ?? (info.firstMessage.slice(0, 80) || info.id),
      projectPath: info.cwd || this.cwd,
      updatedAt: info.modified.toISOString(),
      writeMode: source === "desktop" ? "desktop-owned" : "history-readonly",
      sourceSessionId: null,
      parentSessionId: info.parentSessionPath ? this.parentId(info.parentSessionPath) : null,
      owner: source === "desktop" ? "desktop" : "none",
      handoffState: "none",
      size: info.size
    };
  }

  private parentId(parentPath: string): string {
    const name = parentPath.split(/[\\/]/).pop() ?? parentPath;
    return name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length).split("_").at(-1) ?? name : name;
  }

  private parseCursor(cursor: string, expectedPrefix: string): number {
    if (!cursor.startsWith(expectedPrefix)) {
      throw new Error("STALE_CURSOR");
    }
    const offset = Number(cursor.slice(expectedPrefix.length));
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("STALE_CURSOR");
    }
    return offset;
  }
}
