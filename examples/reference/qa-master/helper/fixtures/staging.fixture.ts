import { test as base, expect } from '@fixtures/base.fixture';

/**
 * For staging-only specs: auto-skips when running against production (IS_PRODUCTION=true),
 * so the test file needs no manual `test.skip`.
 */
export const test = base;

test.beforeEach(() => {
    test.skip(process.env.IS_PRODUCTION === 'true', 'Staging-only test skipped on production');
});

export { expect };
