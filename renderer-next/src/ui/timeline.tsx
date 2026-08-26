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
  todo_write: "更新计划",
  webfetch: "抓取网页"
};
function EntryBubble({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="tl-entry tl-entry--user">
        <span className="tl-role">你</span>
        <p className="tl-text">{entry.text}</p>
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
      {open && (
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
  emptyHint
}: {
  model: TimelineModel;
  emptyHint: string;
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
          <EntryBubble key={entry.id} entry={entry} />
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
