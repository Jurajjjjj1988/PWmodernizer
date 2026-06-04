// FIXME (known gap): Stage 0's marker regex \b(test|it|describe|@Test|...)
// does NOT strip comments before matching. This file contains test markers
// ONLY inside block comments, with no live executable test code. It will
// PASS the marker gate today even though Claude has nothing real to migrate.
// Tracked as a follow-up: improve Stage 0 to AST-aware comment stripping.

/*
 * Example of a Playwright spec that USED to live here:
 *
 *   test('happy path', async ({ page }) => {
 *     await page.goto('https://shop.example.test/');
 *   });
 *
 *   describe('search', () => {
 *     it('returns results', () => { });
 *   });
 *
 * The block above is preserved as historical documentation. The actual
 * file contents are utility helpers only — there are no live tests.
 */

export function buildSearchQuery(term: string, locale: string): string {
  return `${locale}/q?term=${encodeURIComponent(term)}`;
}

export function normalizePrice(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(',', '.');
  return Number.parseFloat(cleaned);
}

export const DEFAULT_LOCALE = 'en-US';
export const SUPPORTED_LOCALES = ['en-US', 'sk-SK', 'de-DE', 'ja-JP'] as const;
