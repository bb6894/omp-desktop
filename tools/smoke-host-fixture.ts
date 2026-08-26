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
let done = false;
const pump = (async () => {
  for await (const chunk of child.stdout) {
    frames.push(...decoder.push(chunk));
    const timeline = frames.filter(
      (frame) => (frame as { name?: string }).name === "timeline"
    );
    const hasKind = (kind: string) =>
      timeline.some((frame) => (frame as { payload?: { kind?: string } }).payload?.kind === kind);
    const stateSeen = (state: string) =>
      timeline.some(
        (frame) =>
          (frame as { payload?: { kind?: string; state?: string } }).payload?.kind ===
            "run.state" && (frame as { payload?: { state?: string } }).payload?.state === state
      );
    if (hasKind("interaction.requested") && !sentResponse) {
      sentResponse = true;
      // P1 wire contract: answers merge TOP-LEVEL fields onto extension_ui_response.
      write({
        type: "interaction.respond",
        requestId: "answer",
        sessionId: "fixture",
        interactionId: "fixture-choice",
        response: { value: "continue" }
      });
    }
    if (stateSeen("completed") && !sentStop) {
      sentStop = true;
      write({ type: "agent.stop", requestId: "stop", sessionId: "fixture" });
    }
    const stopResponse = frames.some((frame) => (
      frame as { type?: string; requestId?: string; ok?: boolean }
    ).type === "response" && (frame as { requestId?: string }).requestId === "stop" && (frame as { ok?: boolean }).ok === true);
    if (stateSeen("interrupted") && stopResponse) {
      done = true;
      break;
    }
  }
})();

// Hang-proof: even with zero inbound frames the pump must not block forever.
await Promise.race([pump, Bun.sleep(20_000)]);
if (!done && pump.isStarted && !pump.isCompleted) console.error("[smoke] deadline reached before lifecycle completed");
child.kill();
await child.exited;
decoder.finish();
rmSync(profile, { recursive: true, force: true });

const timelineEvents = frames
  .filter((frame) => (frame as { name?: string }).name === "timeline")
  .map((frame) => (frame as { payload?: { kind?: string; state?: string } }).payload ?? {});
const kinds = timelineEvents.map((payload) => payload.kind);
const stateEvents = timelineEvents
  .filter((payload) => payload.kind === "run.state")
  .map((payload) => payload.state);
const responses = new Map(
  frames
    .filter((frame) => (frame as { type?: string }).type === "response")
    .map((frame) => [(frame as { requestId?: string }).requestId, frame as { ok?: boolean }])
);
const requiredStates = ["starting", "streaming", "awaiting-tool", "awaiting-interaction", "completed", "stopping", "interrupted"];
const requiredKinds = ["run.state", "message.added", "message.delta", "tool.started", "tool.finished", "interaction.requested"];
if (
  !requiredStates.every((state) => stateEvents.includes(state)) ||
  !requiredKinds.every((kind) => kinds.includes(kind)) ||
  !["start", "answer", "stop"].every((requestId) => responses.get(requestId)?.ok === true)
) {
  throw new Error(`fixture lifecycle failed: states=${stateEvents.join(",")} kinds=${kinds.join(",")}`);
}
console.log(JSON.stringify({
  fixtureLifecycleOk: true,
  states: stateEvents,
  kinds,
  responses: ["start", "answer", "stop"].map((requestId) => ({ requestId, ok: responses.get(requestId)?.ok === true }))
}));
