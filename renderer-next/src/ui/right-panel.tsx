import type { TaskProjection } from "@omp/product-contracts";

const STATE_LABEL = {
  idle: "空闲",
  running: "运行中",
  "waiting-user": "等待你处理",
  failed: "失败"
} as const;

export function RightPanel({ task }: { task: TaskProjection | null }) {
  return (
    <aside className="right-panel" aria-label="任务详情">
      <h2 className="right-panel__title">任务详情</h2>
      {task === null ? (
        <p className="right-panel__placeholder">从左侧选择一个任务查看详情。</p>
      ) : (
        <div className="right-panel__body">
          <p className="right-panel__task-title">{task.title}</p>
          <dl className="right-panel__meta">
            <div>
              <dt>状态</dt>
              <dd>{STATE_LABEL[task.runtimeState]}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{task.origin === "terminal-history" ? "只读来源" : "桌面副本"}</dd>
            </div>
          </dl>
          <button type="button" className="button" disabled>
            打开工作区（即将可用）
          </button>
        </div>
      )}
    </aside>
  );
}
