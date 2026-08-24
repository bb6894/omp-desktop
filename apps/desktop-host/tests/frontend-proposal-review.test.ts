import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "../../../src");
const reviewPath = resolve(sourceRoot, "design/harness/proposal-review.jsx");
const inspectorPath = resolve(sourceRoot, "design/harness/inspector.jsx");

const FORBIDDEN_RENDER_PATTERNS = [
  /dangerouslySetInnerHTML/,
  /\.innerHTML\s*=/,
  /insertAdjacentHTML/,
  /document\.write\(/,
  /\bmarked\s*\(|marked\.parse/,
  /\beval\s*\(/,
  /new\s+Function\(/
];

test("harness review UI renders proposal content as React text only", () => {
  for (const [path, label] of [[reviewPath, "proposal-review"], [inspectorPath, "inspector"]] as const) {
    const source = readFileSync(path, "utf8");
    for (const pattern of FORBIDDEN_RENDER_PATTERNS) {
      expect(source.match(pattern), `${label} must not use ${pattern}`).toBeNull();
    }
  }
});

test("the review payload builder never emits host-derived context fields", () => {
  const rules = loadReviewModule();
  const allowed = new Set(["operation", "title", "content", "targetId"]);
  const samples = [
    rules.buildPreviewPayload({ operation: "memory.add", title: "T", content: "C" }),
    rules.buildPreviewPayload({ operation: "memory.replace", title: "T", content: "C", targetId: "memory-x" }),
    rules.buildPreviewPayload({ projectId: "0".repeat(32), cwd: "C:\\x" } as never)
  ];
  for (const [index, sample] of samples.entries()) {
    if (sample === null) continue;
    for (const key of Object.keys(sample)) {
      expect(allowed.has(key), `sample ${index} payload key ${key} stays Host-owned`).toBe(true);
    }
  }
});

type ReviewRules = {
  buildPreviewPayload(draft: unknown): Record<string, unknown> | null;
  buildApproval(approvedBy: string, approvalReason: string): { approvedBy: string; reason: string };
  isApplyReady(previewOutcome: unknown, approval: unknown): boolean;
};

function loadReviewModule(): ReviewRules {
  // The panel is a text/babel script: transpile with the same vendored Babel
  // runtime the WebView uses, then execute the plain JS in a sandbox.
  const require = createRequire(import.meta.url);
  const Babel = require(resolve(sourceRoot, "babel.min.js")) as {
    transform(source: string, options: { presets: string[]; filename: string }): { code?: string };
  };
  const transformed = Babel.transform(readFileSync(reviewPath, "utf8"), {
    presets: ["react"],
    filename: "design/harness/proposal-review.jsx"
  });
  if (typeof transformed.code !== "string") throw new Error("Babel produced no code for proposal-review.jsx");
  const browserWindow: Record<string, unknown> = {};
  new Function("window", "React", transformed.code)(browserWindow, undefined);
  const rules = browserWindow.HARNESS_REVIEW_RULES as unknown;
  if (!rules || typeof rules !== "object") throw new Error("HARNESS_REVIEW_RULES was not registered");
  return rules as ReviewRules;
}

test("buildPreviewPayload emits only the minimal wire fields per operation", () => {
  const rules = loadReviewModule();

  expect(rules.buildPreviewPayload({ operation: "memory.add", title: "T", content: "C" }))
    .toEqual({ operation: "memory.add", title: "T", content: "C" });
  expect(rules.buildPreviewPayload({ operation: "memory.add", title: "T", content: "C", targetId: "memory-x" }))
    .toEqual({ operation: "memory.add", title: "T", content: "C" });
  expect(rules.buildPreviewPayload({ operation: "memory.replace", title: "T", content: "C", targetId: "memory-x" }))
    .toEqual({ operation: "memory.replace", title: "T", content: "C", targetId: "memory-x" });
});

test("buildPreviewPayload rejects blank drafts and replace drafts without a target", () => {
  const rules = loadReviewModule();

  expect(rules.buildPreviewPayload(null)).toBeNull();
  expect(rules.buildPreviewPayload({})).toBeNull();
  expect(rules.buildPreviewPayload({ operation: "memory.delete", title: "T", content: "C" })).toBeNull();
  expect(rules.buildPreviewPayload({ operation: "memory.add", title: "   ", content: "C" })).toBeNull();
  expect(rules.buildPreviewPayload({ operation: "memory.add", title: "T", content: "" })).toBeNull();
  expect(rules.buildPreviewPayload({ operation: "memory.replace", title: "T", content: "C" })).toBeNull();
  expect(rules.buildPreviewPayload({ operation: "memory.replace", title: "T", content: "C", targetId: "  " })).toBeNull();
});

test("apply gating requires a live preview and two non-blank approval fields", () => {
  const rules = loadReviewModule();
  const previewed = { status: "previewed", preview: {} };
  const rejected = { status: "rejected", code: "PREVIEW_POLICY_REJECTED" };

  expect(rules.isApplyReady(null, { approvedBy: "u", reason: "r" })).toBe(false);
  expect(rules.isApplyReady(rejected, { approvedBy: "u", reason: "r" })).toBe(false);
  expect(rules.isApplyReady(previewed, null)).toBe(false);
  expect(rules.isApplyReady(previewed, { approvedBy: "", reason: "r" })).toBe(false);
  expect(rules.isApplyReady(previewed, { approvedBy: "u", reason: " \t " })).toBe(false);
  expect(rules.isApplyReady(previewed, { approvedBy: "u", reason: "r" })).toBe(true);
});

test("apply approval wire payload uses the Host contract reason field", () => {
  const rules = loadReviewModule();

  expect(rules.buildApproval("  本人 ", "  Stage 3C 功能验收 "))
    .toEqual({ approvedBy: "本人", reason: "Stage 3C 功能验收" });
});

test("apply readiness uses the same reason field as the wire payload", () => {
  const rules = loadReviewModule();

  expect(rules.isApplyReady({ status: "previewed", preview: {} }, { approvedBy: "本人", reason: "验收" })).toBe(true);
  expect(rules.isApplyReady({ status: "previewed", preview: {} }, { approvedBy: "本人", approvalReason: "验收" })).toBe(false);
});

test("mutation result UI survives the refresh that follows a successful write", () => {
  const reviewSource = readFileSync(reviewPath, "utf8");
  const inspectorSource = readFileSync(inspectorPath, "utf8");

  expect(reviewSource).not.toContain("setApprovedBy(\"\"); setApprovalReason(\"\"); setApplyResult(null);");
  expect(inspectorSource).toContain("!errorCopy && state && mode === \"review\"");
  expect(inspectorSource).not.toContain("!loading && !errorCopy && state && mode === \"review\"");
});
