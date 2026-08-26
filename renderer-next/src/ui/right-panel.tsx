import { useCallback, useEffect, useState } from "react";
import type { SessionViewData } from "../lib/session-lifecycle";
import { loadAppPreferences, saveAppPreferences } from "../lib/app-preferences";
import { parseUnifiedDiff } from "../lib/diff-view";
import {
  useProductBridge,
  type ApprovalRuleLists,
  type WorkspaceDiff,
  type WorkspaceFileEntry,
  type WorkspaceStatus
} from "../bridge/product-bridge";

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
  onRemoveRule
}: {
  session: SessionViewData | null;
  approvalRules: ApprovalRuleLists | null;
  onRemoveRule: (ruleId: string) => void;
}) {
  const bridge = useProductBridge();
  const [tab, setTab] = useState<Tab>("detail");
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<WorkspaceDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<readonly string[]>([]);

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
