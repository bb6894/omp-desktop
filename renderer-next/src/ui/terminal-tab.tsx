import { useState } from "react";
import type { TerminalModel } from "../lib/event-reducer";

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function TerminalTab({ model }: { model: TerminalModel }) {
  if (model.entries.length === 0) {
    return (
      <div className="terminal-empty">
        <p>暂无命令执行记录</p>
        <p className="terminal-hint">Agent 执行 shell 命令时，输出将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="terminal">
      <div className="terminal__header">
        <span className="terminal__icon">{">_"}</span>
        <span className="terminal__title">终端</span>
        <span className="terminal__count">{model.entries.length} 条记录</span>
      </div>
      <div className="terminal__body">
        {model.entries.map((entry: TerminalModel["entries"][0]) => (
          <TerminalEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function TerminalEntry({ entry }: { entry: TerminalModel["entries"][0] }) {
  const [expanded, setExpanded] = useState(true);
  const isFailure = entry.exitCode !== null && entry.exitCode !== 0;
  const isEmpty = !entry.output && !entry.command;

  if (isEmpty) return null;

  return (
    <div className={`terminal-entry${isFailure ? " terminal-entry--failed" : ""}`}>
      <button
        type="button"
        className="terminal-entry__header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="terminal-entry__prompt">$</span>
        <span className="terminal-entry__command">{entry.command || "执行命令..."}</span>
        <span className="terminal-entry__time">{formatTime(entry.timestamp)}</span>
        {entry.exitCode !== null && (
          <span className={`terminal-entry__exit-code terminal-entry__exit-code--${isFailure ? "fail" : "ok"}`}>
            {isFailure ? `✗ ${entry.exitCode}` : `✓ ${entry.exitCode}`}
          </span>
        )}
        <span className="terminal-entry__toggle">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && entry.output && (
        <pre className="terminal-entry__output">{entry.output}</pre>
      )}
    </div>
  );
}
