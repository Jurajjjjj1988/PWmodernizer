// ESLint 9+ flat config. Targets only generated tests under outputs/tests/.
// Inputs/ and examples/ are NOT linted (they're intentionally bad / archival).
// eslint-plugin-playwright enforces web-first assertions + forbids smells
// (no-wait-for-timeout, no-force-option, no-nth-methods, etc.).
//
// Type-aware baseline adopted from qa-master:
//   - js.configs.recommended catches no-undef, no-unreachable, no-dupe-keys etc. for free
//   - tseslint.configs.recommendedTypeChecked unlocks no-floating-promises (THE #1 silent
//     Playwright flake source: missed `await` on actions/assertions), no-misused-promises,
//     await-thenable, no-unsafe-*
//   - parserOptions.projectService wires the per-file tsconfig resolution
//   - per-file `disableTypeChecked` override keeps the config file itself + scripts/ JS lintable
//     without dragging them through type info.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default tseslint.config(
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
  // Base — js.configs.recommended catches free wins (no-undef, no-unreachable, no-dupe-keys).
  js.configs.recommended,
  {
    // Only lint the migration outputs. Inputs/examples are intentionally
    // unconformant — Claude generates the conformant version under outputs/tests/.
    files: ['outputs/tests/**/*.ts'],
    // Type-aware baseline — required for no-floating-promises etc.
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // projectService auto-resolves the nearest tsconfig.json per file. The
        // outputs/tests/tsconfig.json extends outputs/tsconfig.json which has
        // the @fixtures/@page-object/etc. path-alias map (post PR #53).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
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
      // qa-master imports — adopted 2026-06-10:
      // THE #1 silent flake source in Playwright suites. Catches every missed
      // `await` on page actions and `expect(...)` assertions — exactly what
      // type-aware linting was designed to find.
      '@typescript-eslint/no-floating-promises': 'error',
      // Fixture-only bindings (e.g. `({ authedPage: _ })`) and intentionally
      // unused params need a `_` escape hatch — matches qa-master.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
    // Config/JS files aren't part of the TS project — turn off type-aware rules
    // for them (eslint.config.js itself, any *.mjs/*.js helpers that slip through).
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
