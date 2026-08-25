import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests cover the pure logic and nothing else — the date walk, the money arithmetic,
 * the totals. Everything that talks to Supabase is one query and a `??  []`, and a
 * test of that only ever asserts that a mock was called.
 *
 * The clock is pinned to Europe/Belgrade for the same reason `next.config.ts` pins it:
 * "today" is decided server-side, and a CI runner in UTC would answer a different
 * question from the one the app asks.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
