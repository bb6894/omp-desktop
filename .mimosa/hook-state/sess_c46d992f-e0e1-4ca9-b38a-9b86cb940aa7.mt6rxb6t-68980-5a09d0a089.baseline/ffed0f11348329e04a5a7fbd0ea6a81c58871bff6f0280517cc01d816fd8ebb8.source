import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "bun:test";
import { canonicalizeProposalValue, digestCanonicalProposal } from "../src/proposal-digest";

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

test("freezes the Stage 3A canonical UTF-8 and SHA-256 seam", () => {
  const fixture = JSON.parse(readFileSync(resolve(
    import.meta.dir,
    "fixtures/proposal-canonicalization-golden.json"
  ), "utf8")) as CanonicalFixture;
  expect(fixture.schemaVersion).toBe(1);
  for (const item of fixture.cases) {
    const digest = digestCanonicalProposal(item.value);
    expect(digest.canonicalJson, item.name).toBe(item.canonicalJson);
    expect(Buffer.from(digest.canonicalJson, "utf8").toString("hex"), item.name).toBe(item.utf8Hex);
    expect(digest.sha256, item.name).toBe(item.sha256);
    expect(canonicalizeProposalValue(item.value), item.name).toBe(item.canonicalJson);
  }
});
