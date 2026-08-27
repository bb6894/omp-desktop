/* ═════════════════════════════════════════════════════════════════════
   harness/proposal-review.jsx — Stage 3C human-governed proposal review.

   Collects only operation/title/content/targetId; every other field of
   the preview (project binding, scope, compatibility, timestamp,
   evidence, digest) is derived Host-side. Proposal content renders as
   plain React text nodes — no innerHTML, no Markdown pipeline, no raw
   HTML injection path. Diagnostics show stable codes only and never
   echo submitted content.
   ═════════════════════════════════════════════════════════════════════ */

const HARNESS_REVIEW_OPERATIONS = [
  { value: "memory.add", label: "新增记忆" },
  { value: "memory.replace", label: "替换记忆" },
];

const HARNESS_REVIEW_STATUS_COPY = {
  active: "进行中",
  approved: "已批准",
  proposed: "待审核",
  reverted: "已回退",
};

const HARNESS_PREVIEW_ERROR_COPY = {
  HARNESS_MUTATION_INVALID_REQUEST: "请求字段不完整或不合法，请检查输入。",
  HARNESS_TARGET_NOT_FOUND: "目标记忆不存在，请重新选择。",
  HARNESS_TARGET_INACTIVE: "目标记忆当前不是激活状态，不能作为替换目标。",
  HARNESS_STATE_INACCESSIBLE: "无法读取当前 Harness 状态，请稍后重试。",
  PREVIEW_POLICY_REJECTED: "内容未通过安全策略预检，请修改后重试。",
};

const HARNESS_APPLY_ERROR_COPY = {
  APPLY_APPROVAL_REQUIRED: "需要非空的批准人与批准理由才能应用。",
  APPLY_GLOBAL_SCOPE_UNSUPPORTED: "当前阶段仅支持项目级记忆提案。",
  APPLY_PREVIEW_DIGEST_MISMATCH: "预览与摘要不一致，请重新生成预览。",
  APPLY_PREVIEW_FORGED: "预览数据校验失败（伪造或被篡改），已拒绝写入。",
  APPLY_POLICY_REJECTED: "内容未通过安全策略审查。",
  APPLY_REPLAY_COLLISION: "存在同 ID 但内容冲突的历史提议，已拒绝。",
  APPLY_STATE_INCOMPATIBLE: "Harness 状态与固定运行时版本不兼容。",
  APPLY_TARGET_MISSING: "目标记忆不存在，请重新选择并预览。",
  APPLY_STALE_TARGET: "目标记忆在预览后发生了变化，请重新预览。",
  APPLY_WRITE_FAILED: "写入失败，状态已恢复为写入前内容。",
  APPLY_PREVIEW_UNISSUED: "该预览不是由当前 Host 签发的（可能已过期或被改动），请重新生成预览后再应用。",
};

const HARNESS_ROLLBACK_ERROR_COPY = {
  ROLLBACK_NO_SNAPSHOT: "没有可用的快照，无法回滚。",
  ROLLBACK_SNAPSHOT_CORRUPT: "最新快照已损坏并被隔离，当前状态未被修改。",
  ROLLBACK_FAILED: "回滚写入失败，请重试。",
};

/** Minimal renderer payload for harness.preview; null when the draft is invalid. */
function buildPreviewPayload(draft) {
  const title = typeof draft?.title === "string" ? draft.title : "";
  const content = typeof draft?.content === "string" ? draft.content : "";
  if (title.trim().length === 0 || content.trim().length === 0) return null;
  if (draft?.operation === "memory.add") return { operation: "memory.add", title, content };
  if (draft?.operation === "memory.replace") {
    const targetId = typeof draft.targetId === "string" ? draft.targetId : "";
    if (targetId.trim().length === 0) return null;
    return { operation: "memory.replace", title, content, targetId };
  }
  return null;
}

