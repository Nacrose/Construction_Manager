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
        isolate: false,
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
