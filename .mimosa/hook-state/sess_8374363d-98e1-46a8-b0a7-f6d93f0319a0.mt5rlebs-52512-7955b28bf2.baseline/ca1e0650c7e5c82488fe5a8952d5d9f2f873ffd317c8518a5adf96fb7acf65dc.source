import { createHash } from "node:crypto";
import type { MemoryProposalDigest } from "./proposal-contracts";

export function canonicalizeProposalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalizeProposalValue).join(",") + "]";
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const fields = keys.map((key) => JSON.stringify(key) + ":" + canonicalizeProposalValue(value[key]));
    return "{" + fields.join(",") + "}";
  }
  throw new Error("PROPOSAL_CANONICAL_VALUE_UNSUPPORTED");
}
export function digestCanonicalProposal(value: unknown): MemoryProposalDigest {
  const canonicalJson = canonicalizeProposalValue(value);
  const sha256 = createHash("sha256")
    .update(Buffer.from(canonicalJson, "utf8"))
    .digest("hex");
  return Object.freeze({ algorithm: "sha256", sha256, canonicalJson });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
