import { expect, test } from "bun:test";
import { sanitizeFrame } from "../src/agent-service";

test("redacts provider credentials before runtime frames cross the Host boundary", () => {
  expect(sanitizeFrame({
    type: "response",
    headers: { Authorization: "Bearer secret" },
    apiKey: "secret",
    nested: [{ access_token: "secret" }],
    model: { id: "fixture-model" }
  })).toEqual({
    type: "response",
    headers: "[REDACTED]",
    apiKey: "[REDACTED]",
    nested: [{ access_token: "[REDACTED]" }],
    model: { id: "fixture-model" }
  });
});

test("keeps ordinary runtime fields unchanged", () => {
  expect(sanitizeFrame({ type: "turn_start", turnIndex: 2, message: { role: "assistant" } })).toEqual({
    type: "turn_start",
    turnIndex: 2,
    message: { role: "assistant" }
  });
});
