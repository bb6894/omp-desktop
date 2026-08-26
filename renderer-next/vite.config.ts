import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The renderer imports shared contract types from ../protocol (single
  // source of truth owned next to the Desktop Host); the dev server must be
  // allowed to serve that directory. Production builds have no such limit.
  server: {
    fs: { allow: [".."] }
  }
});
