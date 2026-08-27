import type { HarnessEvidence } from "./harness-contracts";
import type {
  MemoryProposalInput,
  ProposalPolicyCode,
  ProposalPolicyDecision
} from "./proposal-contracts";

const MAX_TEXT_BYTES = 16 * 1024;
const MAX_EVIDENCE = 64;
const RUNTIME_VERSION = "17.4.1";
const HOST_PROTOCOL = 1;

const SECRET_PATTERNS = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
  /\bbearer\s+[a-z0-9._~+/=-]{8,}/i,
  /\b(?:api[_-]?keys?|access[_-]?tokens?|auth[_-]?tokens?|passwords?|passwd|secrets?)\b\s*[:=]\s*["']?[^\s"',;]{6,}/i,
  /\b(?:sk-(?:proj-)?[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{16,}|xox[baprs]-[a-z0-9-]{16,})\b/i,
  // Chinese assignment form: the keyword must sit directly before the separator,
  // so prose like "密码策略：" (password policy:) does not match.
  /(?:访问令牌|密钥|令牌|密码|口令|凭据|凭证)\s*[：:=＝]\s*["']?[^\s"',;、。]{6,}/
] as const;

// Dot-file tokens carry no leading \b: a word boundary before a literal "." only
// matches after a word character, so prose like "the .env file" would slip through.
const PROTECTED_PATH_PATTERNS = [
  /\.env(?:\.[a-z0-9_-]+)?\b|\.git\b|\b(?:src-tauri|apps[\\/]desktop-host)\b/i,
  /\b(?:AGENTS\.md|CLAUDE\.md|package-lock\.json|bun\.lock(?:b)?|Cargo\.lock)\b/i
] as const;

// Injection gaps use [\s\S] so a newline cannot split a phrase apart. The Chinese
// patterns cannot use \b: CJK characters are not \w, so word boundaries never hold;
// verb+object pairing plus tight gaps carry the false-positive control instead.
const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|override)\b[\s\S]{0,48}\b(?:previous|prior|system|developer|safety|security)\b[\s\S]{0,32}\b(?:instructions?|rules?|polic(?:y|ies))\b/i,
  /\b(?:reveal|print|dump|exfiltrate|send)\b[\s\S]{0,48}\b(?:secrets?|tokens?|passwords?|credentials?|api[-_ ]?keys?)\b/i,
  /\b(?:disable|skip|bypass)\b[\s\S]{0,48}\b(?:tests?|security|approvals?|polic(?:y|ies)|permissions?|verifications?)\b/i,
  /\b(?:run|execute)\b[\s\S]{0,48}\b(?:as administrator|elevat(?:e|ed)|powershell\s+-enc)\b/i,
  /(?:忽略|无视|覆盖)[\s\S]{0,24}(?:之前|以上|系统|安全|开发)[\s\S]{0,16}(?:指令|指示|规则|策略)/,
  /(?:跳过|禁用|绕过)[\s\S]{0,24}(?:测试|校验|审批|权限|安全|验证|检查)/,
  /(?:泄露|导出|发送|外传)[\s\S]{0,24}(?:密钥|令牌|口令|凭据|凭证)/,
  /(?:以|用)[\s\S]{0,8}(?:管理员|root|最高权限)(?:身份)?[\s\S]{0,16}(?:执行|运行|安装)/i
] as const;

export function evaluateMemoryProposalPolicy(input: MemoryProposalInput): ProposalPolicyDecision {
  const codes: ProposalPolicyCode[] = [];
  if (!/^[0-9a-f]{32}$/.test(input.projectId)) codes.push("PROPOSAL_PROJECT_ID_INVALID");
  if (input.compatibility.runtimeVersion !== RUNTIME_VERSION || input.compatibility.hostProtocol !== HOST_PROTOCOL) {
    codes.push("PROPOSAL_COMPATIBILITY_UNSUPPORTED");
  }
  if (input.title.trim().length === 0) codes.push("PROPOSAL_TITLE_EMPTY");
  if (input.content.trim().length === 0) codes.push("PROPOSAL_CONTENT_EMPTY");
  if (byteLength(input.title) > MAX_TEXT_BYTES || byteLength(input.content) > MAX_TEXT_BYTES) {
    codes.push("PROPOSAL_TEXT_LIMIT_EXCEEDED");
  }
  if (input.evidence.length === 0) codes.push("PROPOSAL_EVIDENCE_REQUIRED");
  if (input.evidence.length > MAX_EVIDENCE) codes.push("PROPOSAL_EVIDENCE_LIMIT_EXCEEDED");
  if (!input.evidence.every(isEvidence)) codes.push("PROPOSAL_EVIDENCE_INVALID");
  if (input.operation === "memory.add" && input.target !== null) {
    codes.push("PROPOSAL_ADD_TARGET_FORBIDDEN");
  }
  if (input.operation === "memory.replace") {
    if (input.target === null) {
      codes.push("PROPOSAL_REPLACE_TARGET_REQUIRED");
    } else {
      if (input.target.status !== "active" || input.target.id.length === 0) {
        codes.push("PROPOSAL_REPLACE_TARGET_INVALID");
      }
      if (input.target.compatibility.runtimeVersion !== input.compatibility.runtimeVersion
        || input.target.compatibility.hostProtocol !== input.compatibility.hostProtocol) {
        codes.push("PROPOSAL_REPLACE_TARGET_INCOMPATIBLE");
      }
    }
  }

  const text = [
    input.title,
    input.content,
    ...input.evidence.flatMap((item) => isEvidence(item) ? [item.reference, item.summary] : [])
  ];
  if (text.some((value) => SECRET_PATTERNS.some((pattern) => pattern.test(value)))) {
    codes.push("PROPOSAL_SECRET_DETECTED");
  }
  if (text.some((value) => PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(value)))) {
    codes.push("PROPOSAL_PROTECTED_PATH_REFERENCED");
  }
  if (text.some((value) => PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value)))) {
    codes.push("PROPOSAL_PROMPT_INJECTION_DETECTED");
  }
  return codes.length === 0 ? { accepted: true, codes: [] } : { accepted: false, codes };
}
export class ProposalPolicyError extends Error {
  readonly codes: readonly ProposalPolicyCode[];

  constructor(codes: readonly ProposalPolicyCode[]) {
    super("PROPOSAL_POLICY_REJECTED:" + codes.join(","));
    this.name = "ProposalPolicyError";
    this.codes = [...codes];
  }
}

export function assertMemoryProposalAllowed(input: MemoryProposalInput): void {
  const decision = evaluateMemoryProposalPolicy(input);
  if (!decision.accepted) throw new ProposalPolicyError(decision.codes);
}

function isEvidence(value: unknown): value is HarnessEvidence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return keys.length === 3
    && keys.every((key) => ["kind", "reference", "summary"].includes(key))
    && ["command", "test", "file", "user-feedback"].includes(String(candidate.kind))
    && typeof candidate.reference === "string"
    && candidate.reference.length > 0
    && typeof candidate.summary === "string"
    && candidate.summary.length > 0;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
