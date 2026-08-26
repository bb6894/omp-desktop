import { describe, expect, test } from "bun:test";
import {
  matchSlashCommands,
  parseSlashInput,
  SLASH_COMMANDS
} from "../src/lib/slash-commands";

describe("parseSlashInput", () => {
  test("parses token and free text; case-insensitive name", () => {
    expect(parseSlashInput("/new")).toEqual({ name: "new", rest: "" });
    expect(parseSlashInput("  /Compact 压缩保留测试说明 ")).toEqual({
      name: "compact",
      rest: "压缩保留测试说明"
    });
    expect(parseSlashInput("/EXPORT")).toEqual({ name: "export", rest: "" });
  });

  test("non-slash or bare slash input returns null", () => {
    expect(parseSlashInput("普通消息")).toBeNull();
    expect(parseSlashInput("/")).toBeNull();
    expect(parseSlashInput("")).toBeNull();
    expect(parseSlashInput("前缀 /new")).toBeNull();
  });
});

describe("matchSlashCommands", () => {
  test("empty query lists the whole palette", () => {
    expect(matchSlashCommands("").map((command) => command.name)).toEqual(
      SLASH_COMMANDS.map((command) => command.name)
    );
  });

  test("prefix filter matches tokens only", () => {
    expect(matchSlashCommands("c").map((command) => command.name)).toEqual(["compact"]);
    expect(matchSlashCommands("NEW")).toEqual([SLASH_COMMANDS[0]]);
    expect(matchSlashCommands("zzz")).toEqual([]);
  });
});

describe("palette builds allowlisted Runtime commands", () => {
  test("each command emits a type plus optional fields", () => {
    const byName = new Map(SLASH_COMMANDS.map((command) => [command.name, command]));
    expect(byName.get("new")!.build("")).toEqual({ type: "new_session" });
    expect(byName.get("compact")!.build("")).toEqual({ type: "compact" });
    expect(byName.get("compact")!.build("保留计划")).toEqual({
      type: "compact",
      customInstructions: "保留计划"
    });
    expect(byName.get("export")!.build("")).toEqual({ type: "export_html" });
    expect(byName.get("stats")!.build("")).toEqual({ type: "get_session_stats" });
  });

  test("every palette command is Host-allowlisted vocabulary (no drift)", () => {
    // Mirrors session-service ALLOWED_AGENT_COMMANDS — keep in lockstep.
    const allowed = new Set([
      "abort",
      "compact",
      "cycle_model",
      "cycle_thinking_level",
      "export_html",
      "extension_ui_response",
      "follow_up",
      "get_available_models",
      "get_login_providers",
      "get_messages",
      "get_session_stats",
      "get_state",
      "login",
      "new_session",
      "prompt",
      "set_model",
      "steer"
    ]);
    for (const command of SLASH_COMMANDS) {
      expect(allowed.has(command.build("").type as string), command.name).toBe(true);
    }
  });
});
