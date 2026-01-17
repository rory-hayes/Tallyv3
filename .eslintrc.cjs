module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: [
    "node_modules",
    ".next",
    "dist",
    "coverage",
    "catalyst-ui-kit"
  ],
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      extends: ["next/core-web-vitals"],
      rules: {
        "@next/next/no-html-link-for-pages": "off"
      }
    }
  ]
};
