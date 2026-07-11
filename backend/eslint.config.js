// @ts-check
const eslint = require("@eslint/js")
const tseslint = require("typescript-eslint")
const eslintConfigPrettier = require("eslint-config-prettier")
const globals = require("globals")

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/**"],
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
  }
)
