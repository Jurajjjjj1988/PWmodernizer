// ESLint 9+ flat config. Targets only generated tests under outputs/tests/.
// Inputs/ and examples/ are NOT linted (they're intentionally bad / archival).
// eslint-plugin-playwright enforces web-first assertions + forbids smells
// (no-wait-for-timeout, no-force-option, no-nth-methods, etc.).

import playwright from 'eslint-plugin-playwright';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // Only lint the migration outputs. Inputs/examples are intentionally
    // unconformant — Claude generates the conformant version under outputs/tests/.
    files: ['outputs/tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      playwright: playwright,
    },
    rules: {
      // Playwright-specific anti-patterns — these mirror config/knowledge-base.md
      // forbidden patterns. autofix where possible, error otherwise.
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-nth-methods': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/expect-expect': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-useless-await': 'warn',
      'playwright/prefer-web-first-assertions': 'error',
      // Research-backed additions (eslint-plugin-playwright v2.x):
      'playwright/prefer-native-locators': 'error', // auto-fix locator('[role="..."]') → getByRole(...)
      'playwright/no-raw-locators': 'warn',         // discourages page.locator(...) when getBy* fits
      'playwright/no-element-handle': 'error',      // blocks deprecated $() / $$()
      'playwright/no-eval': 'error',                // blocks page.$eval / page.$$eval
      'playwright/no-networkidle': 'error',         // blocks waitForLoadState('networkidle')
      'playwright/no-wait-for-selector': 'error',   // anti-flake, prefer web-first assertion
      'playwright/no-wait-for-navigation': 'error', // anti-flake
      'playwright/no-unsafe-references': 'error',   // catches closures in page.evaluate (Selenium migrant bug)
      'playwright/valid-expect-in-promise': 'error', // forgotten await inside promise chain
      'playwright/require-top-level-describe': 'warn',
      'playwright/max-nested-describe': ['error', { max: 2 }], // mirrors migration-rules §2 max 2 describe levels
      // TypeScript anti-patterns — generate.md hard rules forbid `any` and `as unknown as`.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      // qa-master v0.2.0 architecture rules — first-class ESLint enforcement so
      // the validate step catches violations BEFORE the conformance gate, giving
      // Sonnet's fix-lint-errors retry a clear actionable error.
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@playwright/test',
          message: 'KB qa-master/architecture/import-source: specs must import test+expect from @fixtures/base.fixture (the single spec-layer source).',
        }],
      }],
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.object.name='page'][callee.property.name='goto']",
        message: 'KB qa-master/architecture/page-goto-in-spec: navigation lives on the Page (pageObject.open()) — specs must not call page.goto().',
      }],
    },
  },
  {
    // Legacy v0.1.x specs from before the qa-master rewrite. Exempt from the
    // v0.2.0 import / page.goto discipline — they predate the architecture and
    // are not under active maintenance. New migrations land in the qa-master
    // shape and these rules apply to them.
    files: [
      'outputs/tests/add-cookies-jupiter-test.spec.ts',
      'outputs/tests/explicit-wait-jupiter-test.spec.ts',
      'outputs/tests/fluent-wait-jupiter.spec.ts',
      'outputs/tests/using_selenium_tests.spec.ts',
      'outputs/tests/playwright.config.ts', // the config file itself needs @playwright/test
    ],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Ignore everything else.
    ignores: [
      'node_modules/**',
      'inputs/**',
      'examples/**',
      'outputs/plans/**',
      'outputs/reports/**',
      'outputs/helper/**', // helpers can legitimately import @playwright/test (expect, types)
      'scripts/**',
      '**/*.d.ts',
    ],
  },
];
