import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionViewData } from "../lib/session-lifecycle";
import { groupSessionsByState, type SessionGroup } from "../lib/session-lifecycle";

const GROUP_ORDER: readonly SessionGroup[] = ["进行中", "等待你处理", "已完成"];
const MAX_NAME_LEN = 64;

export type RailMode = null | "fork" | "handoff";

function isContinuable(view: SessionViewData, isSelected: boolean): boolean {
  return view.writeMode === "history-readonly" && isSelected;
}

export function LeftRail({
  views,
  selectedId,
  onSelect,
  onContinue,
  onNewSession,
  canCreate,
  onRename,
  mode,
  modeSessionId,
  forkInput,
  handoffInput,
  onForkInput,
  onHandoffInput,
  onConfirmFork,
  onConfirmHandoff,
  onCancel,
}: {
  views: readonly SessionViewData[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  onContinue?: (sessionId: string) => void;
  onNewSession?: () => void;
  canCreate?: boolean;
  onRename?: (sessionId: string, name: string) => void;
  mode: RailMode;
  modeSessionId: string | null;
  forkInput: string;
  handoffInput: string;
  onForkInput: (v: string) => void;
  onHandoffInput: (v: string) => void;
  onConfirmFork: () => void;
  onConfirmHandoff: () => void;
  onCancel: () => void;
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
              <SessionItem
                key={view.id}
                view={view}
                isSelected={view.id === selectedId}
                onSelect={() => onSelect(view.id)}
                onRename={onRename}
                onContinue={onContinue}
                mode={mode}
                isModeSession={view.id === modeSessionId}
                forkInput={forkInput}
                handoffInput={handoffInput}
                onForkInput={onForkInput}
                onHandoffInput={onHandoffInput}
                onConfirmFork={onConfirmFork}
                onConfirmHandoff={onConfirmHandoff}
                onCancel={onCancel}
              />
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

function SessionItem({
  view,
  isSelected,
  onSelect,
  onRename,
  onContinue,
  mode,
  isModeSession,
  forkInput,
  handoffInput,
  onForkInput,
  onHandoffInput,
  onConfirmFork,
  onConfirmHandoff,
  onCancel,
}: {
  view: SessionViewData;
  isSelected: boolean;
  onSelect: () => void;
  onRename?: (sessionId: string, name: string) => void;
  onContinue?: (sessionId: string) => void;
  mode: RailMode;
  isModeSession: boolean;
  forkInput: string;
  handoffInput: string;
  onForkInput: (v: string) => void;
  onHandoffInput: (v: string) => void;
  onConfirmFork: () => void;
  onConfirmHandoff: () => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(view.title);
    setEditing(true);
  }, [view.title]);

  const submit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_NAME_LEN && onRename) {
      onRename(view.id, trimmed);
    }
    setEditing(false);
  }, [draft, view.id, onRename]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft("");
  }, []);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  // Close edit on outside click
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".left-rail__item-edit")) return;
      submit();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing, submit]);

  if (editing) {
    return (
      <li>
        <div className="left-rail__item left-rail__item--active left-rail__item-edit">
          <input
            ref={inputRef}
            type="text"
            className="left-rail__rename-input"
            value={draft}
            maxLength={MAX_NAME_LEN}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              else if (e.key === "Escape") cancel();
            }}
            onBlur={submit}
            aria-label="重命名会话"
          />
          <span className="left-rail__rename-hint">{draft.length}/{MAX_NAME_LEN}</span>
        </div>
      </li>
    );
  }

  return (
    <li>
      <div className="left-rail__item-wrap">
        <button
          type="button"
          className={"left-rail__item" + (isSelected ? " left-rail__item--active" : "")}
          onClick={onSelect}
          onDoubleClick={startEdit}
          title="双击或右键重命名"
        >
          <span className="left-rail__item-title" title={view.title}>{view.title}</span>
          {view.writeMode === "history-readonly" && (
            <span className="left-rail__marker">只读来源</span>
          )}
        </button>
        <div className="left-rail__actions">
          <button
            type="button"
            className="left-rail__action"
            title="从此条消息分叉"
            onClick={() => {
              if (mode === "fork" && isModeSession) onCancel();
              else onSelect();
            }}
          >
            {mode === "fork" && isModeSession ? "✕" : "⟿"}
          </button>
          <button
            type="button"
            className="left-rail__action"
            title="交接并创建新会话"
            onClick={() => {
              if (mode === "handoff" && isModeSession) onCancel();
              else onSelect();
            }}
          >
            {mode === "handoff" && isModeSession ? "✕" : "⇥"}
          </button>
        </div>
      </div>
      {isModeSession && mode === "fork" && (
        <div className="left-rail__mode-form">
          <input
            type="text"
            className="left-rail__input"
            placeholder="输入 entryId（见时间线）"
            value={forkInput}
            onChange={(e) => onForkInput(e.target.value)}
            autoFocus
          />
          <div className="left-rail__mode-btns">
            <button
              type="button"
              className="button button--primary left-rail__mode-btn"
              disabled={!forkInput.trim()}
              onClick={onConfirmFork}
            >
              分叉
            </button>
            <button
              type="button"
              className="button left-rail__mode-btn"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {isModeSession && mode === "handoff" && (
        <div className="left-rail__mode-form">
          <input
            type="text"
            className="left-rail__input"
            placeholder="自定义交接指令（可选）"
            value={handoffInput}
            onChange={(e) => onHandoffInput(e.target.value)}
            autoFocus
          />
          <div className="left-rail__mode-btns">
            <button
              type="button"
              className="button button--primary left-rail__mode-btn"
              onClick={onConfirmHandoff}
            >
              交接
            </button>
            <button
              type="button"
              className="button left-rail__mode-btn"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {isContinuable(view, isSelected) && onContinue && !mode && (
        <button
          type="button"
          className="left-rail__continue"
          onClick={() => onContinue(view.id)}
        >
          继续（创建桌面副本）
        </button>
      )}
      {onRename && (
        <button
          type="button"
          className="left-rail__rename-btn"
          onClick={startEdit}
          aria-label="重命名会话"
          title="重命名"
        >
          ✏️
        </button>
      )}
    </li>
  );
}
