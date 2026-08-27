import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkbenchState } from "../bridge/product-bridge";
import type { SlashCommandInfo } from "../../../protocol/domain";
import {
  matchSlashCommands,
  parseBangInput,
  parseSlashInput,
  runtimeCommandToPalette,
  type SlashCommand
} from "../lib/slash-commands";

const MAX_IMAGES = 9;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type AttachedImage = {
  type: string;
  data: string;
  mimeType: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // Remove data URL prefix
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      } else {
        reject(new Error("读取文件失败"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
  onSend: (text: string, images?: AttachedImage[]) => void;
  onSteer: (text: string, images?: AttachedImage[]) => void;
  onSlashCommand: (command: SlashCommand, rest: string) => void;
  onRunBash: (command: string) => void;
  onModelChange: (provider: string, modelId: string) => void;
  onCycleThinking: () => void;
}) {
  const [value, setValue] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsedSlash = parseSlashInput(value);
  const bangCommand = parseBangInput(value);
  const trimmed = value.trim();
  const menuOpen = parsedSlash !== null && !trimmed.includes("\n");
  const menuItems = useMemo(() => {
    if (!menuOpen || !parsedSlash) return [];
    const runtime = runtimeCommands.map(runtimeCommandToPalette);
    return matchSlashCommands(parsedSlash.name, runtime);
  }, [menuOpen, parsedSlash, runtimeCommands]);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);
  useEffect(() => {
    const start = () => setIsComposing(true);
    const end = () => setIsComposing(false);
    document.addEventListener("compositionstart", start);
    document.addEventListener("compositionend", end);
    return () => {
      document.removeEventListener("compositionstart", start);
      document.removeEventListener("compositionend", end);
    };
  }, []);

  async function addImageFile(file: File): Promise<void> {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return; // silently ignore unsupported types
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return; // silently ignore oversized files
    }
    if (images.length >= MAX_IMAGES) {
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setImages((prev) => [...prev, { type: "image", data: base64, mimeType: file.type }]);
    } catch {
      // Ignore read errors
    }
  }

  function handlePaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          void addImageFile(file);
        }
      }
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    void Promise.all(files.slice(0, MAX_IMAGES - images.length).map(addImageFile)).then(() => {
      // Focus back on textarea
      const ta = document.querySelector<HTMLTextAreaElement>(".composer__input");
      ta?.focus();
    });
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
  }

  const submit = () => {
    // Allow sending when there are images even without text
    const hasContent = trimmed || images.length > 0;
    if (!hasContent || busy) return;
    if (bangCommand !== null && parsedSlash === null) {
      onRunBash(bangCommand);
      setValue("");
      setImages([]);
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
        setImages([]);
        setMenuIndex(0);
        return;
      }
      // Unknown /token: let the Runtime decide (it owns skills/MCP commands
      // that may not be in the streamed registry yet).
      if (turnActive) onSteer(trimmed, images);
      else onSend(trimmed, images);
      setValue("");
      setImages([]);
      setMenuIndex(0);
      return;
    }
    if (turnActive) onSteer(trimmed, images);
    else onSend(trimmed, images);
    setValue("");
    setImages([]);
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="composer__file-input"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []).slice(
              0,
              MAX_IMAGES - images.length
            );
            void Promise.all(files.map(addImageFile)).then(() => {
              event.currentTarget.value = "";
            });
          }}
        />
        <button
          type="button"
          className="button composer__attach"
          disabled={images.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
          title={`附加图片（最多 ${MAX_IMAGES} 张）`}
        >
          🖼 {images.length > 0 ? `${images.length}/${MAX_IMAGES}` : "图片"}
        </button>
      </div>
      <div
        className="composer__body"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {images.length > 0 && (
          <div className="composer__attachments">
            {images.map((img, index) => (
              <div key={index} className="composer__attachment">
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={`附件 ${index + 1}`}
                  className="composer__attachment-img"
                />
                <button
                  type="button"
                  className="composer__attachment-remove"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                  title="删除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
                    setImages([]);
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
            if (event.key === "Enter" && !event.shiftKey && trimmed && !isComposing) {
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
