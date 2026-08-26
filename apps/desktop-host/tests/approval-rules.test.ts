import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APPROVAL_RULE_FILE_VERSION,
  ApprovalRuleBook,
  extractApprovalTool,
  isValidApprovalTool
} from "../src/approval-rules";

const directories: string[] = [];

async function tempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "approval-rules-"));
  directories.push(dir);
  return join(dir, name);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function approvalFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "extension_ui_request",
    id: "ask-1",
    method: "select",
    title: "Allow tool: bash\n$ npm test",
    options: ["Approve", "Deny"],
    ...overrides
  };
}

test("extractApprovalTool matches only Approve/Deny selects titled Allow tool", () => {
  expect(extractApprovalTool(approvalFrame() as never)).toBe("bash");
  expect(extractApprovalTool(approvalFrame({ title: "Allow tool: quick_task\n…" }) as never)).toBe("quick_task");
});

test("extractApprovalTool rejects non-approval dialogs and malformed titles", () => {
  expect(extractApprovalTool(approvalFrame({ method: "confirm" }) as never)).toBeNull();
  expect(extractApprovalTool(approvalFrame({ options: ["Allow once", "Deny"] }) as never)).toBeNull();
  expect(extractApprovalTool(approvalFrame({ options: ["Approve"] }) as never)).toBeNull();
  expect(extractApprovalTool(approvalFrame({ title: "选择模型" }) as never)).toBeNull();
  expect(extractApprovalTool(approvalFrame({ title: "Allow tool: \nbash" }) as never)).toBeNull();
  expect(extractApprovalTool(approvalFrame({ id: "" }) as never)).toBeNull();
  expect(extractApprovalTool({ type: "response" } as never)).toBeNull();
});

test("isValidApprovalTool enforces the bounded tool charset", () => {
  expect(isValidApprovalTool("bash")).toBe(true);
  expect(isValidApprovalTool("webfetch")).toBe(true);
  expect(isValidApprovalTool("")).toBe(false);
  expect(isValidApprovalTool("a".repeat(65))).toBe(false);
  expect(isValidApprovalTool("bad tool")).toBe(false);
  expect(isValidApprovalTool(42)).toBe(false);
});

test("session grants stay in memory and answer matching tools only", async () => {
  const book = new ApprovalRuleBook(await tempFile("rules.json"));
  const outcome = await book.grant("route-a", { tool: "bash", scope: "session", sourceInteractionId: "ask-1" });
  expect(outcome.created).toBe(true);
  expect(outcome.rule?.id).toBe("session:bash");
  await expect(book.grant("route-a", { tool: "bash", scope: "session", sourceInteractionId: null })).resolves.toEqual({
    created: false,
    rule: outcome.rule
  });
  expect(book.has("bash", "route-a")).toBe(true);
  expect(book.has("bash", "route-b")).toBe(false);
  expect(book.has("read", "route-a")).toBe(false);
  const list = await book.list("route-a");
  expect(list.session.map((rule) => rule.id)).toEqual(["session:bash"]);
  expect(list.project).toEqual([]);
  await expect(book.revoke("session:bash")).resolves.toBe(true);
  expect(book.has("bash", "route-a")).toBe(false);
});

test("project grants persist atomically and reload across books", async () => {
  const file = await tempFile("rules.json");
  const first = new ApprovalRuleBook(file);
  const outcome = await first.grant("route-a", { tool: "bash", scope: "project", sourceInteractionId: "ask-9" });
  expect(outcome.created).toBe(true);
  expect(outcome.rule?.id).toBe("project:bash");
  await expect(first.grant("route-a", { tool: "bash", scope: "project", sourceInteractionId: null })).resolves.toEqual({
    created: false,
    rule: outcome.rule
  });

  const raw = JSON.parse(await readFile(file, "utf8")) as { version: number; rules: unknown[] };
  expect(raw.version).toBe(APPROVAL_RULE_FILE_VERSION);
  expect(raw.rules).toHaveLength(1);

  const second = new ApprovalRuleBook(file);
  expect(second.has("bash", "any-route")).toBe(false); // not loaded yet — fail closed
  await second.ready();
  expect(second.has("bash", "any-route")).toBe(true);
  await expect(second.revoke("project:bash")).resolves.toBe(true);
  expect(second.has("bash", "any-route")).toBe(false);

  const third = new ApprovalRuleBook(file);
  await third.ready();
  expect(third.has("bash", "any-route")).toBe(false);
});

test("corrupt project files fail closed toward prompting instead of throwing", async () => {
  const file = await tempFile("rules.json");
  await writeFile(file, "{not json", "utf8");
  const book = new ApprovalRuleBook(file);
  await book.ready();
  expect(book.has("bash", "route-a")).toBe(false);
  const list = await book.list("route-a");
  expect(list.project).toEqual([]);
  // A later grant still persists a fresh valid file.
  await expect(book.grant("route-a", { tool: "read", scope: "project", sourceInteractionId: null })).resolves.toMatchObject({
    created: true
  });
});

test("revoke tolerates unknown ids and scopes", async () => {
  const book = new ApprovalRuleBook(await tempFile("rules.json"));
  await expect(book.revoke("garbage")).resolves.toBe(false);
  await expect(book.revoke("unknown:tool")).resolves.toBe(false);
});
