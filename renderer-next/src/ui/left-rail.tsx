import type { SessionViewData } from "../lib/session-lifecycle";
import { groupSessionsByState, type SessionGroup } from "../lib/session-lifecycle";

const GROUP_ORDER: readonly SessionGroup[] = ["进行中", "等待你处理", "已完成"];

const STATE_LABEL: Record<SessionViewData["runtimeState"], string> = {
  idle: "空闲",
  running: "运行中",
  "waiting-user": "等待你处理",
  failed: "失败"
};

export function LeftRail({
  views,
  selectedId,
  onSelect,
  onContinue,
  onNewSession,
  canCreate
}: {
  views: readonly SessionViewData[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  onContinue?: (sessionId: string) => void;
  onNewSession?: () => void;
  canCreate?: boolean;
}) {
  const groups = groupSessionsByState(views);
  return (
    <nav className="left-rail" aria-label="会话列表">
      <div className="left-rail__header">
        <div className="left-rail__brand">OMP</div>
        <p className="left-rail__subtitle">会话</p>
      </div>
      {GROUP_ORDER.map((key) => (
        <section key={key} className="left-rail__group">
          <h3 className="left-rail__group-label">
            {key}
            <span className="left-rail__count">{groups[key].length}</span>
          </h3>
          <ul className="left-rail__list">
            {groups[key].map((view) => (
              <li key={view.id}>
                <button
                  type="button"
                  className={
                    "left-rail__item" + (view.id === selectedId ? " left-rail__item--active" : "")
                  }
                  onClick={() => onSelect(view.id)}
                >
                  <span className="left-rail__item-title" title={view.title}>{view.title}</span>
                  {view.writeMode === "history-readonly" && (
                    <span className="left-rail__marker">只读来源</span>
                  )}
                </button>
                {onContinue && isContinuable(view, selectedId) && (
                  <button
                    type="button"
                    className="left-rail__continue"
                    onClick={() => onContinue(view.id)}
                  >
                    继续（创建桌面副本）
                  </button>
                )}
              </li>
            ))}
            {groups[key].length === 0 && <li className="left-rail__empty">暂无会话</li>}
          </ul>
        </section>
      ))}
      {onNewSession && (
        <button
          type="button"
          className="left-rail__new"
          disabled={!canCreate}
          onClick={onNewSession}
        >
          <span aria-hidden="true">+</span> 新建会话
        </button>
      )}
    </nav>
  );
}

function isContinuable(view: SessionViewData, selectedId: string | null): boolean {
  return view.writeMode === "history-readonly" && view.id === selectedId;
}

export { STATE_LABEL as SESSION_STATE_LABEL };
