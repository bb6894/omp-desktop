/* ═════════════════════════════════════════════════════════════════════
   composer.jsx — input area + slash palette + ⌘K command bridge
   ═════════════════════════════════════════════════════════════════════ */

const { Icon } = window;

// ── The composer (input + plan/steer modes + send) ────────────────────
function Composer({ onSend, onPick, planMode, onTogglePlan, onOpenCmd, onOpenModel, currentModel, thinking, onCycleThinking, isStreaming, onAbort, onApprove, annotationCount = 0, microcopy }) {
  const [text, setText]       = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const taRef   = React.useRef(null);
  const listRef = React.useRef(null);
  // paste blocks: id → raw content; collapsed in textarea as [paste #N +K lines]
  const pasteBlocksRef   = React.useRef(new Map());
  const pasteCounterRef  = React.useRef(0);

  const cmds = window.OMP_DATA?.commands || [];

  // Derive slash state inline — no useEffect, no stale flicker
  const slashQ = text.startsWith("/") ? text.slice(1).split(" ")[0].toLowerCase() : null;
  const filtered = slashQ !== null
    ? cmds.filter(c => !slashQ || c.name.startsWith(slashQ) || c.name.includes(slashQ))
    : [];
  const showSlash = filtered.length > 0;

  // Keep activeIdx in bounds; auto-select when single result
  const clampedIdx = showSlash ? Math.min(activeIdx, filtered.length - 1) : 0;

  // Scroll active item into view
  React.useEffect(() => {
    if (!showSlash || !listRef.current) return;
    const el = listRef.current.children[clampedIdx];
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedIdx, showSlash]);

  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`;
  }, [text]);

  // Restore focus when the agent finishes streaming and the textarea re-enables.
  React.useEffect(() => {
    if (!isStreaming) requestAnimationFrame(() => taRef.current?.focus());
  }, [isStreaming]);

  const execCmd = (cmd) => {
    setText("");
    setActiveIdx(0);
    pasteBlocksRef.current.clear();
    pasteCounterRef.current = 0;
    onPick?.(cmd);
  };

  // Expand [paste #N +K lines] tokens back to their real content before sending.
  const expandPastes = (txt) =>
    txt.replace(/\[paste #(\d+) \+\d+ lines?\]/g, (match, id) =>
      pasteBlocksRef.current.get(Number(id)) ?? match);

  const send = () => {
    // If the slash popup is open, Enter executes the highlighted command
    if (showSlash) { execCmd(filtered[clampedIdx]); return; }
    const canSend = text.trim() || (planMode && annotationCount > 0);
    if (!canSend) return;
    onSend(expandPastes(text.trim()));
    setText("");
    pasteBlocksRef.current.clear();
    pasteCounterRef.current = 0;
    requestAnimationFrame(() => taRef.current?.focus());
  };

  // Collapse long pastes into a token so the textarea stays navigable.
  // Threshold: more than 5 lines OR more than 500 characters.
  const onPaste = (e) => {
    const raw = e.clipboardData?.getData("text/plain") ?? "";
    const lines = raw.split("\n");
    if (lines.length <= 5 && raw.length <= 500) return; // short — let browser handle normally
    e.preventDefault();
    const id    = ++pasteCounterRef.current;
    pasteBlocksRef.current.set(id, raw);
    const token = `[paste #${id} +${lines.length} line${lines.length === 1 ? "" : "s"}]`;
    const ta    = taRef.current;
    const start = ta ? ta.selectionStart : text.length;
    const end   = ta ? ta.selectionEnd   : text.length;
    const next  = text.slice(0, start) + token + text.slice(end);
    setText(next);
    // Reposition cursor after the token on next frame (state not flushed yet).
    requestAnimationFrame(() => {
      if (!taRef.current) return;
      const pos = start + token.length;
      taRef.current.selectionStart = taRef.current.selectionEnd = pos;
    });
  };

  const onKey = (e) => {
    if (showSlash) {
      if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")    { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Escape")     { e.preventDefault(); setText(""); return; }
      if (e.key === "Tab")        { e.preventDefault(); setActiveIdx(i => (i + 1) % filtered.length); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === "Escape" && isStreaming) { onAbort(); return; }
    if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onOpenCmd(); }
  };

  return (
    <div className={`composer ${planMode ? "plan-on" : ""}`}>
      {planMode && (
        <div className="plan-strip">
          <Icon name="plan" size={12} color="var(--amber)" />
          <span style={{ color: "var(--amber)" }} title="plan mode — 代理先拟方案，你确认后再动手写代码">计划模式</span>
          <span style={{ color: "var(--fg-3)" }}>· 先拟方案，确认后再动手</span>
          <button className="btn ghost" onClick={onTogglePlan} style={{ marginLeft: "auto", height: 22 }}>退出</button>
        </div>
      )}

      {showSlash && (
        <div className="slash-pop" ref={listRef}>
          {filtered.map((c, i) => (
            <button key={c.name}
              className={`slash-row${i === clampedIdx ? " active" : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); execCmd(c); }}>
              <span className="slash-glyph">{c.icon}</span>
              <span className="mono" style={{ color: "var(--accent)" }}>/{c.name}</span>
              <span style={{ color: "var(--fg-3)" }}>{c.hint}</span>
              <span className="chip muted" style={{ marginLeft: "auto" }}>{c.group}</span>
            </button>
          ))}
        </div>
      )}

      <div className="composer-row">
        <button className="btn icon ghost" title="附带图片" aria-label="附带图片">
          <Icon name="image" size={13} />
        </button>
        <button className="btn icon ghost" title="语音输入" aria-label="语音输入">
          <Icon name="voice" size={13} />
        </button>
        <div className="composer-input">
          <textarea
            ref={taRef}
            rows="1"
            placeholder={
              planMode && !isStreaming
                ? (microcopy?.planTip ?? "描述要构建的内容，或对计划提出反馈…")
                : isStreaming
                  ? microcopy?.streamingTip
                  : (microcopy?.paletteTip ?? "今天做点什么？  ·  / 唤出命令  ·  ⌘K 打开命令面板")
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            className="selectable"
          />
        </div>
        <button className="btn outlined" title="打开命令面板（⌘K / Ctrl+K）" aria-label="打开命令面板" onClick={onOpenCmd}>
          <Icon name="command" size={11} />
          <span className="kbd" style={{ marginLeft: 2 }}>K</span>
        </button>
        {isStreaming ? (
          <>
            {text.trim() && (
              <button className="btn outlined" onClick={send} title="steer — 中途追加指令，改变当前方向"
                style={{ color: "var(--amber)", borderColor: "color-mix(in oklab, var(--amber) 40%, var(--line))" }}>
                <Icon name="arrow" size={10} color="var(--amber)" /> 转向
              </button>
            )}
            <button className="btn danger" onClick={onAbort} title="中止当前回合（⎋）" aria-label="中止">
              <Icon name="stop" size={10} /> 中止 <span className="kbd">⎋</span>
            </button>
          </>
        ) : (
          <>
            {planMode && (
              <button className="btn outlined" onClick={onApprove} title="批准当前计划，开始执行并转入待办看板">
                <Icon name="play" size={10} color="var(--amber)" /> 批准
              </button>
            )}
            <button className="btn primary" onClick={send}
              disabled={!(text.trim() || (planMode && annotationCount > 0))}>
              {planMode
                ? `发送反馈${annotationCount > 0 ? ` · ${annotationCount} 条评论` : ""}`
                : "发送"}
              {" "}<Icon name="arrow" size={11} />
            </button>
          </>
        )}
      </div>

      <div className="composer-foot">
        <button className="composer-pill" onClick={onOpenModel} title="点击切换模型" aria-label="切换模型">
          <span className="dot live" />
          <span style={{ color: "var(--fg-2)" }}>{currentModel?.name}</span>
          <Icon name="chev" size={10} color="var(--fg-4)" />
        </button>
        <button className="composer-pill" onClick={onCycleThinking}
          title="点击循环切换 thinking 思考强度：off | minimal | low | medium | high | xhigh" aria-label="切换思考强度">
          <Icon name="thinking" size={11} color="var(--lilac)" />
          <span style={{ color: "var(--fg-2)" }}>思考 · {thinking}</span>
        </button>
        <button className={`composer-pill ${planMode ? "on" : ""}`} onClick={onTogglePlan}
          title="plan mode 计划模式 — 代理先拟方案，你确认后再动手" aria-label="切换计划模式">
          <Icon name="plan" size={11} color={planMode ? "var(--amber)" : "var(--fg-3)"} />
          <span style={{ color: planMode ? "var(--amber)" : "var(--fg-2)" }}>计划模式</span>
        </button>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ color: "var(--fg-4)", fontSize: "var(--d-text-xs)" }}>
          {isStreaming && text.trim() ? "↵ 转向 · ⎋ 中止" : "↵ 发送 · ⇧↵ 换行 · ⎋ 中止"}
        </span>
      </div>
    </div>
  );
}

// ── ⌘K Command bridge — two views: commands → model picker ────────────
//
//  commands view  — lists all slash-commands; /model drills into picker
//  models view    — filterable model list; Esc returns to commands
//
function CommandBridge({ open, onClose, onPick, onPickModel, currentModelId, onPickLogin, loginProviders, initialView = "commands" }) {
  const [q, setQ]       = React.useState("");
  const [view, setView] = React.useState("commands");
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setView(initialView);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || !open) return;
      if (view === "models") { if (initialView === "models") onClose(); else { setView("commands"); setQ(""); } }
      else if (view === "login") { if (initialView === "login") onClose(); else { setView("commands"); setQ(""); } }
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, view]);

  if (!open) return null;

  const fil    = (s) => s.toLowerCase().includes(q.toLowerCase());
  const models = window.OMP_DATA.models;

  // ── Model picker view ──────────────────────────────────────────────
  if (view === "models") {
    const modelHits = models.filter((m) => !q || fil(m.name) || fil(m.id));
    return (
      <div className="bridge-scrim" onClick={onClose}>
        <div className="bridge slide-in" onClick={(e) => e.stopPropagation()}>
          <div className="bridge-input-row">
            <button className="btn icon ghost" title="返回" aria-label="返回命令列表"
              onClick={() => { setView("commands"); setQ(""); }}
              style={{ marginRight: 4 }}>
              <Icon name="chevR" size={12} color="var(--fg-3)"
                style={{ transform: "rotate(180deg)", display: "block" }} />
            </button>
            <input ref={inputRef} className="bridge-input mono"
              placeholder="筛选模型…" value={q}
              onChange={(e) => setQ(e.target.value)} />
            <span className="kbd">esc</span>
          </div>
          <div className="bridge-body">
            <div className="bridge-group">
              <div className="bridge-group-head mono" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                切换模型
                <span style={{ color: "var(--fg-4)" }} title="运行环境诊断：tauri 连接 / omp 会话 / 已加载模型数">
                  tauri:{window.__TAURI__ ? "✓" : "✗"}
                  · connected:{window.OMP_BRIDGE?.isConnected ? "✓" : "✗"}
                  · models:{window.OMP_DATA.models.length}
                </span>
                <button className="btn ghost" style={{ marginLeft: "auto", height: 18, fontSize: "var(--d-text-xs)", padding: "0 6px" }}
                  onClick={() => window.OMP_BRIDGE?.refreshModels()}>
                  刷新
                </button>
              </div>
              {modelHits.map((m) => (
                <button key={m.id}
                  className={`bridge-row ${m.id === currentModelId ? "active" : ""}`}
                  onClick={() => { onPickModel(m); onClose(); }}>
                  <span className="bridge-glyph">
                    {m.id === currentModelId
                      ? <Icon name="check" size={10} color="var(--accent)" />
                      : <Icon name="bolt"  size={10} color="var(--cyan)" />}
                  </span>
                  <span style={{ color: m.id === currentModelId ? "var(--accent)" : "var(--fg)" }}>{m.name}</span>
                  <span className="mono" style={{ color: "var(--fg-4)" }}>{m.id}</span>
                  <span style={{ color: "var(--fg-3)" }}>· {m.note}</span>
                  <span className="chip muted" style={{ marginLeft: "auto" }}>{m.latency}ms</span>
                </button>
              ))}
              {modelHits.length === 0 && <div className="bridge-empty">未找到匹配的模型</div>}
            </div>
          </div>
          <div className="bridge-foot mono">
            <span className="kbd">↑↓</span> 选择
            <span className="kbd">↵</span> 切换
            <span className="kbd">esc</span> 返回
          </div>
        </div>
      </div>
    );
  }

  // ── Login view ───────────────────────────────────────────────────────────
  if (view === "login") {
    return (
      <div className="bridge-scrim" onClick={onClose}>
        <div className="bridge slide-in" onClick={(e) => e.stopPropagation()}>
          <div className="bridge-input-row">
            <button className="btn icon ghost" title="返回" aria-label="返回命令列表"
              onClick={() => { setView("commands"); setQ(""); }}
              style={{ marginRight: 4 }}>
              <Icon name="chevR" size={12} color="var(--fg-3)"
                style={{ transform: "rotate(180deg)", display: "block" }} />
            </button>
            <span className="bridge-input mono" style={{ cursor: "default", lineHeight: "normal" }}>
              登录
            </span>
            <span className="kbd">esc</span>
          </div>
          <div className="bridge-body">
            <div className="bridge-group">
              <div className="bridge-group-head mono">选择提供商</div>
              {loginProviders === null && (
                <div className="bridge-empty" style={{ padding: "16px 32px" }}>正在加载提供商…</div>
              )}
              {loginProviders !== null && loginProviders.length === 0 && (
                <div className="bridge-empty">没有可用的提供商</div>
              )}
              {loginProviders !== null && loginProviders.map((p) => (
                <button key={p.id}
                  className={`bridge-row ${p.authenticated ? "active" : ""}`}
                  onClick={() => { if (p.available) { onPickLogin(p); onClose(); } }}>
                  <span className="bridge-glyph">
                    {p.authenticated
                      ? <Icon name="check" size={10} color="var(--accent)" />
                      : <Icon name="bolt"  size={10} color={p.available ? "var(--cyan)" : "var(--fg-5)"} />}
                  </span>
                  <span style={{ color: p.authenticated ? "var(--accent)" : p.available ? "var(--fg)" : "var(--fg-4)" }}>
                    {p.name}
                  </span>
                  <span className="mono" style={{ color: "var(--fg-4)" }}>{p.id}</span>
                  <span className="chip muted" style={{ marginLeft: "auto" }}>
                    {p.authenticated ? "已登录" : p.available ? "可用" : "不可用"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="bridge-foot mono">
            <span className="kbd">↵</span> 认证
            <span className="kbd">esc</span> 返回
          </div>
        </div>
      </div>
    );
  }

  // ── Commands view ──────────────────────────────────────────────────
  const cmds    = window.OMP_DATA.commands;
  const cmdHits = cmds.filter((c) => !q || fil(c.name) || fil(c.hint));
  const groups  = {};
  cmdHits.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
  const activeModelName = models.find((m) => m.id === currentModelId)?.name ?? "–";

  return (
    <div className="bridge-scrim" onClick={onClose}>
      <div className="bridge slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="bridge-input-row">
          <Icon name="command" size={14} color="var(--accent)" />
          <input ref={inputRef} className="bridge-input mono"
            placeholder="输入以筛选命令…" value={q}
            onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">esc</span>
        </div>
        <div className="bridge-body">
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="bridge-group">
              <div className="bridge-group-head mono">{g.toLowerCase()}</div>
              {list.map((c) => {
                const isModel = c.name === "model";
                const isLogin = c.name === "login";
                const drillsIn = isModel || isLogin;
                return (
                  <button key={c.name} className="bridge-row"
                    onClick={() => {
                      if (isModel) { setQ(""); setView("models"); }
                      else if (isLogin) { setQ(""); setView("login"); }
                      else { onPick(c); onClose(); }
                    }}>
                    <span className="bridge-glyph">{c.icon}</span>
                    <span className="mono" style={{ color: "var(--accent)" }}>/{c.name}</span>
                    <span style={{ color: "var(--fg-3)" }}>{c.hint}</span>
                    {isModel && (
                      <span className="mono" style={{ color: "var(--fg-4)", marginLeft: "auto" }}>
                        {activeModelName}
                      </span>
                    )}
                    <Icon name={drillsIn ? "chevR" : "arrow"} size={11} color="var(--fg-4)"
                      style={{ marginLeft: drillsIn ? 8 : "auto" }} />
                  </button>
                );
              })}
            </div>
          ))}
          {cmdHits.length === 0 && (
            <div className="bridge-empty">没有匹配 —— 试试 `plan`、`branch`、`model`…</div>
          )}
        </div>
        <div className="bridge-foot mono">
          <span className="kbd">↑↓</span> 选择
          <span className="kbd">↵</span> 运行
          <span className="kbd">esc</span> 关闭
          <span style={{ marginLeft: "auto", color: "var(--fg-4)" }}>{window.OMP_DATA.microcopy.paletteTip}</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Composer, CommandBridge });
