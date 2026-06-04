# Public SUT catalog for DOM grounding (Phase 7c calibration)

> Curated list of free, publicly accessible demo websites that we can point `scripts/dom-ground.ts --mode live` at for Phase 7c calibration fixtures. Phase 1-7b shipped against mock URLs (`mock://always-resolve`, etc.); the live driver works (`chromium.launch`) but we have no real targets to calibrate against. This catalog unblocks that.

## 1. Why this catalog

Phase 7c of the DOM grounding work (see [`playwright-mcp-integration.md`](playwright-mcp-integration.md) §0) is blocked on a chicken-and-egg problem: we cannot prove the live probe driver classifies locators correctly without pointing it at a known DOM, and we cannot pick a known DOM without first surveying which public sites are stable enough to depend on.

This document removes that block. It enumerates a handful of long-lived public Playwright demo SUTs, the role-based locators we know resolve uniquely (or fail predictably) on each, and the file layout for wiring them as `dom-ground` live-mode calibration fixtures.

Secondary use: the catalog doubles as an onboarding aide. A new contributor reading the migration patterns in [`../config/knowledge-base.md`](../config/knowledge-base.md) can try them against the SUTs here before touching real customer tests.

## 2. Selection criteria

A site qualifies for this catalog if and only if it meets every bullet:

- **Free.** No paid auth, no signup-with-credit-card, no rate-limit-bypass purchase.
- **Stable URL.** The domain has been live for at least 3 years and is unlikely to vanish in the next 12 months. Sauce Labs and Parasoft are the canonical examples — both have been around for the better part of a decade.
- **Accessible names on key elements.** We probe via `getByRole`/`getByLabel`. A site that only has CSS-class-named buttons is useless to us.
- **TOS does not forbid automated traffic.** The whole point of these sites is to be hit by test bots. Still, we audit each entry for an explicit "no scraping" clause; none of the 6 sites below have one as of 2026-06-04.
- **At least one canonical interaction.** Login form, product list, or contact form — something representative of what real test migrations target.

Sites that did NOT make the cut and why:
- `the-internet.herokuapp.com` — covers many scenarios but the Heroku free-tier sleeps, leading to cold-start latency that distorts probe timing. Useful for local exploration, not for calibration.
- Banking demos behind a tutorial-only landing page where the actual app is iframed in.

## 3. The catalog

### 3.1 SauceDemo — `https://www.saucedemo.com/`

**What's there.** Saucelabs' official demo storefront. A login page (`standard_user` / `secret_sauce`), an inventory grid of 6 fake products, a cart, and a 4-step checkout.

**Stable role-based locators:**

```ts
page.getByPlaceholder('Username')
page.getByPlaceholder('Password')
page.getByRole('button', { name: 'Login' })
page.locator('[data-test="inventory-item"]')               // 6 matches on /inventory.html
page.getByRole('button', { name: 'Add to cart' })          // 6 matches on /inventory.html (ambiguous on purpose)
page.locator('[data-test="shopping-cart-link"]')
page.getByRole('button', { name: 'Checkout' })             // unique on /cart.html
page.getByText('Sauce Labs Backpack')                      // unique product name
```

**Caveats.** None of consequence. The DOM has been stable for years and the team explicitly markets the site as a Playwright/Selenium training target.

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-01-saucedemo-login-button` | `https://www.saucedemo.com/` | `page.getByRole('button', { name: 'Login' })` | `resolved-unique` |
| `good-02-saucedemo-username-placeholder` | `https://www.saucedemo.com/` | `page.getByPlaceholder('Username')` | `resolved-unique` |
| `bad-01-saucedemo-bogus-button` | `https://www.saucedemo.com/` | `page.getByRole('button', { name: 'No Such Button' })` | `not-found` |
| `bad-02-saucedemo-ambiguous-add-to-cart` | `https://www.saucedemo.com/inventory.html` (post-login) | `page.getByRole('button', { name: 'Add to cart' })` | `resolved-multiple` (6) — note this requires session, defer until auth wiring |

### 3.2 Automation Exercise — `https://automationexercise.com/`

**What's there.** Full-fat e-commerce flow: signup, login, product browse, cart, checkout, contact form, test cases listing page. The site is purpose-built for test automation training.

**Stable role-based locators:**