/** Apply stays disabled until a preview exists and both approval fields are non-blank. */
function isApplyReady(previewOutcome, approval) {
  if (!previewOutcome || previewOutcome.status !== "previewed") return false;
  return typeof approval?.approvedBy === "string" && approval.approvedBy.trim().length > 0
    && typeof approval?.reason === "string" && approval.reason.trim().length > 0;
}

function buildApproval(approvedBy, approvalReason) {
  return { approvedBy: approvedBy.trim(), reason: approvalReason.trim() };
}

function outcomeErrorCopy(code, copyTable) {
  return copyTable[code] ?? "操作被拒绝，请查看错误代码。";
}

window.HARNESS_REVIEW_RULES = {
  buildPreviewPayload,
  buildApproval,
  isApplyReady,
  previewErrorCopy: (code) => outcomeErrorCopy(code, HARNESS_PREVIEW_ERROR_COPY),
  applyErrorCopy: (code) => outcomeErrorCopy(code, HARNESS_APPLY_ERROR_COPY),
  rollbackErrorCopy: (code) => outcomeErrorCopy(code, HARNESS_ROLLBACK_ERROR_COPY),
};

function ReviewEvidenceList({ evidence }) {
  if (!Array.isArray(evidence) || evidence.length === 0) return <div className="harness-review-muted">无证据记录</div>;
  return (
    <ul className="harness-review-evidence">
      {evidence.map((item, index) => (
        <li key={index}>
          <span className="chip muted">{item.kind}</span>
          <span className="mono selectable">{item.reference}</span>
          <span className="selectable">{item.summary}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewEntryCard({ heading, entry }) {
  if (!entry) return null;
  return (
    <article className="harness-entry">
      <div className="harness-entry-head">
        <strong className="selectable">{heading}</strong>
        <span className="chip muted">{HARNESS_REVIEW_STATUS_COPY[entry.status] ?? entry.status}</span>
      </div>
      <div className="harness-entry-meta mono selectable">
        {entry.id}{entry.updatedAt ? ` · ${entry.updatedAt}` : ""}
      </div>
      <div className="harness-entry-content selectable">{entry.content}</div>
      <ReviewEvidenceList evidence={entry.evidence} />
    </article>
  );
}

function ProposalReviewPanel({ memories, review }) {
  const [operation, setOperation] = React.useState("memory.add");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [previewOutcome, setPreviewOutcome] = React.useState(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [approvedBy, setApprovedBy] = React.useState("");
  const [approvalReason, setApprovalReason] = React.useState("");
  const [confirmingApply, setConfirmingApply] = React.useState(false);
  const [applyResult, setApplyResult] = React.useState(null);
  const [applyBusy, setApplyBusy] = React.useState(false);
  const [rollbackReason, setRollbackReason] = React.useState("");
  const [rollbackResult, setRollbackResult] = React.useState(null);
  const [rollbackBusy, setRollbackBusy] = React.useState(false);

  const rules = window.HARNESS_REVIEW_RULES;
  const activeMemories = (memories ?? []).filter(entry => entry.status === "active");
  const preview = previewOutcome?.status === "previewed" ? previewOutcome.preview : null;
  const applyReady = isApplyReady(previewOutcome, { approvedBy, reason: approvalReason });

  const resetProposal = () => {
    setTitle(""); setContent(""); setTargetId("");
    setPreviewOutcome(null); setConfirmingApply(false);
    setApprovedBy(""); setApprovalReason("");
  };

  const handleGeneratePreview = async () => {
    const payload = buildPreviewPayload({ operation, title, content, targetId });
    if (!payload || previewBusy) return;
    setPreviewBusy(true);
    setPreviewOutcome(null);
    setConfirmingApply(false);
    setApplyResult(null);
    const outcome = await review.onPreview(payload);
    setPreviewBusy(false);
    if (outcome.stale) return;
    if (outcome.error !== undefined) {
      setPreviewOutcome({ status: "transport-error", code: outcome.error });
      return;
    }
    setPreviewOutcome(outcome.value);
  };

  const handleApply = async () => {
    if (!applyReady || !preview || applyBusy) return;
    setApplyBusy(true);
    const outcome = await review.onApply(preview, buildApproval(approvedBy, approvalReason));
    setApplyBusy(false);
    setConfirmingApply(false);
    if (outcome.stale) return;
    if (outcome.error !== undefined) {
      setApplyResult({ kind: "transport-error", code: outcome.error });
      return;
    }
    const value = outcome.value;
    setApplyResult({ kind: value.status, code: value.status === "rejected" ? value.code : null });
    if (value.status === "applied" || value.status === "already-applied") {
      resetProposal();
      review.onRefresh?.();
    }
  };

  const handleRollback = async () => {
    const reason = rollbackReason.trim();
    if (!reason || rollbackBusy) return;
    setRollbackBusy(true);
    const outcome = await review.onRollback(reason);
    setRollbackBusy(false);
    if (outcome.stale) return;
    if (outcome.error !== undefined) {
      setRollbackResult({ kind: "transport-error", code: outcome.error });
      return;
    }
    const value = outcome.value;
    setRollbackResult({ kind: value.status, code: value.status === "rejected" ? value.code : null });
    if (value.status === "rolled-back") {
      setRollbackReason("");
      review.onRefresh?.();
    }
  };

  const previewRejected = previewOutcome && previewOutcome.status !== "previewed";

  return (
    <div className="harness-review">
      <p className="harness-review-note">
        提案只作用于本项目 Harness 存储；批准前不会写入任何文件。项目绑定、范围、兼容性与时间戳均由 Host 派生，此处不可编辑。
      </p>

      <section className="harness-section">
        <div className="harness-section-title"><span>撰写提案</span></div>
        <div className="harness-review-form">
          <label className="harness-review-field">
            <span>操作类型</span>
            <select value={operation} onChange={event => {
              setOperation(event.target.value);
              setPreviewOutcome(null);
              setConfirmingApply(false);
            }}>
              {HARNESS_REVIEW_OPERATIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {operation === "memory.replace" && (
            <label className="harness-review-field">
              <span>替换目标（仅列出激活记忆）</span>
              <select value={targetId} onChange={event => {
                setTargetId(event.target.value);
                setPreviewOutcome(null);
                setConfirmingApply(false);
              }}>
                <option value="">请选择目标记忆</option>
                {activeMemories.map(entry => (
                  <option key={entry.id} value={entry.id}>{entry.title}（{entry.id}）</option>
                ))}
              </select>
            </label>
          )}
          <label className="harness-review-field">
            <span>标题</span>
            <input type="text" value={title} maxLength={512}
              onChange={event => setTitle(event.target.value)}
              placeholder="一句话描述这条记忆" />
          </label>
          <label className="harness-review-field">
            <span>内容</span>
            <textarea value={content} rows={4}
              onChange={event => setContent(event.target.value)}
              placeholder="希望长期记住的规则或事实" />
          </label>
          <div className="harness-actions">
            <button className="btn outlined" type="button"
              onClick={() => void handleGeneratePreview()}
              disabled={previewBusy || !buildPreviewPayload({ operation, title, content, targetId })}>
              生成预览
            </button>
          </div>
        </div>
      </section>

      {previewBusy && <div className="harness-state-card">正在由 Host 构建预览…</div>}

      {!previewBusy && previewRejected && (
        <div className="harness-state-card harness-error" role="alert">
          <strong>{rules.previewErrorCopy(previewOutcome.code)}</strong>
          <span className="mono selectable">{previewOutcome.code}</span>
          {Array.isArray(previewOutcome.detail) && (
            <span className="mono selectable">{previewOutcome.detail.join(", ")}</span>
          )}
        </div>
      )}

      {!previewBusy && preview && (
        <>
          <section className="harness-section">
            <div className="harness-section-title"><span>预览（Host 构建）</span></div>
            <div className="harness-review-preview-grid">
              <div>
                <div className="harness-review-pane-label">应用后</div>
                <ReviewEntryCard heading={preview.after.title} entry={preview.after} />
              </div>
              <div>
                <div className="harness-review-pane-label">替换前</div>
                {preview.before
                  ? <ReviewEntryCard heading={preview.before.title} entry={preview.before} />
                  : <div className="harness-review-muted">新增操作：无原条目。</div>}
              </div>
            </div>
            <div className="harness-review-digest mono selectable" title={preview.digest.sha256}>
              摘要 sha256: {preview.digest.sha256.slice(0, 16)}…
            </div>
          </section>

          <section className="harness-section">
            <div className="harness-section-title"><span>人工批准</span></div>
            <div className="harness-review-form">
              <label className="harness-review-field">
                <span>批准人</span>
                <input type="text" value={approvedBy} maxLength={128}
                  onChange={event => { setApprovedBy(event.target.value); setConfirmingApply(false); }}
                  placeholder="你的名字或工号" />
              </label>
              <label className="harness-review-field">
                <span>批准理由</span>
                <textarea value={approvalReason} rows={2}
                  onChange={event => { setApprovalReason(event.target.value); setConfirmingApply(false); }}
                  placeholder="为什么批准这条提案" />
              </label>
              {!confirmingApply && (
                <div className="harness-actions">
                  <button className="btn primary" type="button"
                    onClick={() => setConfirmingApply(true)}
                    disabled={!applyReady || applyBusy}>
                    申请应用
                  </button>
                </div>
              )}
              {confirmingApply && (
                <div className="harness-review-confirm" role="alertdialog" aria-label="确认应用提案">
                  <span>确认以「{approvedBy.trim()}」的名义应用这条提案？此操作会写入快照并生效。</span>
                  <div className="harness-actions">
                    <button className="btn primary" type="button" onClick={() => void handleApply()} disabled={applyBusy}>确认应用</button>
                    <button className="btn ghost" type="button" onClick={() => setConfirmingApply(false)}>取消</button>
                  </div>
                </div>
              )}
            </div>
            {applyResult && (
              <div className={`harness-state-card${applyResult.kind === "applied" || applyResult.kind === "already-applied" ? "" : " harness-error"}`} role="status">
                {applyResult.kind === "applied" && <strong>提案已应用，Inspector 已刷新。</strong>}
                {applyResult.kind === "already-applied" && <strong>该提案此前已应用过（幂等重放），未产生新的写入。</strong>}
                {(applyResult.kind === "rejected" || applyResult.kind === "transport-error") && (
                  <>
                    <strong>{rules.applyErrorCopy(applyResult.code)}</strong>
                    <span className="mono selectable">{applyResult.code}</span>
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <section className="harness-section">
        <div className="harness-section-title"><span>回滚最近一次变更</span></div>
        <div className="harness-review-form">
          <label className="harness-review-field">
            <span>回滚理由</span>
            <input type="text" value={rollbackReason}
              onChange={event => setRollbackReason(event.target.value)}
              placeholder="为什么要回滚" />
          </label>
          <div className="harness-actions">
            <button className="btn outlined" type="button"
              onClick={() => void handleRollback()}
              disabled={rollbackBusy || rollbackReason.trim().length === 0}>
              回滚到上一快照
            </button>
          </div>
        </div>
        {rollbackResult && (
          <div className={`harness-state-card${rollbackResult.kind === "rolled-back" ? "" : " harness-error"}`} role="status">
            {rollbackResult.kind === "rolled-back" && <strong>已回滚到上一快照，Inspector 已刷新。</strong>}
            {(rollbackResult.kind === "rejected" || rollbackResult.kind === "transport-error") && (
              <>
                <strong>{rules.rollbackErrorCopy(rollbackResult.code)}</strong>
                <span className="mono selectable">{rollbackResult.code}</span>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

window.ProposalReviewPanel = ProposalReviewPanel;
