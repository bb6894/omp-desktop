import { buildTaskProjection, type TaskMetadataIndex, type TaskMetadataRecord, type TaskProjection } from "@omp/product-contracts";
import { TASK_PROJECTION_VECTORS } from "@fixture-vectors";
import type { ProductBridge } from "./product-bridge";

/**
 * Plan-1 fixture transport. Fixtures are built THROUGH the contract guards from the
 * shared frozen vectors, so canned data can never drift from the product types.
 * Branch-only: deleted at plan-4 cutover together with the vectors alias.
 */

function buildAllFixtures(): TaskProjection[] {
  const projections: TaskProjection[] = [];
  for (const vector of TASK_PROJECTION_VECTORS) {
    const built = buildTaskProjection(vector.input, vector.metadata, vector.runtimeState);
    if (!built.ok) throw new Error(`FIXTURE_VECTOR_INVALID: ${vector.name} -> ${built.code}`);
    projections.push(built.value);
  }
  return projections;
}

export function createFixtureProductBridge(): ProductBridge {
  const fixtures = buildAllFixtures();
  const metadata = new Map<string, TaskMetadataRecord>();
  for (const task of fixtures) {
    metadata.set(task.taskId, {
      completed: task.completed,
      pinned: task.pinned,
      lastViewedAt: task.lastViewedAt
    });
  }

  return {
    async listTasks(): Promise<TaskProjection[]> {
      return fixtures.map((task) => {
        const record = metadata.get(task.taskId);
        const rebuilt = buildTaskProjection(
          {
            id: task.taskId,
            displayName: task.title,
            projectPath: task.projectPath,
            updatedAt: task.updatedAt,
            writeMode: task.origin === "desktop-owned" ? "desktop-owned" : "history-readonly"
          },
          record ?? null,
          task.runtimeState
        );
        if (!rebuilt.ok) throw new Error(`FIXTURE_REBUILD_INVALID: ${rebuilt.code}`);
        return rebuilt.value;
      });
    },

    async getTaskMetadata(): Promise<TaskMetadataIndex> {
      const index: TaskMetadataIndex = {};
      for (const [sessionId, record] of metadata) index[sessionId] = { ...record };
      return index;
    },

    async setTaskMetadata(sessionId: string, patch: Partial<TaskMetadataRecord>): Promise<TaskMetadataRecord> {
      const current = metadata.get(sessionId) ?? { completed: false, pinned: false, lastViewedAt: null };
      const merged: TaskMetadataRecord = { ...current, ...patch };
      metadata.set(sessionId, merged);
      return { ...merged };
    }
  };
}
