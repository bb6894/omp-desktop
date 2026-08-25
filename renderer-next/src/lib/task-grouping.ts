import type { TaskProjection } from "@omp/product-contracts";

/**
 * Total grouping over projections: every task lands in exactly one group.
 * 已完成 = completed; 等待你处理 = waiting-user ranked above failed; 进行中 = the rest.
 * Within each group, updatedAt descending.
 */

export type TaskGroupKey = "进行中" | "等待你处理" | "已完成";

export type TaskGroups = Record<TaskGroupKey, TaskProjection[]>;

function compareByUpdatedDesc(a: TaskProjection, b: TaskProjection): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

const WAITING_RANK: Partial<Record<TaskProjection["runtimeState"], number>> = {
  "waiting-user": 0,
  failed: 1
};

export function groupTasks(tasks: readonly TaskProjection[]): TaskGroups {
  const groups: TaskGroups = { "进行中": [], "等待你处理": [], "已完成": [] };
  for (const task of tasks) {
    if (task.completed) {
      groups["已完成"].push(task);
    } else if (task.runtimeState === "waiting-user" || task.runtimeState === "failed") {
      groups["等待你处理"].push(task);
    } else {
      groups["进行中"].push(task);
    }
  }
  groups["进行中"].sort(compareByUpdatedDesc);
  groups["等待你处理"].sort((a, b) => {
    const rankDelta = (WAITING_RANK[a.runtimeState] ?? 9) - (WAITING_RANK[b.runtimeState] ?? 9);
    return rankDelta !== 0 ? rankDelta : compareByUpdatedDesc(a, b);
  });
  groups["已完成"].sort(compareByUpdatedDesc);
  return groups;
}
