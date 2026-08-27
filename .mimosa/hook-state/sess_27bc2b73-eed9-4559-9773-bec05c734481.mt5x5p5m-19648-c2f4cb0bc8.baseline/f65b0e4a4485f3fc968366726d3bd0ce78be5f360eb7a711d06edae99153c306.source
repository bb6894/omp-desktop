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
    "load_session_messages",
    "fork_session",
    "inspect_harness",
    "open_project",
    "start_git_watch",
    "stop_git_watch",
    "open_url_external"
  ]);
});
