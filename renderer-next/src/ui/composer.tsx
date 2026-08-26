import { useEffect, useMemo, useState } from "react";
import type { WorkbenchState } from "../bridge/product-bridge";
import type { SlashCommandInfo } from "../../../protocol/domain";
import {
  matchSlashCommands,
  parseBangInput,
  parseSlashInput,
  runtimeCommandToPalette,
  type SlashCommand
} from "../lib/slash-commands";

export function Composer({
  workbench,
  busy,
  turnActive,
  runtimeCommands,
  onSend,
  onSteer,
  onSlashCommand,
  onRunBash,
  onModelChange,
  onCycleThinking
}: {
  workbench: WorkbenchState | null;
  busy: boolean;
  /** True while the agent's turn is running: plain sends become steers. */
  turnActive: boolean;
  /** Live Runtime registry streamed via commands.update. */
  runtimeCommands: readonly SlashCommandInfo[];
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onSlashCommand: (command: SlashCommand, rest: string) => void;
  onRunBash: (command: string) => void;
  onModelChange: (provider: string, modelId: string) => void;
  onCycleThinking: () => void;
}) {
  const [value, setValue] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const trimmed = value.trim();
  const parsedSlash = parseSlashInput(value);
  const bangCommand = parseBangInput(value);
  const menuOpen = parsedSlash !== null && !trimmed.includes("\n");
  const menuItems = useMemo(() => {
    if (!menuOpen || !parsedSlash) return [];
    const runtime = runtimeCommands.map(runtimeCommandToPalette);
    return matchSlashCommands(parsedSlash.name, runtime);
  }, [menuOpen, parsedSlash, runtimeCommands]);

  useEffect(() => {
    setMenuIndex(0);
  }, [value]);

  const submit = () => {
    if (!trimmed || busy) return;
    if (bangCommand !== null && parsedSlash === null) {
      onRunBash(bangCommand);
      setValue("");
      setMenuIndex(0);
      return;
    }
    if (parsedSlash) {
      const query = parsedSlash.name.toLowerCase();
      const exact =
        menuItems.find((command) => command.name === query) ??
        menuItems.find((command) => command.name.startsWith(query));
      if (exact) {
        onSlashCommand(exact, parsedSlash.rest);
        setValue("");
        setMenuIndex(0);
        return;
      }
      // Unknown /token: let the Runtime decide (it owns skills/MCP commands
      // that may not be in the streamed registry yet).
      if (turnActive) onSteer(trimmed);
      else onSend(trimmed);
      setValue("");
      setMenuIndex(0);
      return;
    }
    if (turnActive) onSteer(trimmed);
    else onSend(trimmed);
    setValue("");
  };

  return (
    <section className="composer" aria-label="发送指令">
      <div className="composer__controls">
        <span className="composer__label">工作台设置</span>
        <label className="composer__field">
          模型
          <select
            value={workbench?.model ?? ""}
            disabled={workbench === null || workbench.models.length === 0}
            onChange={(event) => {
              const index = event.currentTarget.selectedIndex;
              const selected = workbench?.models[index];
              if (selected) onModelChange(selected.provider, selected.id);
            }}
          >
            {(workbench?.models ?? []).map((model) => (
              <option key={`${model.provider}/${model.id}`} value={model.id}>
                {model.provider}/{model.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button composer__thinking"
          disabled={workbench === null}
          onClick={onCycleThinking}
          title="切换思考级别"
        >
          思考级别：{workbench?.thinkingLevel ?? "—"}
        </button>
        {workbench?.queuedCount ? (
          <span className="composer__queued" title="运行中入队的消息数">
            队列 {workbench.queuedCount}
          </span>
        ) : null}
      </div>
      <div className="composer__body">
        {menuOpen && menuItems.length > 0 && (
          <ul className="slash-menu" role="listbox" aria-label="斜杠命令">
            {menuItems.map((command, index) => (
              <li key={`${command.source}/${command.name}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === menuIndex}
                  className={
                    "slash-menu__item" + (index === menuIndex ? " slash-menu__item--active" : "")
                  }
                  onMouseEnter={() => setMenuIndex(index)}
                  onClick={() => {
                    onSlashCommand(command, parsedSlash?.rest ?? "");
                    setValue("");
                    setMenuIndex(0);
                  }}
                >
                  <span className="slash-menu__token">/{command.name}</span>
                  {command.argsHint && <code className="slash-menu__args">{command.argsHint}</code>}
                  <span className="slash-menu__label">{command.label}</span>
                  <span className="slash-menu__desc">{command.description}</span>
                  {command.source !== "desktop" && (
                    <span className="slash-menu__source">{command.source}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className="composer__input"
          rows={3}
          placeholder={
            turnActive
              ? "回合进行中——输入内容将作为插话（Steer）立即送达…"
              : "告诉 OMP 下一步要完成什么…（/ 命令 · ! 直接执行 shell）"
          }
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (menuOpen && menuItems.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMenuIndex((index) => (index + 1) % menuItems.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMenuIndex((index) => (index - 1 + menuItems.length) % menuItems.length);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey && trimmed) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <button
        type="button"
        className="button button--primary composer__send"
        disabled={busy || trimmed.length === 0}
        onClick={submit}
      >
        {bangCommand !== null ? "执行 Shell" : turnActive ? "插话（Steer）" : "发送指令"}
      </button>
      <p className="composer__hint">
        Enter 发送 · Shift+Enter 换行 · / 命令 · ! shell{turnActive ? " · 运行中发送即插话" : ""}
      </p>
    </section>
  );
}
