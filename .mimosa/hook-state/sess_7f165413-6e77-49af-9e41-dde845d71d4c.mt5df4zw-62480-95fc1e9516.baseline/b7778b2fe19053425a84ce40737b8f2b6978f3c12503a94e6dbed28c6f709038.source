import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeLocalFrame, LocalFrameDecoder } from "../apps/desktop-host/src/local-frame";

const root = process.cwd();
const host = Bun.argv[2] ?? `${root}/artifacts/omp-desktop-host.exe`;
const profile = mkdtempSync(join(tmpdir(), "omp-desktop-fixture-smoke-"));
const child = Bun.spawn([host, "--serve", "--fixture", "--cwd", root, "--profile", profile], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe"
});

const decoder = new LocalFrameDecoder();
const frames: unknown[] = [];
const write = (request: unknown) => child.stdin.write(encodeLocalFrame(request));
write({ type: "agent.start", requestId: "start", sessionId: "fixture", prompt: "go" });

let sentResponse = false;
let sentStop = false;
const deadline = Date.now() + 10_000;
for await (const chunk of child.stdout) {
  frames.push(...decoder.push(chunk));
  const interaction = frames.some((frame) => {
    const payload = (frame as { payload?: { type?: string; id?: string } }).payload;
    return payload?.type === "extension_ui_request" && payload.id === "fixture-choice";
  });
  const completed = frames.some((frame) => (frame as { payload?: { state?: string } }).payload?.state === "completed");
  const interrupted = frames.some((frame) => (frame as { payload?: { state?: string } }).payload?.state === "interrupted");
  if (interaction && !sentResponse) {
    sentResponse = true;
    write({
      type: "interaction.respond",
      requestId: "answer",
      sessionId: "fixture",
      interactionId: "fixture-choice",
      value: "continue"
    });
  }
  if (completed && !sentStop) {
    sentStop = true;
    write({ type: "agent.stop", requestId: "stop", sessionId: "fixture" });
  }
  const stopResponse = frames.some((frame) => (
    frame as { type?: string; requestId?: string; ok?: boolean }
  ).type === "response" && (frame as { requestId?: string }).requestId === "stop" && (frame as { ok?: boolean }).ok === true);
  if ((interrupted && stopResponse) || Date.now() > deadline) break;
}
child.kill();
await child.exited;
decoder.finish();
rmSync(profile, { recursive: true, force: true });

const names = frames.map((frame) => (frame as { name?: string }).name);
const stateEvents = frames
  .filter((frame) => (frame as { name?: string }).name === "agent.state")
  .map((frame) => (frame as { payload?: { state?: string } }).payload?.state);
const runtimeTypes = frames
  .filter((frame) => (frame as { name?: string }).name === "runtime.frame")
  .map((frame) => (frame as { payload?: { type?: string } }).payload?.type);
const responses = new Map(
  frames
    .filter((frame) => (frame as { type?: string }).type === "response")
    .map((frame) => [(frame as { requestId?: string }).requestId, frame as { ok?: boolean }])
);
const requiredStates = ["starting", "streaming", "awaiting-tool", "awaiting-interaction", "completed", "stopping", "interrupted"];
const requiredRuntimeTypes = ["message_update", "tool_execution_start", "tool_execution_end", "extension_ui_request", "turn_end", "agent_end"];
if (
  !requiredStates.every((state) => stateEvents.includes(state)) ||
  !requiredRuntimeTypes.every((type) => runtimeTypes.includes(type)) ||
  !["start", "answer", "stop"].every((requestId) => responses.get(requestId)?.ok === true)
) {
  throw new Error(`fixture lifecycle failed: names=${names.join(",")} states=${stateEvents.join(",")} frames=${runtimeTypes.join(",")}`);
}
console.log(JSON.stringify({
  fixtureLifecycleOk: true,
  states: stateEvents,
  runtimeTypes,
  responses: ["start", "answer", "stop"].map((requestId) => ({ requestId, ok: responses.get(requestId)?.ok === true }))
}));
