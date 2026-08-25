import { groupTasks, type TaskGroupKey } from "../lib/task-grouping";
import type { TaskProjection } from "@omp/product-contracts";

const GROUP_ORDER: readonly TaskGroupKey[] = ["进行中", "等待你处理", "已完成"];

export function LeftRail({
  tasks,
  selectedId,
  onSelect
}: {
  tasks: readonly TaskProjection[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const groups = groupTasks(tasks);
  return (
    <nav className="left-rail" aria-label="任务列表">
      <div className="left-rail__brand">OMP</div>
      {GROUP_ORDER.map((key) => (
        <section key={key} className="left-rail__group">
          <h3 className="left-rail__group-label">
            {key}
            <span className="left-rail__count">{groups[key].length}</span>
          </h3>
          <ul className="left-rail__list">
            {groups[key].map((task) => (
              <li key={task.taskId}>
                <button
                  type="button"
                  className={
                    "left-rail__item" + (task.taskId === selectedId ? " left-rail__item--active" : "")
                  }
                  onClick={() => onSelect(task.taskId)}
                >
                  <span className="left-rail__item-title">{task.title}</span>
                  {task.origin === "terminal-history" && (
                    <span className="left-rail__marker">只读来源</span>
                  )}
                </button>
              </li>
            ))}
            {groups[key].length === 0 && <li className="left-rail__empty">暂无任务</li>}
          </ul>
        </section>
      ))}
    </nav>
  );
}
