import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Co-locate tests alongside source files: *.test.ts, *.test.tsx
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
    environment: "node",
    globals: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        // isolate: true — each test FILE gets a fresh module registry.
        // Router-layer tests (src/server/routers/__tests__) mock @/lib/db
        // per-file via vi.mock factories; without isolation those mocks
        // (and their mockResolvedValue state) leak across files and cause
        // order-dependent flakiness/unhandled rejections. Suite is ~3s, so
        // the isolation overhead is negligible.
        isolate: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**", "src/server/utils/**"],
      exclude: ["**/*.test.*", "**/*.config.*"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
