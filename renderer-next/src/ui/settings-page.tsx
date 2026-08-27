
export type AppSettings = {
  defaultModel: string;
  defaultThinkingLevel: string;
  theme: "dark" | "light" | "system";
  fontSize: "small" | "medium" | "large";
  language: "zh-CN" | "en";
  approvalMode: "ask" | "auto" | "plan";
};

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (updater: Partial<AppSettings>) => void;
  onClose: () => void;
}

const THEMES: { value: AppSettings["theme"]; label: string }[] = [
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
  { value: "system", label: "跟随系统" }
];

const FONT_SIZES: { value: AppSettings["fontSize"]; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" }
];

const LANGUAGES: { value: AppSettings["language"]; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English (预留)" }
];

const APPROVAL_MODES: { value: AppSettings["approvalMode"]; label: string }[] = [
  { value: "ask", label: "每次询问" },
  { value: "auto", label: "自动批准" },
  { value: "plan", label: "计划模式" }
];

export function SettingsPage({ settings, onUpdate, onClose }: SettingsPageProps) {
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h2 className="settings-page__title">设置</h2>
        <button type="button" className="settings-page__close" onClick={onClose} aria-label="关闭设置">
          ✕
        </button>
      </div>

      <div className="settings-content">
        {/* 模型配置 */}
        <section className="settings-section">
          <h3 className="settings-section__title">🤖 模型配置</h3>
          <div className="settings-row">
            <span className="settings-row__label">默认思考级别</span>
            <select
              value={settings.defaultThinkingLevel}
              onChange={(e) => onUpdate({ defaultThinkingLevel: e.target.value })}
              className="settings-select"
            >
              <option value="low">低 (快速)</option>
              <option value="medium">中 (平衡)</option>
              <option value="high">高 (详细)</option>
              <option value="xhigh">极高 (深度分析)</option>
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">默认模型</span>
            <input
              type="text"
              value={settings.defaultModel}
              onChange={(e) => onUpdate({ defaultModel: e.target.value })}
              placeholder="留空使用运行时默认"
              className="settings-input"
            />
          </div>
        </section>

        {/* 外观 */}
        <section className="settings-section">
          <h3 className="settings-section__title">🎨 外观</h3>
          <div className="settings-row">
            <span className="settings-row__label">主题</span>
            <select
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value as AppSettings["theme"] })}
              className="settings-select"
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">字体大小</span>
            <select
              value={settings.fontSize}
              onChange={(e) => onUpdate({ fontSize: e.target.value as AppSettings["fontSize"] })}
              className="settings-select"
            >
              {FONT_SIZES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 语言 */}
        <section className="settings-section">
          <h3 className="settings-section__title">🌐 语言</h3>
          <div className="settings-row">
            <span className="settings-row__label">界面语言</span>
            <select
              value={settings.language}
              onChange={(e) => onUpdate({ language: e.target.value as AppSettings["language"] })}
              className="settings-select"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 审批策略 */}
        <section className="settings-section">
          <h3 className="settings-section__title">🔒 审批策略</h3>
          <div className="settings-row">
            <span className="settings-row__label">默认审批模式</span>
            <select
              value={settings.approvalMode}
              onChange={(e) => onUpdate({ approvalMode: e.target.value as AppSettings["approvalMode"] })}
              className="settings-select"
            >
              {APPROVAL_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <button type="button" className="button button--primary" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}