```ts
page.getByRole('link', { name: ' Home' })
page.getByRole('link', { name: ' Products' })
page.getByRole('link', { name: ' Signup / Login' })
page.getByRole('link', { name: ' Contact us' })
page.getByPlaceholder('Name')                              // on /contact_us
page.getByPlaceholder('Email')                             // on /contact_us
page.getByPlaceholder('Subject')
page.getByRole('button', { name: 'Submit' })               // on /contact_us
```

**Caveats.** Page can be slow (~2s navigation) due to ad scripts. The leading-space in nav link names is intentional (icon glyph + space + label). Test cases page (`/test_cases`) is itself documentation we can mine for additional fixture ideas.

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-03-autoex-contact-name` | `https://automationexercise.com/contact_us` | `page.getByPlaceholder('Name')` | `resolved-unique` |
| `good-04-autoex-signup-link` | `https://automationexercise.com/` | `page.getByRole('link', { name: ' Signup / Login' })` | `resolved-unique` |
| `bad-03-autoex-bogus-link` | `https://automationexercise.com/` | `page.getByRole('link', { name: 'Imaginary Page' })` | `not-found` |

### 3.3 Conduit (Bondar Academy fork) — `https://conduit.bondaracademy.com/`

**What's there.** The RealWorld "Conduit" app (Medium clone) — Angular SPA, has been the lingua-franca demo across frameworks for 5+ years. Sign-up, login, article list, article detail, follow user, favorite article.

**Stable role-based locators:**

```ts
page.getByRole('link', { name: 'Sign in' })
page.getByRole('link', { name: 'Sign up' })
page.getByPlaceholder('Email')
page.getByPlaceholder('Password')
page.getByRole('button', { name: 'Sign in' })
page.getByRole('link', { name: 'Your Feed' })             // post-login
page.getByRole('link', { name: 'Global Feed' })
page.getByText('A place to share your knowledge.')        // hero subtitle
```

**Caveats.** SPA — the first paint shows a loading shell, so we must wait for `domcontentloaded` AND an idle moment. The existing `dom-ground.ts` uses `waitUntil: 'domcontentloaded'` and times out at 15s, which works for Conduit's cold start.

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-05-conduit-signin-link` | `https://conduit.bondaracademy.com/` | `page.getByRole('link', { name: 'Sign in' })` | `resolved-unique` |
| `good-06-conduit-hero-text` | `https://conduit.bondaracademy.com/` | `page.getByText('A place to share your knowledge.')` | `resolved-unique` |
| `bad-04-conduit-bogus-button` | `https://conduit.bondaracademy.com/` | `page.getByRole('button', { name: 'Publish Article' })` | `not-found` (logged-out) |

### 3.4 Practice Test Automation — `https://practicetestautomation.com/practice-test-login/`

**What's there.** A purpose-built login form fixture page (one of several pages on the practice site). Stable IDs, valid + invalid credential paths documented inline.

**Stable role-based locators:**

```ts
page.getByLabel('Username')
page.getByLabel('Password')
page.getByRole('button', { name: 'Submit' })
page.getByRole('heading', { name: 'Test login' })
page.getByText('Your username is invalid!')               // error path; only after bad submit
```

**Caveats.** WordPress-hosted, so very occasional 503 during high traffic. The login form is iframe-free (good for us). For probing without submitting, only locators 1-4 are usable — the error-message locator only resolves after an actual interaction, which calibration mode forbids (see §6).

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-07-pta-username-label` | `https://practicetestautomation.com/practice-test-login/` | `page.getByLabel('Username')` | `resolved-unique` |
| `good-08-pta-submit-button` | `https://practicetestautomation.com/practice-test-login/` | `page.getByRole('button', { name: 'Submit' })` | `resolved-unique` |
| `bad-05-pta-bogus-label` | `https://practicetestautomation.com/practice-test-login/` | `page.getByLabel('Phone Number')` | `not-found` |

### 3.5 DemoQA — `https://demoqa.com/`

**What's there.** A grid of widget categories (Elements, Forms, Alerts, Widgets, Interactions, Book Store). Each widget has a small canonical interaction surface. We use it for breadth — coverage of `getByRole('textbox')`, `getByRole('checkbox')`, `getByRole('radio')` style probes.

**Stable role-based locators:**

