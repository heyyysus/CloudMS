import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Report-only: no thresholds, so coverage can never fail the build.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/routes/testHelpers.ts",
        "src/db/seed.ts",
        "src/db/migrations/**",
        "src/scripts/**",
        "src/index.ts",
        "src/types/**",
      ],
    },
  },
})
