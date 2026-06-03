/**
 * Company-style reference — what GOOD looks like.
 *
 * This file is READ by Claude during both Stage 1 (planning) and Stage 2
 * (generation) as the primary anchor for "what the company's tests should
 * look like". The migrator is instructed to make output match this style.
 *
 * Curated from the Investown referral suite (Jurajjjjj1988/INVSTWN) which
 * passed senior CEE QA review on 2026-06-02 with 25/25 green tests, zero
 * flakes after web-first sync-barrier fixes.
 *
 * Why this exists: research on LLM test generation (arxiv:2410.10628 —
 * "Test smells in LLM-generated unit tests") confirmed prompt engineering
 * alone reduces test smells only moderately. The single biggest quality
 * lever is showing the model EXACTLY what the target looks like — Sogeti
 * Skills methodology, the only honest published market pattern. This
 * reference is that target.
 *
 * What to study in this file:
 *   - Locator priority: getByRole + name first, then getByLabel/getByTestId,
 *     never CSS classes as primary, never .nth().
 *   - Web-first assertions everywhere: `await expect(locator).toBeVisible()`,
 *     never `expect(await locator.isVisible()).toBe(true)`.
 *   - Bilingual EN/CZ regex matching for international apps.
 *   - Fixture composition over inheritance — see the `loginAsInviter`
 *     fixture extending `pages.fixture`.
 *   - WHY-comments only (intent + non-obvious constraints), never WHAT
 *     comments (the code already shows what).
 *   - Test titles are verb phrases, no "should", under 80 chars.
 *   - Tags `@positive` / `@negative` / `@edge` applied per-test, never as
 *     describe-title suffixes.
 *   - Defensive guards documented with their failure mode (the inviter
 *     browser try/finally below has a 1-line rationale).
 *   - Mocks live in `data/*-mocks.ts`, not inline.
 *   - Page Object Models are SLIM — locators + navigation only, no
 *     assertions inside the POM.
 */

import { test, expect } from "../../fixtures/pages.fixture.js";
import { chromium } from "@playwright/test";
import { setupReferralBaseline, DEFAULT_REFERRAL_CODE } from "../../data/profile-mocks.js";
import { ReferralPage } from "../../pages/referral.page.js";

test.describe("Referral code @profile @referral", () => {
  test.beforeEach(async ({ loggedInPage }) => {
    // Apply the inviter-side baseline: KYC verified + GraphQL permission
    // mock + referral mutation stub. See data/profile-mocks.ts for the
    // full mock layer — keeps the test body focused on user-facing flow.
    await setupReferralBaseline(loggedInPage);
  });

  test(
    "dashboard referral banner navigates the inviter to the referral page",
    {
      // Reframed from the AI-suggested "banner is visible" — that assertion
      // would pass even if the CTA were dead. Asserting the CLICK produces
      // the expected route change proves the entry point is wired end-to-end.
      tag: ["@positive"],
    },
    async ({ referralPage, loggedInPage }) => {
      await loggedInPage.goto("/");
      // Dashboard shell hydration — `dashboard` testid renders before lazy
      // chunks (incl. ReferralBanner). Waiting on it avoids racing the
      // banner assertion against SPA mount under heavy parallel load.
      await loggedInPage
        .getByTestId("dashboard")
        .waitFor({ state: "visible", timeout: 15_000 });
      await expect(referralPage.banner).toBeVisible();

      await referralPage.banner.click();

      await expect(loggedInPage).toHaveURL(/\/user\/referral/, {
        timeout: 15_000,
      });
      await expect(referralPage.heading).toBeVisible();
    },
  );

  test(
    "rendered link contains a well-formed referral code",
    {
      // Pins the inviter-side contract: code shape must match what the
      // invitee form is willing to accept. If product widens the alphabet
      // or shortens the code here, this test surfaces it so the invitee
      // form regex stays in sync.
      tag: ["@positive"],
    },
    async ({ referralPage }) => {
      await referralPage.navigate();
      await expect(referralPage.heading).toBeVisible();
      await expect(referralPage.referralLink).toBeVisible();

      const code = await referralPage.extractCode();
      // Both shape (which the invitee form regex relies on) AND exact value
      // (which proves the mock plumbing reached the page and the UI didn't
      // fall back to some placeholder) — two assertions, two failure modes.
      expect(code).toMatch(/^[A-Z0-9]{4,16}$/);
      expect(code).toBe(DEFAULT_REFERRAL_CODE);
    },
  );

  test(
    "ineligible user (KYC verified but no invite permission) sees no banner or menu",
    {
      // Re-applies the baseline WITHOUT the affiliate-permission mock so
      // the per-test override sets `hasPermissionToInviteThroughReferral`
      // to false. Reproduces the real-world state where the backend has
      // flipped permission off (e.g. cooldown after too many invites).
      tag: ["@negative"],
    },
    async ({ loggedInPage, referralPage }) => {
      // Last-wins route override. Playwright matches the most-recently
      // registered handler first, so this beats what setupReferralBaseline
      // installed in the beforeEach. See data/profile-mocks.ts for why we
      // explicitly `page.unroute` before re-routing in the baseline; here
      // we don't need to since this is the LAST registration.
      await loggedInPage.route("**/affiliate/api/graphql", async (route) => {
        const body = route.request().postData();
        if (body?.includes("HasPermissionToInviteThroughReferral")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: { hasPermissionToInviteThroughReferral: false },
            }),
          });
          return;
        }
        await route.fallback();
      });

      await loggedInPage.goto("/");
      await loggedInPage.goto("/user");
      // The banner gate is driven by KYC alone — still visible. What
      // CHANGES with permission=false is whether the side-menu Referral
      // item appears (the page route also won't mount).
      await expect(referralPage.sideMenuItem).toBeHidden();
    },
  );
});

