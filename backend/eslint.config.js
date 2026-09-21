// @ts-check
const eslint = require("@eslint/js")
const tseslint = require("typescript-eslint")
const eslintConfigPrettier = require("eslint-config-prettier")
const globals = require("globals")

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/**", "coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db", "**/db/index", "**/db/pools"],
              importNames: ["adminDb"],
              message:
                "adminDb bypasses row-level security. Use db; owner-side code lives in db/, jobs/, and the seed.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/db/**", "src/jobs/**", "src/routes/testHelpers.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  }
)
