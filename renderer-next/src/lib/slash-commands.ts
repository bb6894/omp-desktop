/**
 * Slash-palette surface for the composer. Two sources merge here:
 *
 *  - "structured": desktop-curated commands that map onto specific allowlisted
 *    Runtime RPC ops (build() returns the command object).
 *  - "runtime": the live registry streamed by the Runtime itself
 *    (`available_commands_update` → timeline `commands.update`) — builtins,
 *    skills, MCP and extension commands. Executed as `prompt("/name rest")`;
 *    the Runtime owns parsing, output (command_output notes), and errors.
 *
 * Anything the Host forbids must not appear here.
 */

export type SlashCommand = {
  /** Palette token, entered as `/<name>`. */
  name: string;
  label: string;
  description: string;
  /** Where the command comes from; rendered as a chip in the palette. */
  source: string;
  argsHint?: string;
  kind: "structured" | "runtime";
  /** structured only: builds the Runtime command; free text is passed in. */
  build?: (rest: string) => Record<string, unknown>;
};

const structured = (
  name: string,
  label: string,
  description: string,
  build: (rest: string) => Record<string, unknown>,
  argsHint?: string
): SlashCommand => ({ name, label, description, source: "desktop", kind: "structured", build, argsHint });

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  structured("new", "新建会话", "在当前项目开一个全新会话", () => ({ type: "new_session" })),
  structured(
    "compact",
    "压缩上下文",
    "压缩当前上下文，可附自定义指令",
    (rest) => (rest.length > 0 ? { type: "compact", customInstructions: rest } : { type: "compact" }),
    "[说明]"
  ),
  structured("export", "导出 HTML", "把会话导出为 HTML 文件", () => ({ type: "export_html" })),
  structured("stats", "会话统计", "查看 Token 用量等统计信息", () => ({ type: "get_session_stats" })),
  structured(
    "branch",
    "从消息分叉",
    "从指定消息条目分叉出新的时间线（条目 id 见时间线）",
    (rest) => ({ type: "branch", entryId: rest }),
    "<entryId>"
  ),
  structured(
    "name",
    "会话命名",
    "重命名当前会话",
    (rest) => ({ type: "set_session_name", name: rest }),
    "<名称>"
  ),
  structured(
    "handoff",
    "会话交接",
    "生成交接摘要并开启新会话，可附自定义指令",
    (rest) => (rest.length > 0 ? { type: "handoff", customInstructions: rest } : { type: "handoff" }),
    "[说明]"
  ),
  structured("copy", "复制上次回复", "把最后一条助手回复复制到剪贴板", () => ({
    type: "get_last_assistant_text"
  })),
  structured("subagents", "子代理列表", "查看本会话的子代理运行情况", () => ({ type: "get_subagents" }))
];

export type ParsedSlashInput = { name: string; rest: string };

/** Returns the parsed `/name rest…` head of the input, or null when not a slash input. */
export function parseSlashInput(text: string): ParsedSlashInput | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") || trimmed.length < 2) return null;
  const body = trimmed.slice(1);
  const spaceIndex = body.indexOf(" ");
  const name = spaceIndex === -1 ? body : body.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? "" : body.slice(spaceIndex + 1).trim();
  return { name: name.toLowerCase(), rest };
}

function matches(command: SlashCommand, query: string): boolean {
  if (command.name.startsWith(query)) return true;
  return command.kind === "runtime" && query.length >= 2 && command.label.toLowerCase().includes(query);
}

/**
 * Prefix filter over the merged palette; empty query returns everything.
 * Static structured commands shadow same-name runtime entries (e.g. /new).
 */
export function matchSlashCommands(query: string, runtime: readonly SlashCommand[] = []): SlashCommand[] {
  const q = query.toLowerCase();
  const staticMatches = SLASH_COMMANDS.filter((command) => q.length === 0 || matches(command, q));
  const staticNames = new Set(staticMatches.map((command) => command.name));
  const runtimeMatches = runtime.filter(
    (command) => !staticNames.has(command.name) && (q.length === 0 || matches(command, q))
  );
  return [...staticMatches, ...runtimeMatches];
}

/** Adapts a protocol registry entry into a palette item (executed as prompt). */
export function runtimeCommandToPalette(info: {
  name: string;
  description: string | null;
  inputHint: string | null;
  source: string;
}): SlashCommand {
  return {
    name: info.name,
    label: info.name,
    description: info.description ?? "运行时命令",
    source: info.source,
    argsHint: info.inputHint ?? undefined,
    kind: "runtime"
  };
}

/** `!cmd` bang input → direct Runtime shell execution. */
export function parseBangInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("!") || trimmed.length < 2) return null;
  return trimmed.slice(1).trim();
}
