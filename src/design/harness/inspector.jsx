/* ═════════════════════════════════════════════════════════════════════
   harness/inspector.jsx — Stage 2 read-only Harness Inspector dialog
   with the Stage 3C proposal-review mode.

   Renders the frozen OMP_BRIDGE.inspectHarness() DTO as escaped React
   text only. Harness strings are untrusted local data, so every value
   goes through plain text interpolation. The browse mode never writes
   Harness state; the explicit review mode delegates all writes to the
   Host-governed preview/apply/rollback bridge methods.
   ═════════════════════════════════════════════════════════════════════ */

const { ProposalReviewPanel } = window;

const HARNESS_DISPLAY_LIMIT = 50;

const HARNESS_GROUPS = [
  { key: "goals", label: "目标" },
  { key: "memories", label: "记忆" },
  { key: "skills", label: "技能" },
  { key: "agentProfiles", label: "代理配置" },
  { key: "proposals", label: "改进提议" },
  { key: "refinementHistory", label: "改进记录" },
  { key: "snapshots", label: "快照" },
];

const HARNESS_ERROR_COPY = {
  HARNESS_NOT_CONNECTED: "当前没有可用的桌面会话。",
  HARNESS_SESSION_CHANGED: "检查期间会话已切换，请重新打开 Harness 检查器。",
  HARNESS_STATE_INVALID_JSON: "Harness 状态文件不是有效的 JSON。",
  HARNESS_SCHEMA_UNSUPPORTED: "Harness 状态版本不受支持。",
  HARNESS_PROJECT_MISMATCH: "Harness 状态不属于当前项目。",
  HARNESS_INCOMPATIBLE: "Harness 状态与当前 OMP Runtime 或 Host 协议不兼容。",
  HARNESS_STATE_INVALID: "Harness 状态结构不符合安全合同。",
  HARNESS_STATE_TOO_LARGE: "Harness 状态文件超过 1 MiB 上限。",
  HARNESS_STATE_LIMIT_EXCEEDED: "Harness 文本或集合超过安全上限。",
  HARNESS_SECRET_DETECTED: "Harness 状态疑似包含密钥、令牌或私钥，已拒绝显示。",
};

const HARNESS_STATUS_COPY = {
  active: "进行中",
  approved: "已批准",
  completed: "已完成",
  paused: "已暂停",
  proposed: "待审核",
  quarantined: "已隔离",
  rejected: "已拒绝",
  reverted: "已回退",
};

function HarnessEntry({ entry }) {
  const heading = entry.title ?? entry.summary ?? entry.reason ?? entry.id ?? "未命名条目";
  const detail = entry.content ?? entry.proposedValue ?? null;
  const status = entry.status ?? entry.outcome ?? null;
  return (
    <article className="harness-entry">
      <div className="harness-entry-head">
        <strong className="selectable">{heading}</strong>
        {status && (
          <span className="chip muted" title={status} aria-label={`状态：${HARNESS_STATUS_COPY[status] ?? status}`}>
            {HARNESS_STATUS_COPY[status] ?? status}
          </span>
        )}
      </div>
      <div className="harness-entry-meta mono selectable">
        {entry.id ?? "—"}
        {entry.scope ? ` · ${entry.scope}` : ""}
        {entry.role ? ` · ${entry.role}` : ""}
      </div>
      {detail && <div className="harness-entry-content selectable">{detail}</div>}
    </article>
  );
}

