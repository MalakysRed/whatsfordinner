import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolves the "@/*" alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    // Everything under test here is pure logic — scaling, rounding, slot quotas,
    // allergen matching. No DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
