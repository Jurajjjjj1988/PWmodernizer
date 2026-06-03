/**
 * ESLint config for PWmodernizer-generated outputs.
 *
 * Targets ONLY `outputs/tests/**` — generated test code that needs the
 * full Playwright anti-pattern ruleset enforced as a post-LLM gate.
 *
 * eslint-plugin-playwright covers 59 rules with autofix for many. Per
 * Agent 3 research (arxiv:2410.10628), post-processing detectors are
 * MORE effective than prompt engineering for test smells like Magic
 * Number Test (99.85% prevalence in GPT-3.5 unit tests).
 */

module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/',
    'inputs/', // Source code being migrated — not our style.
    'examples/', // Curated reference files.
    'scripts/', // Pipeline tooling, separate ruleset.
    '*.config.js',
    '*.config.ts',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./outputs/tests/tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'playwright'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:playwright/recommended',
  ],
  rules: {
    // Hard fails — see config/migration-rules.md §8.
    'playwright/no-wait-for-timeout': 'error',
    'playwright/no-force-option': 'error',
    'playwright/no-page-pause': 'error',
    'playwright/no-skipped-test': 'error',
    'playwright/no-focused-test': 'error',
    'playwright/no-conditional-in-test': 'error',
    'playwright/no-conditional-expect': 'error',
    'playwright/no-element-handle': 'error',
    'playwright/no-eval': 'error',
    'playwright/no-useless-await': 'error',
    'playwright/no-useless-not': 'error',
    'playwright/missing-playwright-await': 'error',
    'playwright/prefer-web-first-assertions': 'error',
    'playwright/expect-expect': 'error',
    'playwright/valid-expect': 'error',
    'playwright/no-networkidle': 'error',
    'playwright/no-restricted-matchers': [
      'error',
      {
        toBeFalsy: 'Use a specific matcher (toBeHidden, toHaveCount(0), etc.)',
        toBeTruthy: 'Use a specific matcher (toBeVisible, toHaveCount, etc.)',
      },
    ],

    // TypeScript strictness.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // Code hygiene.
    'no-console': 'error',
    'no-debugger': 'error',
    'prefer-const': 'error',
  },
  overrides: [
    {
      // Pipeline scripts use console.log to communicate with workflow runner.
      files: ['scripts/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
