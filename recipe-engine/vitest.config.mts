import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Self-contained Vitest config for the recipe engine.
 *
 * The root config deliberately scopes `include` to `src/**`, and the root
 * tsconfig excludes this directory — the engine is standalone and nothing in
 * the app imports it yet. Rather than widen either of those (which would mean
 * editing files outside `/recipe-engine`), the engine brings its own config:
 *
 *   pnpm vitest run --config recipe-engine/vitest.config.mts
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    // Pure logic — schema parsing and graph checks over authored data.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