```ts
page.getByText('Elements')                                 // category card
page.getByText('Forms')
page.getByRole('link', { name: 'Text Box' })              // after navigating to /elements
page.getByLabel('Full Name')                              // on /text-box
page.getByLabel('Email')
page.getByRole('button', { name: 'Submit' })
page.getByRole('checkbox')                                // on /checkbox; >1 match (parent tree)
```

**Caveats.** Page injects ad iframes that occasionally throw console errors. The accessibility tree is correct, but the layout shifts during ad load — does not affect locator resolution but does add 500-800ms before the page is settled. Add a `domcontentloaded` wait, NOT `networkidle` (ads keep the network busy forever).

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-09-demoqa-elements-card` | `https://demoqa.com/` | `page.getByText('Elements')` | `resolved-unique` |
| `bad-06-demoqa-ambiguous-checkbox` | `https://demoqa.com/checkbox` | `page.getByRole('checkbox')` | `resolved-multiple` |

### 3.6 ParaBank — `https://parabank.parasoft.com/`

**What's there.** Parasoft's banking demo. Login, account list, funds transfer, bill pay, request loan, contact form. Useful for "complex form" calibration — labels are server-rendered and stable.

**Stable role-based locators:**

```ts
page.getByLabel('Username')
page.getByLabel('Password:')                              // note trailing colon — verbatim from DOM
page.getByRole('button', { name: 'Log In' })
page.getByRole('link', { name: 'Register' })
page.getByRole('link', { name: 'Forgot login info?' })
page.getByText('Customer Login')                          // section heading on /index.htm
```

**Caveats.** Most banking-demo-flavored slowness — initial TLS handshake against the Parasoft origin can be ~1.5s. The `Password:` label literally includes the colon; `getByLabel('Password')` (no colon) does NOT resolve uniquely.

**Suggested calibration fixtures:**

| Fixture | URL | Locator | Expected verdict |
|---|---|---|---|
| `good-10-parabank-login-button` | `https://parabank.parasoft.com/` | `page.getByRole('button', { name: 'Log In' })` | `resolved-unique` |
| `bad-07-parabank-password-no-colon` | `https://parabank.parasoft.com/` | `page.getByLabel('Password')` | `not-found` (label is `Password:`) |

## 4. How to wire as Phase 7c calibration fixtures

File layout — extends the existing `dom-ground/` fixture pattern but uses `sut-url.txt` instead of `mock-url.txt` so the runner knows to launch in live mode:

```
tools/calibrate-pipeline/fixtures/dom-ground-live/
  good-01-saucedemo-login-button/
    probe.spec.ts       # page.getByRole('button', { name: 'Login' })
    sut-url.txt         # https://www.saucedemo.com/
  good-02-saucedemo-username-placeholder/
    probe.spec.ts
    sut-url.txt
  bad-01-saucedemo-bogus-button/
    probe.spec.ts       # page.getByRole('button', { name: 'No Such Button' })
    sut-url.txt         # https://www.saucedemo.com/
  ...
```

Runner extension — add a sibling to the existing `runDomGround` function in `tools/calibrate-pipeline/run-calibration.ts`:

```ts
function runDomGroundLive(fixtureName: string): FixtureResult {
  const fixtureDir = join(FIXTURES_ROOT, "dom-ground-live", fixtureName);
  const probe = join(fixtureDir, "probe.spec.ts");
  const urlFile = join(fixtureDir, "sut-url.txt");
  const url = readFileSync(urlFile, "utf8").trim();
  const tmpReport = join(tmpdir(), `dom-ground-live-${fixtureName}.json`);
  const r = spawnSync("npx", [
    "tsx", join(SCRIPTS_DIR, "dom-ground.ts"),
    "--url", url,
    "--probe", probe,
    "--report", tmpReport,
    "--mode", "live",
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  return buildResult(fixtureName, r, parseGolden(goldenPath("dom-ground-live", fixtureName)));
}
```

Wire it into the `FIXTURE_RUNNERS` map under a new validator key `"dom-ground-live"`, add the key to `VALIDATORS`, and the rest of the calibration machinery picks it up automatically.

The new npm script (NOT added to `smoke`):

```json
"check:dom-ground:live": "tsx tools/calibrate-pipeline/run-calibration.ts --validator dom-ground-live"
```

## 5. CI vs local

These live calibrations are NOT in `npm run smoke`. Reasoning:

