import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHostSessionService } from "../src/index";
import { resolveProfilePaths } from "../src/profile-paths";

test("composes the host session service with the read-only harness store", async () => {
  const root = mkdtempSync(join(tmpdir(), "omp-desktop-host-composition-test-"));
  const project = join(root, "repo");
  const service = createHostSessionService(project, resolveProfilePaths(project, join(root, "profile")));

  await expect(service.dispatch({ type: "harness.inspect", requestId: "inspect" })).resolves.toMatchObject({
    ok: true,
    value: {
      readOnly: true,
      source: "harness-store",
      state: { projectPath: project }
    }
  });
});
