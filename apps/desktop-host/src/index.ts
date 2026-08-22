import { RUNTIME_MANIFEST } from "./runtime-manifest";
import { serveLocalHost } from "./host-server";
import { OfficialOmpSessionAdapter } from "./omp-adapter";
import { resolveProfilePaths } from "./profile-paths";
import { SessionService } from "./session-service";

export { OfficialOmpSessionAdapter } from "./omp-adapter";
export { OmpRpcBridge, RpcLineDecoder } from "./rpc-bridge";
export { hashRuntime, resolveBundledRuntime, spawnVerifiedRuntime, verifyRuntime } from "./runtime";

export function hostSnapshot() {
  return {
    type: "host.ready",
    hostProtocol: 1,
    runtime: RUNTIME_MANIFEST
  } as const;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const positions = args.flatMap((argument, index) => argument === name ? [index] : []);
  if (positions.length > 1) throw new Error("HOST_INVALID_ARGUMENTS");
  if (positions.length === 0) return undefined;
  const value = args[positions[0] + 1];
  if (!value || value.startsWith("--")) throw new Error("HOST_INVALID_ARGUMENTS");
  return value;
}

async function runHost(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.includes("--serve")) {
    process.stdout.write(JSON.stringify(hostSnapshot()) + "\n");
    return;
  }
  const cwd = optionValue(args, "--cwd");
  if (!cwd) throw new Error("HOST_CWD_REQUIRED");
  const paths = resolveProfilePaths(cwd, optionValue(args, "--profile"));
  const sessions = new SessionService(new OfficialOmpSessionAdapter(cwd, paths));
  await serveLocalHost(process.stdin, {
    write: (bytes) => process.stdout.write(Buffer.from(bytes))
  }, sessions);
}

const isCompiledHost = process.execPath.toLowerCase().endsWith("omp-desktop-host.exe");

if (import.meta.main || isCompiledHost) {
  void runHost().catch(() => {
    process.stderr.write("HOST_STARTUP_ERROR\n");
    process.exitCode = 1;
  });
}
