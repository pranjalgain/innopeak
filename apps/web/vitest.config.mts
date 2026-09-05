import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/e2e/**", // Exclude Playwright E2E tests
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      env: path.resolve(import.meta.dirname, "./env.ts"),
    },
  },
});
