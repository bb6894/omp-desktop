import { useState } from "react";

/** Composer-first entry for a new desktop-owned session. */
export function NewSessionPrompt({
  busy,
  onSubmit,
  onCancel,
  projectPath
}: {
  busy: boolean;
  onSubmit: (message: string) => void;
  onCancel: () => void;
  projectPath: string | null;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <section className="new-session" aria-label="新建会话">
      <h2 className="new-session__title">告诉 OMP 你需要的结果</h2>
      {projectPath !== null && (
        <p className="new-session__project" title={projectPath}>
          项目：{projectPath}
        </p>
      )}
      <textarea
        className="new-session__input"
        value={value}
        rows={3}
        autoFocus
        placeholder="例如：修复登录超时并补上回归测试…"
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <div className="new-session__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || trimmed.length === 0}
          onClick={() => onSubmit(trimmed)}
        >
          {busy ? "正在创建…" : "开始"}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </section>
  );
}
