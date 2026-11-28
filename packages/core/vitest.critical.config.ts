import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/critical-flows.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/repos/**"],
  },
});
