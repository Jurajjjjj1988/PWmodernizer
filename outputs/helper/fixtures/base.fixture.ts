import { test as base, expect } from "@playwright/test";

import { AcmeShopLoginPage } from "@page-object/pages/acme-shop-login.page";

/**
 * Single import source for `test` + `expect` in every spec.
 *
 * v0.2.0 qa-master baseline shell — checked into main so specs always have a valid
 * `@fixtures/base.fixture` to import from. Per-migration extensions add page-object fixtures
 * via `test = base.extend<{...}>({...})`; this shell stays minimal.
 *
 * The ONLY file in the repo allowed to import from `@playwright/test`. Every other spec/helper
 * imports `test` + `expect` from here. `validate-qa-master-conformance.ts` enforces this.
 */

type Fixtures = {
  acmeShopLoginPage: AcmeShopLoginPage;
};

const test = base.extend<Fixtures>({
  acmeShopLoginPage: async ({ page }, use) => use(new AcmeShopLoginPage(page)),
});

export { test, expect };