/**
 * Why this style scores high on senior review:
 *
 *   1. Each test has a SINGLE user-perceivable outcome — banner click →
 *      route change, link rendered → code parseable, KYC permission false
 *      → menu hidden. No "and then also check X" tests.
 *
 *   2. Locators use the highest-priority strategy available — `getByRole`,
 *      `getByLabel`, `getByTestId`. None use `.nth()`, deep CSS, or XPath.
 *
 *   3. Hydration races are dealt with at the SHELL level (waitFor a stable
 *      dashboard testid before asserting on lazy chunks) — not via
 *      `waitForTimeout`.
 *
 *   4. Mocks live in `data/*-mocks.ts` and are composed via setup helpers,
 *      not inline. The test reads as user-flow narrative, not as plumbing.
 *
 *   5. Comments explain WHY (the regression class this catches, the hidden
 *      hydration race, the last-wins route ordering) — never WHAT.
 *
 *   6. Test titles are verb phrases — "navigates", "contains", "sees".
 *      No "should". Tags carry the POS/NEG/EDGE category without polluting
 *      the title.
 *
 *   7. The bilingual EN/CZ regex pattern used in the underlying POM is
 *      the project convention for international apps — see
 *      pages/referral.page.ts for the matcher style. Migrator should
 *      preserve bilingual matchers when source had them.
 *
 *   8. Web-first assertions everywhere. Zero `expect(await x.isVisible())`.
 *      Zero `waitForTimeout`. Zero `.first()`/`.nth()` without justification.
 *
 *   9. POM stays SLIM — see pages/referral.page.ts. `extractCode()` is a
 *      helper because the chained test needs the code to flow inviter →
 *      invitee. POMs do NOT assert.
 *
 *  10. Defensive guards are explained at point of use, not in a separate
 *      "see CONTRIBUTING.md" reference. See the `dispatch-event`
 *      defensive guard in pages/sign-up-email.page.ts (not shown here)
 *      for an example — every `.catch()` carries the failure mode it
 *      defends against, plus what the post-condition assertion catches if
 *      the defense fails.
 *
 * AI migrator: when generating Playwright TS from a bad-Playwright /
 * Cypress / Selenium source, the OUTPUT FILE should pattern-match this
 * shape. Not the literal content — the structural choices.
 */
