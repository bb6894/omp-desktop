import { useCallback, useEffect, useState } from "react";
import type { SessionViewData } from "../lib/session-lifecycle";
import { loadAppPreferences, saveAppPreferences } from "../lib/app-preferences";
import { parseUnifiedDiff } from "../lib/diff-view";
import {
  useProductBridge,
  type ApprovalRuleLists,
  type WorkbenchState,
  type WorkspaceDiff,
  type WorkspaceFileEntry,
  type WorkspaceStatus
} from "../bridge/product-bridge";
import type { SubAgentInfo } from "../../../protocol/domain";
const STATE_LABEL: Record<SessionViewData["runtimeState"], string> = {
  idle: "空闲",
  running: "运行中",
  "waiting-user": "等待你处理",
  failed: "失败"
};

type Tab = "detail" | "changes";

/**
 * Right context panel (Phase 7): session details tab plus the bounded
 * Changes/Diff view. Diff content is fetched per file through the bounded
 * Host ops — caps, binary detection, and truncation are Host-owned.
 */
export function RightPanel({
  session,
  approvalRules,
  workbench,
  runtimeUpdate,
  onRemoveRule,
  onToggle,
  subAgents
}: {
  session: SessionViewData | null;
  approvalRules: ApprovalRuleLists | null;
  workbench: WorkbenchState | null;
  runtimeUpdate: { version: string; latestVersion: string | null; updateAvailable: boolean } | null;
  onRemoveRule: (ruleId: string) => void;
  onToggle: (command: Record<string, unknown>) => void;
  subAgents: readonly SubAgentInfo[];
}) {
  const bridge = useProductBridge();
  const [tab, setTab] = useState<Tab>("detail");
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<WorkspaceDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<readonly string[]>([]);
  const [applying, setApplying] = useState<Record<string, "accept" | "reject">>({});

  const loadChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await bridge.getWorkspaceChanges());
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    setReviewed(session === null ? [] : loadAppPreferences().reviewedFiles[session.id] ?? []);
  }, [session]);

  const persistReviewed = useCallback(
    (paths: readonly string[]) => {
      setReviewed(paths);
      if (session === null) return;
      const prefs = loadAppPreferences();
      saveAppPreferences({
        ...prefs,
        reviewedFiles: { ...prefs.reviewedFiles, [session.id]: paths }
      });
    },
    [session]
  );

  const toggleReviewed = useCallback(
    (path: string) => {
      persistReviewed(reviewed.includes(path) ? reviewed.filter((item) => item !== path) : [...reviewed, path]);
    },
    [persistReviewed, reviewed]
  );

  const handleApply = useCallback(
    async (path: string, action: "accept" | "reject") => {
      setApplying((prev) => ({ ...prev, [path]: action }));
      try {
        const ok = await bridge.applyWorkspaceChange(path, action);
        if (ok) {
          if (action === "accept") {
            persistReviewed([...reviewed, path]);
          }
        } else {
          setError(action === "accept" ? "接受失败" : "回滚功能开发中");
        }
      } catch {
        setError(action === "accept" ? "接受失败" : "回滚功能开发中");
      } finally {
        setApplying((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
    },
    [bridge, persistReviewed, reviewed]
  );

  const handleAcceptAll = useCallback(async () => {
    if (!status) return;
    for (const file of status.files) {
      await handleApply(file.path, "accept");
    }
  }, [status, handleApply]);

  const handleRejectAll = useCallback(async () => {
    if (!status) return;
    for (const file of status.files) {
      await handleApply(file.path, "reject");
    }
  }, [status, handleApply]);

  const loadDiff = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setDiffPath(path);
      setDiff(null);
      try {
        setDiff(await bridge.getWorkspaceDiff(path));
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [bridge]
  );

  useEffect(() => {
    if (tab === "changes" && status === null && !loading) void loadChanges();
  }, [tab, status, loading, loadChanges]);

  return (
    <aside className="right-panel" aria-label="会话详情与变更">
      <div className="right-panel__tabs">
        <button
          type="button"
          className={tab === "detail" ? "right-panel__tab--active" : ""}
          onClick={() => setTab("detail")}
        >
          详情
        </button>
        <button
          type="button"
          className={tab === "changes" ? "right-panel__tab--active" : ""}
          onClick={() => setTab("changes")}
        >
          变更
        </button>
      </div>
      <div className="right-panel__header">
        <div>
          <p className="right-panel__eyebrow">上下文</p>
          <h2 className="right-panel__title">{tab === "detail" ? "会话详情" : "工作区变更"}</h2>
        </div>
        {session !== null && <span className="right-panel__session-dot" aria-label="已选择会话" />}
      </div>
      {tab === "detail" ? (
        session === null ? (
          <p className="right-panel__placeholder">从左侧选择一个会话查看详情。</p>
        ) : (
          <div className="right-panel__body">
            <p className="right-panel__session-title">{session.title}</p>
            <dl className="right-panel__meta">
              <div>
                <dt>状态</dt>
                <dd>{STATE_LABEL[session.runtimeState]}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{session.writeMode === "history-readonly" ? "只读来源" : "桌面副本"}</dd>
              </div>
            </dl>
            <section className="right-panel__rules" aria-label="审批规则">
              <p className="right-panel__rules-title">审批规则（自动放行）</p>
              {(approvalRules?.session.length ?? 0) === 0 && (approvalRules?.project.length ?? 0) === 0 && (
                <p className="right-panel__placeholder">暂无规则。审批卡片上可选择记住放行。</p>
              )}
              <ul className="right-panel__rule-list">
                {(approvalRules?.session ?? []).map((rule) => (
                  <li key={rule.id} className="right-panel__rule">
                    <span className="right-panel__rule-tool">{rule.tool}</span>
                    <span className="right-panel__rule-scope">本会话</span>
                    <button
                      type="button"
                      className="button button--ghost right-panel__rule-remove"
                      onClick={() => onRemoveRule(rule.id)}
                    >
                      移除
                    </button>
                  </li>
                ))}
                {(approvalRules?.project ?? []).map((rule) => (
                  <li key={rule.id} className="right-panel__rule">
                    <span className="right-panel__rule-tool">{rule.tool}</span>
                    <span className="right-panel__rule-scope">本项目</span>
                    <button
                      type="button"
                      className="button button--ghost right-panel__rule-remove"
                      onClick={() => onRemoveRule(rule.id)}
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="right-panel__rules" aria-label="运行开关">
              <p className="right-panel__rules-title">运行开关</p>
              <ul className="right-panel__rule-list">
                <li className="right-panel__rule">
                  <span className="right-panel__rule-tool">快速模式</span>
                  <span className="right-panel__rule-scope">{workbench?.fastMode ? "开" : "关"}</span>
                  <button
                    type="button"
                    className="button button--ghost right-panel__rule-remove"
                    disabled={workbench?.fastMode === null || workbench === null}
                    onClick={() => onToggle({ type: "set_fast_mode", enabled: !(workbench?.fastMode ?? false) })}
                  >
                    切换
                  </button>
                </li>
                <li className="right-panel__rule">
                  <span className="right-panel__rule-tool">自动压缩</span>
                  <span className="right-panel__rule-scope">{workbench?.autoCompaction ? "开" : "关"}</span>
                  <button
                    type="button"
                    className="button button--ghost right-panel__rule-remove"
                    disabled={workbench?.autoCompaction === null || workbench === null}
                    onClick={() =>
                      onToggle({ type: "set_auto_compaction", enabled: !(workbench?.autoCompaction ?? false) })
                    }
                  >
                    切换
                  </button>
                </li>
                <li className="right-panel__rule">
                  <span className="right-panel__rule-tool">插话模式</span>
                  <span className="right-panel__rule-scope">{workbench?.steeringMode ?? "—"}</span>
                  <button
                    type="button"
                    className="button button--ghost right-panel__rule-remove"
                    disabled={!workbench?.steeringMode}
                    onClick={() =>
                      onToggle({
                        type: "set_steering_mode",
                        mode: workbench?.steeringMode === "all" ? "one-at-a-time" : "all"
                      })
                    }
                  >
                    切换
                  </button>
                </li>
                <li className="right-panel__rule">
                  <span className="right-panel__rule-tool">队列模式</span>
                  <span className="right-panel__rule-scope">{workbench?.followUpMode ?? "—"}</span>
                  <button
                    type="button"
                    className="button button--ghost right-panel__rule-remove"
                    disabled={!workbench?.followUpMode}
                    onClick={() =>
                      onToggle({
                        type: "set_follow_up_mode",
                        mode: workbench?.followUpMode === "all" ? "one-at-a-time" : "all"
                      })
                    }
                  >
                    切换
                  </button>
                </li>
                <li className="right-panel__rule">
                  <span className="right-panel__rule-tool">中断模式</span>
                  <span className="right-panel__rule-scope">{workbench?.interruptMode ?? "—"}</span>
                  <button
                    type="button"
                    className="button button--ghost right-panel__rule-remove"
                    disabled={!workbench?.interruptMode}
                    onClick={() =>
                      onToggle({
                        type: "set_interrupt_mode",
                        mode: workbench?.interruptMode === "immediate" ? "wait" : "immediate"
                      })
                    }
                  >
                    切换
                  </button>
                </li>
              </ul>
            </section>
            {runtimeUpdate && runtimeUpdate.updateAvailable && (
              <section className="right-panel__update" aria-label="运行时更新">
                <p className="right-panel__update-title">⚠️ 检测到新版本的 OMP 运行时</p>
                <p className="right-panel__update-text">
                  当前版本: {runtimeUpdate.version} → 最新版本: {runtimeUpdate.latestVersion}
                </p>
                <p className="right-panel__update-hint">
                  请手动下载新版本替换 artifacts/omp-windows-x64.exe 文件
                </p>
              </section>
            )}
            {runtimeUpdate && !runtimeUpdate.updateAvailable && runtimeUpdate.latestVersion && (
              <section className="right-panel__update right-panel__update--current" aria-label="运行时版本">
                <p className="right-panel__update-title">✓ 运行时已是最新版本</p>
                <p className="right-panel__update-text">
                  版本: {runtimeUpdate.version}
                </p>
              </section>
            )}
            {(session !== null && subAgents.length > 0) && (
              <section className="right-panel__subagents" aria-label="子代理">
                <p className="right-panel__rules-title">子代理</p>
                <ul className="right-panel__subagent-list">
                  {subAgents.map((agent) => (
                    <li key={agent.id} className={`right-panel__subagent right-panel__subagent--${agent.status}`}>
                      <span className="right-panel__subagent-id">{agent.id.slice(0, 8)}…</span>
                      <span className="right-panel__subagent-name">{agent.name || "未命名"}</span>
                      <span className={`right-panel__subagent-status right-panel__subagent-status--${agent.status}`}>
                        {agent.status === "running" ? "运行中" : agent.status === "idle" ? "空闲" : agent.status === "completed" ? "已完成" : "失败"}
                      </span>
                      {agent.prompt && (
                        <p className="right-panel__subagent-prompt">{agent.prompt.slice(0, 120)}{agent.prompt.length > 120 ? "…" : ""}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )
      ) : (
        <div className="workspace-view">
          <button type="button" className="button" disabled={loading} onClick={() => void loadChanges()}>
            刷新变更
          </button>
          {loading && <p className="workspace-loading">加载中…</p>}
          {error !== null && (
            <p className="workspace-error">无法获取：{error}</p>
          )}
          {!loading && status !== null && status.files.length === 0 && (
            <p className="workspace-empty">没有未提交的变更。</p>
          )}
          {status !== null && status.files.length > 0 && (
            <p className="workspace-note">
              已审 {reviewed.filter((path) => status.files.some((file) => file.path === path)).length}
              /{status.files.length}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => persistReviewed(status.files.map((file) => file.path))}
              >
                全部标记已审
              </button>
            </p>
          )}
          {status && status.files.length > 0 && (
            <div className="workspace-batch-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={handleAcceptAll}
              >
                全部接受（{status.files.length}）
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={handleRejectAll}
              >
                全部拒绝（{status.files.length}）
              </button>
            </div>
          )}
          <ul className="workspace-files">
            {(status?.files ?? []).map((file: WorkspaceFileEntry) => (
              <li key={file.path}>
                <div
                  className={
                    "workspace-file" +
                    (file.path === diffPath ? " workspace-file--active" : "") +
                    (reviewed.includes(file.path) ? " workspace-file--reviewed" : "")
                  }
                >
                  <button
                    type="button"
                    className="workspace-file__open"
                    onClick={() => void loadDiff(file.path)}
                  >
                    <span className="workspace-file__code">{file.code}</span>
                    <span className="workspace-file__path">{file.path}</span>
                  </button>
                  <button
                    type="button"
                    className="workspace-file__mark"
                    title={reviewed.includes(file.path) ? "取消已审标记" : "标记为已审"}
                    onClick={() => toggleReviewed(file.path)}
                  >
                    {reviewed.includes(file.path) ? "✓" : "○"}
                  </button>
                  <button
                    type="button"
                    className="workspace-file__action workspace-file__accept"
                    title="接受此变更"
                    onClick={() => void handleApply(file.path, "accept")}
                    disabled={!!applying[file.path]}
                  >
                    {applying[file.path] === "accept" ? "✓" : "✓ 接受"}
                  </button>
                  <button
                    type="button"
                    className="workspace-file__action workspace-file__reject"
                    title="拒绝此变更"
                    onClick={() => void handleApply(file.path, "reject")}
                    disabled={!!applying[file.path]}
                  >
                    {applying[file.path] === "reject" ? "✗" : "✗ 拒绝"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {status?.truncated && <p className="workspace-note">变更列表已截断（上限内仅显示部分文件）。</p>}
          {diff?.kind === "text" && (
            <>
              <div className="workspace-diff" role="table" aria-label="逐行差异">
                {parseUnifiedDiff(diff.diff).map((row, index) => (
                  <div key={index} className={`workspace-diff__row workspace-diff__row--${row.kind}`}>
                    <span className="workspace-diff__sign">
                      {row.kind === "add" ? "+" : row.kind === "del" ? "-" : ""}
                    </span>
                    <span className="workspace-diff__text">{row.text}</span>
                  </div>
                ))}
              </div>
              {diff.truncated && <p className="workspace-note">差异内容已截断。</p>}
            </>
          )}
          {diff?.kind === "binary" && <p className="workspace-note">二进制文件，不展示差异。</p>}
          {diff?.kind === "untracked" && <p className="workspace-note">未跟踪文件：尚无 HEAD 基线可比较。</p>}
        </div>
      )}
    </aside>
  );
}

// Add accept/reject buttons to workspace files

// Workspace accept/reject handlers
export function useWorkspaceActions(
  bridge: import("../bridge/product-bridge").ProductBridge,
  status: import("../bridge/product-bridge").WorkspaceStatus | null,
  _reviewed: readonly string[],
  persistReviewed: (paths: readonly string[]) => void
) {
  const handleAcceptAll = async () => {
    if (!status) return;
    // TODO: Implement actual accept via Host command
    for (const file of status.files) {
      await bridge.applyWorkspaceChange(file.path, "accept");
    }
    persistReviewed(status.files.map((f) => f.path));
  };

  const handleRejectAll = async () => {
    if (!status) return;
    // TODO: Implement actual reject via Host command
    for (const file of status.files) {
      await bridge.applyWorkspaceChange(file.path, "reject");
    }
    persistReviewed([]);
  };

  return { handleAcceptAll, handleRejectAll };
}
