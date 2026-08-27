import { encodeLocalFrame, LocalFrameDecoder } from "../apps/desktop-host/src/local-frame";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const host = Bun.argv[2] ?? `${root}/artifacts/omp-desktop-host.exe`;
const runtime = Bun.argv[3] ?? `${root}/artifacts/omp-windows-x64.exe`;
const cwd = Bun.argv[4] ?? root;
const profile = mkdtempSync(join(tmpdir(), "omp-desktop-host-smoke-"));

const child = Bun.spawn([host, "--serve", "--cwd", cwd, "--runtime", runtime, "--profile", profile], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe"
});

const first = encodeLocalFrame({ type: "session.list", requestId: "smoke-list" });
const second = encodeLocalFrame({
  type: "agent.command",
  requestId: "smoke-state",
  sessionId: "smoke",
  command: { type: "get_state" }
});
const third = encodeLocalFrame({ type: "unknown", requestId: "smoke-unknown" });
const input = new Uint8Array(first.byteLength + second.byteLength + third.byteLength);
input.set(first);
input.set(second, first.byteLength);
input.set(third, first.byteLength + second.byteLength);
child.stdin.write(input);

const decoder = new LocalFrameDecoder();
const frames: unknown[] = [];
const deadline = Date.now() + 10_000;
for await (const chunk of child.stdout) {
  frames.push(...decoder.push(chunk));
  const hasList = frames.some((frame) => (frame as { requestId?: string }).requestId === "smoke-list");
  const hasState = frames.some((frame) => (frame as { requestId?: string }).requestId === "smoke-state");
  const hasUnknown = frames.some((frame) => (frame as { requestId?: string }).requestId === "smoke-unknown");
  if ((hasList && hasState && hasUnknown) || Date.now() > deadline) break;
}
child.kill();
await child.exited;
decoder.finish();

const response = (requestId: string) => frames.find((frame) => (frame as { requestId?: string }).requestId === requestId) as
  | { ok?: boolean; code?: string; value?: { command?: string; success?: boolean; data?: unknown } }
  | undefined;
const state = response("smoke-state");
const serialized = JSON.stringify(frames);
if (!response("smoke-list")?.ok || !state?.ok || state.value?.command !== "get_state" || state.value.success !== true || response("smoke-unknown")?.code !== "UNKNOWN_COMMAND") {
  throw new Error(`unexpected Host responses: ${JSON.stringify(frames)}`);
}
console.log(JSON.stringify({
  listOk: response("smoke-list")?.ok === true,
  stateOk: state.ok === true && state.value?.command === "get_state" && state.value.success === true,
  unknownRejected: response("smoke-unknown")?.code === "UNKNOWN_COMMAND",
  sensitiveFieldsRedacted: !serialized.includes("Authorization") && !serialized.includes("apiKey") && !serialized.includes("accessToken"),
  runtimeFrames: frames.filter((frame) => (frame as { name?: string }).name === "runtime.frame").length,
  agentStates: frames
    .filter((frame) => (frame as { name?: string }).name === "agent.state")
    .map((frame) => (frame as { payload?: { state?: string } }).payload?.state)
}));
if (serialized.includes("Authorization") || serialized.includes("apiKey") || serialized.includes("accessToken")) {
  throw new Error("Host response contains a sensitive field name");
}
rmSync(profile, { recursive: true, force: true });
