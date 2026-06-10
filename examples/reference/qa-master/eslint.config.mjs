import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default tseslint.config(
    { ignores: ['node_modules', 'playwright-report', 'test-results', 'dist', '.auth'] },
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
        },
        rules: {
            // Playwright's most important guard — catches missing awaits on assertions/actions.
            '@typescript-eslint/no-floating-promises': 'error',
            // Allow `_`-prefixed bindings (e.g. a fixture named only to trigger its setup).
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
        }
    },
    {
        files: ['tests/**/*.spec.ts'],
        ...playwright.configs['flat/recommended']
    },
    {
        // Config/JS files aren't part of the TS project — turn off type-aware rules for them.
        files: ['**/*.mjs', '**/*.js'],
        ...tseslint.configs.disableTypeChecked
    }
);