function HarnessSection({ label, entries }) {
  const visible = entries.slice(0, HARNESS_DISPLAY_LIMIT);
  return (
    <section className="harness-section">
      <div className="harness-section-title">
        <span>{label}</span>
        <span className="chip muted">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div className="harness-section-empty">暂无内容</div>
      ) : (
        <div className="harness-entry-list">
          {visible.map((entry, index) => (
            <HarnessEntry key={entry.id ?? `${label}-${index}`} entry={entry} />
          ))}
          {entries.length > HARNESS_DISPLAY_LIMIT && (
            <div className="harness-section-empty">
              为保持界面流畅，仅显示前 {HARNESS_DISPLAY_LIMIT} 条；总计 {entries.length} 条。
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HarnessInspector({ open, inspection, loading, error, onClose, onRefresh, review }) {
  const dialogRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  const [mode, setMode] = React.useState("browse");

  React.useEffect(() => {
    if (open) return undefined;
    setMode("browse");
    return undefined;
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKeyDown = event => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!dialogRef.current.contains(activeElement) || activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      const previousFocus = previousFocusRef.current;
      const canRestorePrevious = previousFocus?.isConnected
        && previousFocus !== document.body
        && previousFocus !== document.documentElement;
      const fallbackFocus = document.querySelector(".composer-input textarea:not([disabled])");
      (canRestorePrevious ? previousFocus : fallbackFocus)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const state = inspection?.state ?? null;
  const total = state
    ? HARNESS_GROUPS.reduce((sum, group) => sum + (state[group.key]?.length ?? 0), 0)
    : 0;
  const hasTruncatedGroup = state
    ? HARNESS_GROUPS.some(group => state[group.key]?.length > HARNESS_DISPLAY_LIMIT)
    : false;
  const errorCopy = error ? (HARNESS_ERROR_COPY[error] ?? "Harness 检查失败，请查看错误代码。") : null;

  return (
    <div
      className="harness-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className="harness-dialog glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-title"
        tabIndex={-1}
      >
        <header className="harness-header">
          <div>
            <div className="harness-eyebrow" title={mode === "review" ? "Stage 3C · Proposal review" : "Stage 2 · Read-only"}>
              {mode === "review" ? "阶段 3 · 提案评审" : "阶段 2 · 只读"}
            </div>
            <h2 id="harness-title">Harness 检查器</h2>
            <p>{mode === "review"
              ? "撰写记忆提案并生成 Host 预览；应用需要非空的批准人与理由，写入前会自动创建快照。"
              : "查看当前项目的持久目标、记忆、技能和改进记录。此界面不会创建文件、启动 Agent 或激活任何条目。"}</p>
          </div>
          <div className="harness-actions">
            {state && (
              <div className="harness-mode-switch" role="tablist" aria-label="Harness 检查器模式">
                <button className={`btn small${mode === "browse" ? " outlined" : " ghost"}`} type="button" role="tab"
                  aria-selected={mode === "browse"} onClick={() => setMode("browse")}>只读浏览</button>
                <button className={`btn small${mode === "review" ? " outlined" : " ghost"}`} type="button" role="tab"
                  aria-selected={mode === "review"} onClick={() => setMode("review")}>提案评审</button>
              </div>
            )}
            <button className="btn outlined" type="button" onClick={onRefresh} disabled={loading}>刷新</button>
            <button className="btn icon ghost" type="button" onClick={onClose} title="关闭 Harness 检查器" aria-label="关闭 Harness 检查器">×</button>
          </div>
        </header>

        <div className="harness-body">
          {loading && <div className="harness-state-card">正在读取只读 Harness 状态…</div>}

          {!loading && errorCopy && (
            <div className="harness-state-card harness-error" role="alert">
              <strong>{errorCopy}</strong>
              <span className="mono selectable">{error}</span>
            </div>
          )}

          {!errorCopy && state && mode === "review" && (
            <ProposalReviewPanel memories={state.memories} review={review} />
          )}

          {!loading && !errorCopy && state && mode === "browse" && (
            <>
              <div className="harness-meta-grid">
                <div className="harness-meta-card">
                  <span>项目</span>
                  <strong className="mono selectable" title={state.projectPath}>{state.projectPath}</strong>
                </div>
                <div className="harness-meta-card"><span title="Schema">数据格式版本</span><strong>v{state.schemaVersion}</strong></div>
                <div className="harness-meta-card"><span title="OMP Runtime">OMP 运行时</span><strong>{state.compatibility.runtimeVersion}</strong></div>
                <div className="harness-meta-card"><span title="Host protocol">Host 协议</span><strong>v{state.compatibility.hostProtocol}</strong></div>
                <div className="harness-meta-card"><span>条目总数</span><strong>{total}</strong></div>
              </div>

              {total === 0 && (
                <div className="harness-state-card">
                  当前项目尚无 Harness 条目。缺少状态文件是合法的空状态，检查器不会因此创建任何文件。
                </div>
              )}

              <div className="harness-summary-grid">
                {HARNESS_GROUPS.map(group => (
                  <div className="harness-summary-card" key={group.key}>
                    <span>{group.label}</span>
                    <strong>{state[group.key].length}</strong>
                  </div>
                ))}
              </div>

              {hasTruncatedGroup && (
                <div className="harness-state-card harness-limit-note">
                  为保持界面流畅，超过 {HARNESS_DISPLAY_LIMIT} 条的分类仅展示前 {HARNESS_DISPLAY_LIMIT} 条；每个分类末尾会标注总数。
                </div>
              )}

              <div className="harness-sections">
                {HARNESS_GROUPS.map(group => (
                  <HarnessSection key={group.key} label={group.label} entries={state[group.key]} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

window.HarnessInspector = HarnessInspector;
