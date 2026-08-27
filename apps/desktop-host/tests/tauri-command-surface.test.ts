import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const libPath = resolve(import.meta.dir, "../../../src-tauri/src/lib.rs");

test("keeps one explicit renderer-to-Rust command surface", () => {
  const source = readFileSync(libPath, "utf8");
  expect(source.match(/\.invoke_handler\s*\(/g)).toHaveLength(1);
  const handler = source.match(/tauri::generate_handler!\[([\s\S]*?)\]/);
  expect(handler, "missing tauri::generate_handler! command list").not.toBeNull();
  const commands = handler?.[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  expect(commands).toEqual([
    "send_command",
    "start_session",
    "stop_session",
    "session_status",
    "list_sessions",
    "get_messages_page",
    "load_session_messages",
    "fork_session",
    "session_views",
    "session_metadata_set",
    "session_open_runtime",
    "workspace_changes",
    "workspace_apply",
    "workspace_diff",
    "events_replay",
    "approval_rules_list",
    "approval_rules_add",
    "approval_rules_remove",
    "inspect_harness",
    "preview_harness_memory",
    "apply_harness_memory",
    "rollback_harness",
    "open_project",
    "start_git_watch",
    "stop_git_watch",
    "open_url_external"
  ]);
});
