import type { SessionRecordInput, TaskMetadataRecord, TaskProjection, TaskRuntimeState } from "../../src/product-contracts";

/**
 * Frozen cross-plan projection vectors (Plan 1, Task 2).
 *
 * Consumers assert against these exact tuples: host tests (product-contracts.test.ts),
 * renderer-next tests (via the @fixture-vectors alias), and Plan 2's real session-record
 * mapper (parity proof). Treat every entry as immutable once committed.
 */
export type ProjectionVector = {
  name: string;
  input: SessionRecordInput;
  metadata: TaskMetadataRecord | null;
  runtimeState: TaskRuntimeState;
  expected: TaskProjection;
};

const PROJECT = "C:\\Users\\yyds\\Desktop\\OMP验收-A";
const UPDATED = "2026-08-24T09:40:18.123Z";
const VIEWED = "2026-08-24T10:15:00.000Z";

export const TASK_PROJECTION_VECTORS: ProjectionVector[] = [
  {
    name: "desktop-owned idle without metadata defaults organization fields",
    input: {
      id: "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8",
      displayName: "Refactor host dispatch",
      projectPath: PROJECT,
      updatedAt: UPDATED,
      writeMode: "desktop-owned"
    },
    metadata: null,
    runtimeState: "idle",
    expected: {
      taskId: "2026-08-24T09-40-18-123Z_01a03324-644c-7000-b7ff-185eac151ea8",
      title: "Refactor host dispatch",
      origin: "desktop-owned",
      writable: true,
      projectPath: PROJECT,
      runtimeState: "idle",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: UPDATED
    }
  },
  {
    name: "desktop-owned running with pinned metadata",
    input: {
      id: "2026-08-24T02-11-08-818Z_01a03189-2d91-7000-bccc-a701c3228958",
      displayName: "迁移渲染层",
      projectPath: PROJECT,
      updatedAt: "2026-08-24T02:11:08.818Z",
      writeMode: "desktop-owned"
    },
    metadata: { completed: false, pinned: true, lastViewedAt: VIEWED },
    runtimeState: "running",
    expected: {
      taskId: "2026-08-24T02-11-08-818Z_01a03189-2d91-7000-bccc-a701c3228958",
      title: "迁移渲染层",
      origin: "desktop-owned",
      writable: true,
      projectPath: PROJECT,
      runtimeState: "running",
      completed: false,
      pinned: true,
      lastViewedAt: VIEWED,
      updatedAt: "2026-08-24T02:11:08.818Z"
    }
  },
  {
    name: "desktop-owned waiting-user stays incomplete even if metadata asks otherwise is rejected elsewhere",
    input: {
      id: "2026-08-23T10-49-39-845Z_01a02e3d-8904-7000-86d6-344782e8deb7",
      displayName: "等待审批的写入提案",
      projectPath: PROJECT,
      updatedAt: "2026-08-23T10:49:39.845Z",
      writeMode: "desktop-owned"
    },
    metadata: { completed: false, pinned: false, lastViewedAt: VIEWED },
    runtimeState: "waiting-user",
    expected: {
      taskId: "2026-08-23T10-49-39-845Z_01a02e3d-8904-7000-86d6-344782e8deb7",
      title: "等待审批的写入提案",
      origin: "desktop-owned",
      writable: true,
      projectPath: PROJECT,
      runtimeState: "waiting-user",
      completed: false,
      pinned: false,
      lastViewedAt: VIEWED,
      updatedAt: "2026-08-23T10:49:39.845Z"
    }
  },
  {
    name: "terminal-history idle fork source is read-only",
    input: {
      id: "2026-08-21T14-35-29-102Z_01a024bf-8fce-7606-9084-25af26d20c37",
      displayName: "终端历史：圆锁信排查",
      projectPath: "C:\\Users\\yyds\\Desktop\\OH-WorkSpace\\圆锁信",
      updatedAt: "2026-08-21T14:35:29.102Z",
      writeMode: "history-readonly"
    },
    metadata: null,
    runtimeState: "idle",
    expected: {
      taskId: "2026-08-21T14-35-29-102Z_01a024bf-8fce-7606-9084-25af26d20c37",
      title: "终端历史：圆锁信排查",
      origin: "terminal-history",
      writable: false,
      projectPath: "C:\\Users\\yyds\\Desktop\\OH-WorkSpace\\圆锁信",
      runtimeState: "idle",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: "2026-08-21T14:35:29.102Z"
    }
  },
  {
    name: "terminal-history idle with completed marker from explicit user action",
    input: {
      id: "2026-08-20T08-00-00-000Z_01a019c2-abcd-7000-9ef0-112233445566",
      displayName: "已完成的历史会话",
      projectPath: PROJECT,
      updatedAt: "2026-08-20T08:00:00.000Z",
      writeMode: "history-readonly"
    },
    metadata: { completed: true, pinned: true, lastViewedAt: VIEWED },
    runtimeState: "idle",
    expected: {
      taskId: "2026-08-20T08-00-00-000Z_01a019c2-abcd-7000-9ef0-112233445566",
      title: "已完成的历史会话",
      origin: "terminal-history",
      writable: false,
      projectPath: PROJECT,
      runtimeState: "idle",
      completed: true,
      pinned: true,
      lastViewedAt: VIEWED,
      updatedAt: "2026-08-20T08:00:00.000Z"
    }
  },
  {
    name: "desktop-owned failed may carry completed marker",
    input: {
      id: "2026-08-22T05-57-32-076Z_01a0280b-b92c-72a0-aaeb-d120603fbd19",
      displayName: "失败的构建修复尝试",
      projectPath: PROJECT,
      updatedAt: "2026-08-22T05:57:32.076Z",
      writeMode: "desktop-owned"
    },
    metadata: { completed: true, pinned: false, lastViewedAt: null },
    runtimeState: "failed",
    expected: {
      taskId: "2026-08-22T05-57-32-076Z_01a0280b-b92c-72a0-aaeb-d120603fbd19",
      title: "失败的构建修复尝试",
      origin: "desktop-owned",
      writable: true,
      projectPath: PROJECT,
      runtimeState: "failed",
      completed: true,
      pinned: false,
      lastViewedAt: null,
      updatedAt: "2026-08-22T05:57:32.076Z"
    }
  },
  {
    name: "UNC desktop-owned path round-trips",
    input: {
      id: "2026-08-19T12-30-45-999Z_01a01555-ffff-7000-8888-cafebabe0001",
      displayName: "\\\\NAS 共享项目任务",
      projectPath: "\\\\NAS\\share\\project",
      updatedAt: "2026-08-19T12:30:45.999Z",
      writeMode: "desktop-owned"
    },
    metadata: null,
    runtimeState: "idle",
    expected: {
      taskId: "2026-08-19T12-30-45-999Z_01a01555-ffff-7000-8888-cafebabe0001",
      title: "\\\\NAS 共享项目任务",
      origin: "desktop-owned",
      writable: true,
      projectPath: "\\\\NAS\\share\\project",
      runtimeState: "idle",
      completed: false,
      pinned: false,
      lastViewedAt: null,
      updatedAt: "2026-08-19T12:30:45.999Z"
    }
  }
];