- **Network dependency.** A 503 on saucedemo.com would red-X every PR. The whole point of the catalog is to enable calibration; calibration is a SDET activity, not a per-commit gate.
- **Slowness.** Live probe is 1-3s per fixture (chromium launch + nav + locator resolution). 13 fixtures across 6 sites = ~20-40s wall-clock. Cheap on demand, expensive per CI run.
- **Rate-limit risk.** Hammering saucedemo.com on every push is poor citizenship (see §6).

Recommended cadences:

| Trigger | Command | Frequency |
|---|---|---|
| Manual SDET sanity check | `npm run check:dom-ground:live` | Before claiming Phase 7c done |
| Weekly drift detection | scheduled GHA workflow (optional) | Once per week — flag if a site changed its DOM |
| Per-PR | NEVER for live mode | Mock mode (`npm run check:dom-ground`) is enough |

## 6. Etiquette — be a good citizen

Public demo sites are gifts from the maintainers. We do not abuse them. Hard rules:

- **One probe per fixture, no loops.** Each fixture exercises ONE locator. No "probe 50 selectors" mega-fixtures.
- **No form submission.** `dom-ground` is read-only by contract (see [`playwright-mcp-integration.md`](playwright-mcp-integration.md) §8 "State pollution"). Even if a fixture wants to verify a post-login locator, the calibration MUST NOT click Submit — instead, defer it to a later phase that wires `storageState`.
- **No screenshot dumps to public storage.** Reports stay in `outputs/reports/` and never get pushed to the SUT.
- **Cache where it's free.** A single calibration run hits each URL at most twice (probe + verify-output-shape). Reuse the chromium instance across fixtures on the same origin via a shared `browser.newContext()` if/when we extend the runner.
- **Identify ourselves.** A custom user-agent lets the SUT operator block us if we ever become a problem. See §7 for the implementation hook.

## 7. Etiquette enforcement code (sketch — DO NOT IMPLEMENT YET)

The following additions to `scripts/dom-ground.ts` would enforce the §6 rules in code. Sketch only — not part of this catalog's scope.

```ts
// Constants
const PWMODERNIZER_UA = "PWmodernizer-dom-ground/0.0.1 (+https://github.com/Jurajjjjj1988/PWmodernizer)";
const INTER_FIXTURE_SLEEP_MS = 500;
const MAX_LIVE_FIXTURES_PER_RUN = 25;

// In liveProbe, change the context creation:
const context = await browser.newContext({ userAgent: PWMODERNIZER_UA });
const page = await context.newPage();

// In the calibration runner, between fixtures:
await new Promise((r) => setTimeout(r, INTER_FIXTURE_SLEEP_MS));

// Pre-flight cap:
if (fixtures.length > MAX_LIVE_FIXTURES_PER_RUN) {
  throw new Error(
    `live dom-ground calibration capped at ${MAX_LIVE_FIXTURES_PER_RUN} fixtures per run ` +
      `(found ${fixtures.length}). Split into multiple invocations or raise the cap deliberately.`,
  );
}
```

The `500ms` sleep is conservative — saucedemo.com handles parallel test runners daily and would not notice an extra half-second between probes — but the cost is negligible vs. the goodwill saved.

## 8. References + further reading

- [`playwright-mcp-integration.md`](playwright-mcp-integration.md) — parent design brief; this catalog feeds its Phase 7c.
- [`troubleshooting.md`](troubleshooting.md) — symptom catalog. The "DOM grounding step is `skipped` even though `MIGRATION_TARGET_URL` is set" entry covers the live-mode env-binding gotcha; a `live-mode 503` symptom will get appended once we have a real failure to document.
- Microsoft Playwright — [Locators guide](https://playwright.dev/docs/locators) and [`getByRole` resolution rules](https://playwright.dev/docs/api/class-page#page-get-by-role).
- DavidMello — [Test automation practice sites list](https://davidmello.com/), the source of several entries in this catalog.
- [SauceDemo](https://www.saucedemo.com/) — Saucelabs' official Playwright/Selenium training SUT.
- [RealWorld example apps](https://github.com/gothinkster/realworld) — the upstream of the Conduit demo we point at.

---

**Next step:** once the catalog above is reviewed and approved, follow §4 to land the actual `tools/calibrate-pipeline/fixtures/dom-ground-live/` corpus + the runner extension in a separate PR. Until then, mock-mode calibration in `npm run smoke` remains the only `dom-ground` gate.
