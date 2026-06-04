import { test, expect } from '@playwright/test';

// Stage 0 stress fixture: a `test.describe` block containing ZERO `test()`
// calls. This file has no executable test cases — every `describe` is empty.
// Task intent: REJECT (no real test markers).
// Current behaviour: PASS — Stage 0's marker regex
//   \b(test|it|describe|@Test|def test_|cy\.|page\.)\b
// matches the words `test` AND `describe` inside `test.describe(...)`, so
// the gate sees them as test markers even though no test() call exists.
// This is a known FIXME paralleling `test-markers-in-comments-only.spec.ts`
// — both surface a Stage 0 gap where marker presence is detected lexically
// without confirming an actual test() invocation.

test.describe('Acme Shop search', () => {
  // body intentionally empty: no test() calls live in this describe block
});

test.describe('Acme Shop checkout', () => {
  // body intentionally empty
});

test.describe('Acme Shop profile', () => {
  // body intentionally empty
});

// Unused exports to push file size well above the 200B floor and keep
// real Playwright imports anchored. Stage 0 cares about bytes, encoding,
// markers and token budget — not about whether any test will actually run.
export const RESOURCES = ['cart', 'orders', 'wishlist', 'profile', 'addresses'];
export const FLAGS = { promoBanner: true, holidayTheme: false, betaCheckout: true };
export function fakeHelper(): boolean {
  return expect !== undefined;
}
