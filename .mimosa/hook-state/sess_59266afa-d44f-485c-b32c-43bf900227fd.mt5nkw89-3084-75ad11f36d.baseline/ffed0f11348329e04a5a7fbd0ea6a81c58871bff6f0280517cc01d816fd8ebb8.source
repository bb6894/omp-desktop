import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "bun:test";

type CanonicalFixture = {
  schemaVersion: 1;
  cases: Array<{
    name: string;
    value: unknown;
    canonicalJson: string;
    utf8Hex: string;
    sha256: string;
  }>;
};

function canonicalizeFixtureValue(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeFixtureValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeFixtureValue(item)}`);
    return `{${fields.join(",")}}`;
  }
  throw new Error("CANONICAL_FIXTURE_VALUE_UNSUPPORTED");
}

test("freezes the Stage 3A canonical UTF-8 and SHA-256 seam", () => {
  const fixture = JSON.parse(readFileSync(resolve(
    import.meta.dir,
    "fixtures/proposal-canonicalization-golden.json"
  ), "utf8")) as CanonicalFixture;
  expect(fixture.schemaVersion).toBe(1);
  for (const item of fixture.cases) {
    const canonicalJson = canonicalizeFixtureValue(item.value);
    const bytes = Buffer.from(canonicalJson, "utf8");
    expect(canonicalJson, item.name).toBe(item.canonicalJson);
    expect(bytes.toString("hex"), item.name).toBe(item.utf8Hex);
    expect(createHash("sha256").update(bytes).digest("hex"), item.name)
      .toBe(item.sha256);
  }
});
