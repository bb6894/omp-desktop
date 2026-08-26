import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeFileAtomic } from "./harness-atomic-file";
import type { RpcFrame } from "./rpc-bridge";

/**
 * Desktop-side approval rules (codex amend semantics, bounded).
 *
 * A rule exists ONLY because a human clicked an explicit grant button on an
 * interaction card; nothing here ever widens a grant or invents one. Project-
 * scoped rules persist next to the per-project session metadata; session-
 * scoped grants live in memory and die with the Host process.
 *
 * Matching is deliberately narrow: the Runtime's tool-approval prompt is a
 * `select` whose options are exactly ["Approve", "Deny"] and whose title's
 * first line is `Allow tool: <name>` (pinned 17.4.1 formatApprovalPrompt).
 * Anything else never matches a rule.
 */

export const APPROVAL_RULE_FILE_VERSION = 1;

export type ApprovalScope = "session" | "project";

export type ApprovalRuleView = {
  id: string;
  tool: string;
  createdAt: string;
};

/** Strict shape stored under `desktop-sessions`; unknown fields drop on parse. */
type StoredApprovalRule = {
  tool: string;
  createdAt: string;
  sourceInteractionId: string | null;
};

type ApprovalRuleFile = {
  version: number;
  rules: StoredApprovalRule[];
};

const TOOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const ALLOW_TITLE_PATTERN = /^Allow tool: ([^\s\n]+)/;

export function isValidApprovalTool(value: unknown): value is string {
  return typeof value === "string" && TOOL_PATTERN.test(value);
}

/**
 * Returns the tool name iff `frame` is a Runtime tool-approval prompt that a
 * stored rule may answer; null for every other interaction shape.
 */
export function extractApprovalTool(frame: RpcFrame): string | null {
  if (frame.type !== "extension_ui_request") return null;
  if (frame.method !== "select") return null;
  if (typeof frame.id !== "string" || frame.id.length === 0) return null;
  const options = frame.options;
  if (!Array.isArray(options) || options.length !== 2 || options[0] !== "Approve" || options[1] !== "Deny") {
    return null;
  }
  const title = typeof frame.title === "string" ? frame.title : "";
  const match = ALLOW_TITLE_PATTERN.exec(title);
  if (!match) return null;
  return TOOL_PATTERN.test(match[1]) ? match[1] : null;
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Strict on types; tolerant on absent optional fields. Corrupt entries drop. */
function parseStoredRule(input: unknown): StoredApprovalRule | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (!isValidApprovalTool(record.tool)) return null;
  if (!isValidIsoTimestamp(record.createdAt)) return null;
  if (record.sourceInteractionId !== null && typeof record.sourceInteractionId !== "string") return null;
  return {
    tool: record.tool,
    createdAt: record.createdAt,
    sourceInteractionId: typeof record.sourceInteractionId === "string" ? record.sourceInteractionId : null
  };
}

function safelyParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export type GrantOutcome = {
  created: boolean;
  rule: ApprovalRuleView | null;
};

const storedView = (id: string, stored: StoredApprovalRule): ApprovalRuleView => ({
  id,
  tool: stored.tool,
  createdAt: stored.createdAt
});

/**
 * One book per Desktop Host process (= one project window). Loads the project
 * file lazily; until the load resolves `has()` answers false so unknown-state
 * fails closed toward the human prompt instead of silent auto-approval.
 */
export class ApprovalRuleBook {
  /** Dynamic membership keyed by tool name; not a static lookup table. */
  private readonly projectRules = new Map<string, StoredApprovalRule>();
  private readonly sessionRules = new Map<string, Map<string, StoredApprovalRule>>();
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly filePath: string) {}

  /** Resolves once the persisted project rules are visible to matching. */
  ready(): Promise<void> {
    this.loadPromise ??= this.load();
    return this.loadPromise;
  }

  /** True when a granted rule covers this tool for the routed session. */
  has(tool: string, routeSessionId: string): boolean {
    return this.sessionRules.get(routeSessionId)?.has(tool) === true || this.projectRules.has(tool);
  }

  async grant(
    routeSessionId: string,
    input: { tool: string; scope: ApprovalScope; sourceInteractionId: string | null }
  ): Promise<GrantOutcome> {
    const createdAt = new Date().toISOString();
    const stored: StoredApprovalRule = {
      tool: input.tool,
      createdAt,
      sourceInteractionId: input.sourceInteractionId
    };
    if (input.scope === "session") {
      const grants = this.sessionRules.get(routeSessionId);
      const existing = grants?.get(input.tool);
      if (grants && existing) return { created: false, rule: storedView(`session:${input.tool}`, existing) };
      if (!grants) this.sessionRules.set(routeSessionId, new Map([[input.tool, stored]]));
      else grants.set(input.tool, stored);
      return { created: true, rule: storedView(`session:${input.tool}`, stored) };
    }
    await this.ready();
    const existing = this.projectRules.get(input.tool);
    if (existing) return { created: false, rule: storedView(`project:${input.tool}`, existing) };
    this.projectRules.set(input.tool, stored);
    await this.persist();
    return { created: true, rule: storedView(`project:${input.tool}`, stored) };
  }

  /** Removes by unique id (`session:<tool>` | `project:<tool>`); idempotent. */
  async revoke(id: string): Promise<boolean> {
    const separator = id.indexOf(":");
    if (separator <= 0) return false;
    const scope = id.slice(0, separator);
    const tool = id.slice(separator + 1);
    if (scope === "session") {
      let removed = false;
      for (const grants of this.sessionRules.values()) {
        if (grants.delete(tool)) removed = true;
      }
      return removed;
    }
    if (scope !== "project") return false;
    await this.ready();
    if (!this.projectRules.delete(tool)) return false;
    await this.persist();
    return true;
  }

  async list(routeSessionId: string): Promise<{
    session: readonly ApprovalRuleView[];
    project: readonly ApprovalRuleView[];
  }> {
    await this.ready();
    const grants = this.sessionRules.get(routeSessionId);
    const session = [...(grants?.entries() ?? [])].map(([tool, stored]) => storedView(`session:${tool}`, stored));
    const project = [...this.projectRules.entries()].map(([tool, stored]) => storedView(`project:${tool}`, stored));
    return { session, project };
  }

  /** Test seam: drops all in-memory session grants for the routed session. */
  clearSessionGrants(routeSessionId: string): void {
    this.sessionRules.delete(routeSessionId);
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = safelyParseJson(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        (parsed as Record<string, unknown>).version !== APPROVAL_RULE_FILE_VERSION ||
        !Array.isArray((parsed as Record<string, unknown>).rules)
      ) {
        return;
      }
      for (const entry of (parsed as Record<string, unknown>).rules as unknown[]) {
        const stored = parseStoredRule(entry);
        if (stored && !this.projectRules.has(stored.tool)) this.projectRules.set(stored.tool, stored);
      }
    } catch {
      // Missing file on first use is normal; unreadable/corrupt stays empty
      // (fail closed toward prompting) without blocking the Host.
    }
  }

  private async persist(): Promise<void> {
    const payload: ApprovalRuleFile = {
      version: APPROVAL_RULE_FILE_VERSION,
      rules: [...this.projectRules.values()]
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFileAtomic(this.filePath, new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`));
  }
}
