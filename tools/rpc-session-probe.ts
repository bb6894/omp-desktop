/**
 * rpc-session-probe.ts — Phase 0 / T0.1 live wire-evidence probe.
 *
 * Spawns the PINNED bundled runtime (hash-verified), negotiates RPC v2 through
 * the production OmpRpcBridge, and captures verbatim frames for:
 *   get_state → new_session → get_state → switch_session determinism sequence
 *   (auto → created → auto again) → switch_session bogus-path error.
 *
 * Every captured frame passes through redact() before storage/printing: the
 * pinned runtime echoes provider credentials inside get_state data.model.headers,
 * which must never reach disk or logs.
 *
 * Run: bun tools/rpc-session-probe.ts [outputJsonPath]
 * No model/network calls are made — identity is local runtime state.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OmpRpcBridge } from "../apps/desktop-host/src/rpc-bridge";
import { spawnVerifiedRuntime } from "../apps/desktop-host/src/runtime";

const REPO = resolve(import.meta.dir, "..");
const RUNTIME = join(REPO, "artifacts", "omp-windows-x64.exe");

const SECRET_PATTERN = /sk-[A-Za-z0-9_-]{16,}/g;

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(SECRET_PATTERN, "[REDACTED]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = /^authorization$/i.test(key) ? "[REDACTED]" : redact(child);
    }
    return out;
  }
  return value;
}

type CapturedFrame = { dir: "in" | "out"; frame: unknown };

async function main(): Promise<void> {
  const workRoot = mkdtempSync(join(tmpdir(), "omp-session-identity-"));
  const projectDir = join(workRoot, "project");
  const sessionDir = join(projectDir, ".omp-sessions");
  await mkdir(sessionDir, { recursive: true });

  const transcript: CapturedFrame[] = [];
  const log = (dir: "in" | "out", raw: unknown) => {
    transcript.push({ dir, frame: redact(raw) });
    process.stdout.write(`[${dir}] ${JSON.stringify(redact(raw))}\n`);
  };

  const spawned = await spawnVerifiedRuntime({
    runtimePath: RUNTIME,
    cwd: projectDir,
    sessionDir
  });
  const bridge = new OmpRpcBridge(spawned.process, {
    onFrame: (frame) => log("in", frame),
    readyTimeoutMs: 20_000
  });

  const outPath =
    process.argv[2] ?? join(REPO, "docs", "agents", "evidence", "runtime-session-identity.json");

  try {
    await bridge.start();
    console.log("negotiated: rpc v2");

    const send = async (command: Record<string, unknown>) => {
      log("out", command);
      return bridge.request(command);
    };
    const stateData = (response: unknown): Record<string, unknown> =>
      ((response as { data?: Record<string, unknown> }).data ?? {});

    const stateBefore = await send({ type: "get_state" });
    const autoFile =
      typeof stateData(stateBefore).sessionFile === "string"
        ? String(stateData(stateBefore).sessionFile)
        : null;

    await send({ type: "new_session" });
    const stateAfterCreate = await send({ type: "get_state" });
    const createdFile =
      typeof stateData(stateAfterCreate).sessionFile === "string"
        ? String(stateData(stateAfterCreate).sessionFile)
        : null;

    // Determinism: A(auto) -> B(created) -> A again. If sessionId were stable
    // per file, returning to autoFile would restore its earlier id.
    const switchSequence: Array<Record<string, unknown>> = [];
    for (const target of [autoFile, createdFile, autoFile]) {
      if (!target) continue;
      const label = target === autoFile ? "auto" : "created";
      const response = await send({ type: "switch_session", sessionPath: target });
      const state = await send({ type: "get_state" });
      switchSequence.push({
        label,
        switchResponse: response,
        sessionId: stateData(state).sessionId ?? null,
        sessionFile: stateData(state).sessionFile ?? null
      });
    }
    const bogusSwitch = await send({
      type: "switch_session",
      sessionPath: "Z:\\definitely\\missing.jsonl"
    });

    await bridge.stop();

    const evidence = {
      capturedAt: new Date().toISOString(),
      runtime: {
        path: spawned.runtime.path,
        sha256: spawned.runtime.sha256,
        manifest: spawned.runtime.manifest
      },
      launchArgs: ["--mode", "rpc", "--cwd", projectDir, "--session-dir", sessionDir],
      frames: transcript,
      extracted: {
        stateBefore,
        stateAfterCreate,
        switchSequence,
        switchBogus: bogusSwitch,
        note:
          "sessionId is compared across repeated switches to decide whether it is per-load ephemeral or file-stable; sessionFile is the candidate durable anchor."
      }
    };
    await mkdir(join(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(redact(evidence), null, 2)}\n`);
    console.log(`evidence written: ${outPath}`);
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
