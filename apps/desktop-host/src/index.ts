import { RUNTIME_MANIFEST } from "./runtime-manifest";
import { serveLocalHost } from "./host-server";
import { OfficialOmpSessionAdapter } from "./omp-adapter";
import { resolveProfilePaths, type ProfilePaths } from "./profile-paths";
import { SessionService } from "./session-service";
import { AgentService, defaultRuntimePath } from "./agent-service";
import { FixtureAgentService } from "./fixture-agent-service";
import { defaultHarnessDataRoot, harnessProjectId, HarnessStore } from "./harness-store";
import { HarnessMutationExecutor } from "./harness-mutation-executor";
import { HarnessMutationService } from "./harness-mutation-service";
import { join } from "node:path";
import { SessionMetadataStore } from "./session-metadata-store";
import { collectStatus, buildDiff, nodeExec } from "./workspace";
import { ApprovalRuleBook } from "./approval-rules";

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

export function createHostSessionService(cwd: string, paths: ProfilePaths): SessionService {
  const harnessDataRoot = defaultHarnessDataRoot();
  const inspector = new HarnessStore(cwd, harnessDataRoot);
  const mutations = new HarnessMutationService(cwd, inspector, new HarnessMutationExecutor(cwd, harnessDataRoot));
  const sessionMetadata = new SessionMetadataStore(
    join(harnessDataRoot, "OMP Desktop", "sessions", "projects", harnessProjectId(cwd), "metadata.json")
  );
  const approvalRules = new ApprovalRuleBook(
    join(harnessDataRoot, "OMP Desktop", "sessions", "projects", harnessProjectId(cwd), "approval-rules.json")
  );
  const sessions = new SessionService(new OfficialOmpSessionAdapter(cwd, paths), inspector, mutations, sessionMetadata);
  sessions.setApprovalRules(approvalRules);
  sessions.setWorkspace({
    status: () => collectStatus(cwd, nodeExec),
    diff: (path) => buildDiff(cwd, path, nodeExec)
  });
  return sessions;
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
  const sessions = createHostSessionService(cwd, paths);
  const agents = args.includes("--fixture")
    ? new FixtureAgentService((event) => sessions.emit(event))
    : new AgentService({
      runtimePath: optionValue(args, "--runtime") ?? defaultRuntimePath(process.execPath),
      cwd,
      sessionDir: paths.desktopSessionsDir,
      onDiagnostic: (message) => process.stderr.write(`${message}\n`),
      ruleBook: approvalRules
    });
  sessions.setAgentService(agents);
  await serveLocalHost(process.stdin, {
    write: (bytes) => process.stdout.write(Buffer.from(bytes))
  }, sessions);
  if (agents instanceof AgentService) await agents.stopAll();
}

const isCompiledHost = process.execPath.toLowerCase().endsWith("omp-desktop-host.exe");

if (import.meta.main || isCompiledHost) {
  void runHost().catch(() => {
    process.stderr.write("HOST_STARTUP_ERROR\n");
    process.exitCode = 1;
  });
}
