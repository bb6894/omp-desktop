import { expect, test } from "bun:test";
import type { HostEvent } from "../src/contracts";
import { FixtureAgentService } from "../src/fixture-agent-service";

test("emits a deterministic streaming, tool, interaction, and completion lifecycle", async () => {
  const events: HostEvent[] = [];
  const fixture = new FixtureAgentService((event) => events.push(event));
  await fixture.start("fixture", "go");
  await fixture.respond("fixture", "fixture-choice", "continue");

  expect(events.map((event) => event.sequence)).toEqual([...events.keys()].map((index) => index + 1));
  expect(events.map((event) => event.name)).toContain("runtime.frame");
  expect(events.map((event) => event.name)).toContain("agent.state");
  expect(events.some((event) => (event.payload as { type?: string }).type === "tool_execution_start")).toBe(true);
  expect(events.some((event) => (event.payload as { type?: string }).type === "extension_ui_request")).toBe(true);
  expect(events.at(-1)).toMatchObject({ name: "agent.state", payload: { state: "completed" } });
});

test("rejects interaction responses that do not match the current session and id", async () => {
  const fixture = new FixtureAgentService(() => undefined);
  await fixture.start("fixture", "go");
  await expect(fixture.respond("other", "fixture-choice", "continue")).rejects.toThrow("INTERACTION_NOT_FOUND");
});
