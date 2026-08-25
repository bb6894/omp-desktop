import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Branch-only scaffold allowance (plan §Frozen vectors): the renderer may load
      // the host-owned frozen vectors file at dev/build time. Dies at plan-4 cutover.
      "@fixture-vectors": resolve(here, "../apps/desktop-host/tests/fixtures/task-projection-vectors.ts"),
      "@omp/product-contracts": resolve(here, "../apps/desktop-host/src/product-contracts.ts")
    }
  },
  server: {
    fs: {
      // Dev/preview may serve the host tree for the two allowlisted files only.
      allow: [".."]
    }
  }
});
