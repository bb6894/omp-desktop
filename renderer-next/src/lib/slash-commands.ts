/**
 * Slash-palette surface for the composer. Commands map 1:1 onto the Host's
 * allowlisted Runtime command surface (session-service ALLOWED_AGENT_COMMANDS);
 * anything the Host forbids must not appear here.
 */

export type SlashCommand = {
  /** Palette token, entered as `/<name>`. */
  name: string;
  label: string;
  description: string;
  /** Builds the Runtime command; free text after the token is passed in. */
  build: (rest: string) => Record<string, unknown>;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: "new",
    label: "新建会话",
    description: "在当前项目开一个全新会话",
    build: () => ({ type: "new_session" })
  },
  {
    name: "compact",
    label: "压缩上下文",
    description: "压缩当前上下文，可附自定义指令",
    build: (rest) =>
      rest.length > 0 ? { type: "compact", customInstructions: rest } : { type: "compact" }
  },
  {
    name: "export",
    label: "导出 HTML",
    description: "把会话导出为 HTML 文件",
    build: () => ({ type: "export_html" })
  },
  {
    name: "stats",
    label: "会话统计",
    description: "查看 Token 用量等统计信息",
    build: () => ({ type: "get_session_stats" })
  }
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

/** Prefix filter over the palette; empty query returns everything. */
export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) => q.length === 0 || command.name.startsWith(q));
}
