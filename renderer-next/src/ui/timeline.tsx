import { useState } from "react";
import type { TimelineEntry, TimelineModel } from "../lib/event-reducer";

const TOOL_STATUS_MARK: Record<string, string> = {
  running: "⏳",
  ok: "✓",
  error: "✗"
};


const TOOL_LABELS: Record<string, string> = {
  bash: "执行命令",
  read: "读取文件",
  write: "写入文件",
  edit: "编辑文件",
  grep: "内容搜索",
  glob: "文件匹配",
  ls: "列出目录",
  task: "子任务",
  quick_task: "快速子任务",
  eval: "求值代码",
  todo: "更新计划",
  todo_write: "更新计划",
  webfetch: "抓取网页"
};
function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function EntryBubble({ entry, editing, onEdit }: { entry: TimelineEntry; editing?: { id: string; text: string }; onEdit?: (action: "start" | "update" | "cancel" | "submit", entryId?: string, text?: string) => void }) {
  if (entry.kind === "user") {
    const isEditing = editing?.id === entry.id;
    return (
      <div className={isEditing ? "tl-entry tl-entry--user tl-entry--editing" : "tl-entry tl-entry--user"} data-entry-id={entry.id}>
        <span className="tl-role">你</span>
        <div className="tl-text-wrap">
          {isEditing ? (
            <textarea
              className="tl-textarea"
              value={editing.text}
              onChange={(e) => onEdit?.("update", entry.id, e.target.value)}
              rows={3}
            />
          ) : (
            <p className="tl-text">{entry.text}</p>
          )}
          {"createdAt" in entry && (
            <span className="tl-time">{formatTime(entry.createdAt)}</span>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            className="tl-entry__edit"
            title="编辑此消息"
            onClick={() => onEdit?.("start", entry.id, entry.text)}
          >
            ✏️
          </button>
        )}
        {isEditing && (
          <div className="tl-edit-actions">
            <button type="button" className="button button--ghost tl-edit-btn" onClick={() => onEdit?.("cancel")}>
              取消
            </button>
            <button type="button" className="button button--primary tl-edit-btn" onClick={() => onEdit?.("submit", entry.id, editing.text)}>
              重新生成
            </button>
          </div>
        )}
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="tl-entry tl-entry--assistant">
        <span className="tl-role">OMP</span>
        <p className="tl-text">
          {entry.text}
          {entry.streaming && <span className="tl-cursor">▍</span>}
        </p>
        <span className="tl-time">{formatTime(entry.createdAt)}</span>
      </div>
    );
  }
  if (entry.kind === "tool") {
    return (
      <div className="tl-entry tl-entry--tool">
        <span className="tl-role">工具</span>
        <p className="tl-text">
          <code>{entry.toolName}</code>{" "}
          <span className={`tl-tool-status tl-tool-status--${entry.status}`}>
            {TOOL_STATUS_MARK[entry.status]}
          </span>
        </p>
      </div>
    );
  }
  if (entry.kind === "ask") {
    return (
      <div className="tl-entry tl-entry--ask">
        <span className="tl-role">等待你处理</span>
        <p className="tl-text">{entry.title}</p>
      </div>
    );
  }
  if (entry.kind === "note") {
    return (
      <div className={`tl-entry tl-entry--note tl-note--${entry.level}`}>
        <p className="tl-text">{entry.text}</p>
      </div>
    );
  }
  return (
    <div className="tl-entry tl-entry--compact">
      <p className="tl-text">ℹ️ 上下文已压缩</p>
    </div>
  );
}

const PLAN_MARK: Record<string, string> = {
  pending: "○",
  in_progress: "▶",
  completed: "✓",
  abandoned: "⨯",
  blocked: "⛔"
};

/** Structured plan card for the Runtime's todo tool. */
function PlanBody({ entry }: { entry: Extract<TimelineEntry, { kind: "tool" }> }) {
  if (!entry.plan) return null;
  return (
    <div className="tl-card__plan" role="list" aria-label="执行计划">
      {entry.plan.map((phase) => (
        <div key={phase.name} className="tl-card__plan-phase" role="listitem">
          <p className="tl-card__plan-name">{phase.name}</p>
          <ul>
            {phase.tasks.map((task, index) => (
              <li key={`${task.content}-${index}`} data-status={task.status}>
                <span aria-hidden="true">{PLAN_MARK[task.status] ?? "○"}</span>{" "}
                <span>{task.content}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ToolCard({ entry }: { entry: Extract<TimelineEntry, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tl-card tl-card--${entry.status}`}>
      <button
        type="button"
        className="tl-card__head"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tl-card__mark">{TOOL_STATUS_MARK[entry.status]}</span>
        <code className="tl-card__name">{entry.toolName}</code>
        <span className="tl-card__zh">{TOOL_LABELS[entry.toolName] ?? ""}</span>
        <span className="tl-card__toggle">{open ? "收起" : "展开"}</span>
      </button>
      {(entry.plan || entry.code) && (
        <>
          <PlanBody entry={entry} />
          {entry.code && (
            <pre className="tl-card__output tl-card__output--code" lang={entry.language ?? undefined}>
              {entry.code}
            </pre>
          )}
        </>
      )}
      {open && !entry.plan && !entry.code && (
        <pre className="tl-card__output">
          {entry.output || "（无输出）"}
          {entry.truncated && "\n…输出已截断"}
        </pre>
      )}
    </div>
  );
}

export function Timeline({
  model,
  emptyHint,
  editing,
  onEdit
}: {
  model: TimelineModel;
  emptyHint: string;
  editing?: { id: string; text: string };
  onEdit?: (action: "start" | "update" | "cancel" | "submit", entryId?: string, text?: string) => void;
}) {
  if (model.entries.length === 0) {
    return (
      <div className="timeline timeline--empty" aria-live="polite">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="timeline" aria-live="polite">
      {model.entries.map((entry) =>
        entry.kind === "tool" ? (
          <ToolCard key={entry.id} entry={entry} />
        ) : (
          <EntryBubble key={entry.id} entry={entry} editing={editing} onEdit={onEdit} />
        )
      )}
      {model.unrecognized > 0 && (
        <p className="timeline__unrecognized">
          另有 {model.unrecognized} 条未识别事件已忽略。
        </p>
      )}
    </div>
  );
}

// Extended tool labels for completion
const ALL_TOOL_LABELS: Record<string, string> = {
  ...TOOL_LABELS,
  read_file: "读取文件",
  write_file: "写入文件",
  execute_command: "执行命令",
  search: "内容搜索",
  task: "子任务",
  get_messages: "获取消息",
  subagents: "查看子代理",
  switch_session: "切换会话",
  handoff: "交接会话"
};

export function getToolLabel(toolName: string): string {
  return ALL_TOOL_LABELS[toolName] ?? toolName;
}
