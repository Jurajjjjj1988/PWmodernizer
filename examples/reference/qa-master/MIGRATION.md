# Migration: `playwright-ui-tests` → `qa-master`

Tracks the port of the legacy suite (**761 spec files**, 54 locator files, 88 action files) into
the layered architecture in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Layer mapping (old → new)

| Legacy (`playwright-ui-tests`) | New (`qa-master`) |
|---|---|
| `lib/locators/*.locators.ts` (separate locator classes) | locators become `readonly` **fields inside** the page/block object in `helper/page-object/{pages,blocks}/` |
| `lib/page_actions/*.actions.ts` (action classes) | methods **on** the page object (single-page) |
| `lib/page_actions/basepage.ts` | `helper/page-object/basepage.ts` (+ new `baseblock.ts`) |
| `lib/workflows/*.ts` (cross-page flows) | `helper/actions/*.ts` |
| `lib/helpers/api_helpers/*` | `helper/api/*.api.ts` (data prep) |
| `lib/helpers/feature_helpers/browser/*` | `helper/browser/*` |
| `lib/helpers/feature_helpers/toolbox/logger.ts` | `helper/utilities/logger.ts` |
| `lib/utils/*` (pure) | `helper/utilities/*` |
| `lib/test_data/*` | `helper/test-data/*` |
| `lib/types/*` | `helper/types/{external,internal}/*` |
| `lib/fixtures/*` | `helper/fixtures/*` |
| `tests/<area>/*.spec.ts` (single dir, env in filename/tags) | `tests/{desktop,mobile,api}/<area>/*.spec.ts` (one project per surface) |

### Key transformations per file
1. **Merge locator class + action class → one page object** (constructor-free; locators as
   `readonly` fields with `.describe()`; actions become methods).
2. Replace `page.waitForLoadState('networkidle')` / `reloadUntilVisible` loops with
   `expect(...)`-based waits.
3. Repoint imports to `@fixtures/base.fixture`; register new page objects as fixtures.
4. Convert specs to `describe` + `test.step` (**action → expectation**), add annotations/tags.
5. Move data setup (login, account/cart creation, 1Password creds) into `api/` wrappers; reuse
   auth via `storageState`. Exercise each UI path once.
6. Sort each spec into `tests/desktop|mobile|api/<area>/`.

## Status

### ✅ Foundation (done)
- Repo scaffold, `package.json`, `tsconfig` (aliases), `playwright.config` (per-surface projects),
  `eslint.config` (`no-floating-promises` + playwright plugin), `.env.example`, `.gitignore`.
- `BasePage` + `BaseBlock`, `base.fixture` + `staging.fixture`, `logger`, `urls`.
- Per-layer `CLAUDE.md` docs; `ARCHITECTURE.md` copied into the repo.

### ✅ Accounts slice (done) — sign-in / sign-out
- `helper/page-object/pages/accounts.page.ts` + `order-history.page.ts` (merged from
  `accounts_portal.locators.ts` + `sign_in.actions.ts` + `order_history.actions.ts`).
- `helper/api/accounts.api.ts` — **per-test user creation** captured from the legacy signup API
  (`GET /profiles/users/sign_up` for CSRF → `POST /profiles/users`). `createTestUser` (fresh,
  logged-out) + `createAuthenticatedUser` (fresh + session cookies injected). Exposed as the
  `newUser` / `authenticatedUser` fixtures → **data isolation: every test makes its own user.**
- Migrated specs: `account.login` (newUser → UI login), `account.invalid-login`,
  `account.logout` (authenticatedUser). No shared seeded account, no shared storageState.
- **Deferred**: `account.order-history` — a fresh user has no orders; needs an order-seeding API
  before it can run isolated (legacy used a persistent seeded account). `OrderHistoryPage` is
  kept ready (used by `AccountsPage.openOrderHistory`).
- Verified: `tsc --noEmit` clean, `eslint` clean, `playwright --list` resolves 3 tests.

> **✅ Resolved via Playwright MCP discovery — all 3 specs pass against staging.** Driving the
> live app with the MCP revealed the real flow (the legacy password login is gone):
> - Staging **503s bots** without `user_type=automated` — set on the context AND the API context.
> - Sign-in is at `/profiles/users/sign_in`; **"Continue With Email" now routes to an email-code
>   (OTP) step** (`/profiles/users/login_code/entercode`) — there is no password path.
> - The **signup API authenticates directly** (`POST /profiles/users` → 302 + session cookie), so
>   authenticated tests get their session from the API — no UI login, fresh user per test.
> - **Sign Out** is `[data-testid="my-account-logout"]` inside the `<ci-accounts>` **shadow DOM**
>   (Playwright pierces it); the menu must be opened first (caret is overlaid by `<ci-cart>` →
>   force-click).
>
> Final specs (all green): `account.sign-in` (email-code routing), `account.portal` (API session
> → overview greeting), `account.logout` (open menu → sign out → back to login). `invalid-login`
> dropped (no password error path exists); `order-history` deferred (fresh user has no orders).

### ✅ Accounts portal — full status (9 specs green on staging)

| Legacy spec | Migrated → | Status |
|---|---|---|
| `account_login_pw` | `account.sign-in` (email-code routing) | ✅ green |
| `account_logout` | `account.logout` | ✅ green |
| `account_smoke` | `account.smoke` (in-account sections; fundraising excluded) | ✅ green |
| `staging_account_signup` | `account.sign-up` | ✅ green |
| `staging_account_neg_signup` | `account.sign-up-negative` | ✅ green |
| `account_uploads` | `account.uploads` | ✅ green |
| `account_delete_file` | `account.delete-upload` | ✅ green |
| `account_rename_upload_name` | `account.rename-upload` | ✅ green |
| (modern auth coverage) | `account.portal` (API-session → overview) | ✅ green |
| `account_invalid_login` | — | dropped (no password-error path on staging) |
| `account_sorting_design` | `account.sorting-design` | ✅ green (seed design via NDX) |
| `account_add_to_cart` | `account.add-to-cart` | ✅ green (seed design via NDX → cart) |
| `account_add_multi_to_cart` | `account.add-multi-to-cart` | ✅ green (seed 2 designs → cart) |
| `account_edit_design` | `account.edit-design` | ✅ green (seed design → Edit → editor) |
| `account_add_art_to_product` | `account.add-art-to-product` | ✅ green (upload art → Add to Product → NDX) |
| `account_gof` | `account.gof` | ✅ green (seed design → GOF setup → launch) |
| `account_reorder` | — | ⛔ blocked: needs a real (paid) order; also `test.skip` in legacy (QAE-3301) |
| `account_order_history` | — | ⛔ blocked: needs a real (paid) order (GraphQL `me.orders`); requires the checkout+payment flow |

**15 of 17 account-portal specs migrated and green on staging** (full suite green at workers=4).
The remaining 2 (`order_history`, `reorder`) need a **completed paid order** — the full checkout
area, fully discovered via MCP:
1. NDX quote: open a design → **Get Price** → enter **postal code** → enter **quantities by
   size** → Get Price (a 0-qty design can't be ordered — "Proceed to Checkout" stays disabled).
2. Add to cart (now with items) → cart → **Proceed to Checkout** (`[data-testid="order-submit"]`).
3. Contact info → Continue to Shipping → shipping **address** → Continue to Payment.
4. **Credit-card payment** (test visa `4111 1111 1111 1111`, exp `10/29`, cvv `111`) → Place Order.
5. Order-placed receipt (external order id) → the order appears in `me.orders` (Order History);
   `reorder` then reorders it.

This places a **real order on staging each run** and drives the **payment iframe** — a sizeable,
side-effectful checkout-area task (and `reorder` is `test.skip` in legacy, QAE-3301).

**Checkout build attempted — additional findings (MCP):**
- NDX quote works and is automatable: `Get Price` → postal code (`quote-widget-zip-continue`) →
  per-size quantity inputs (`#sizeInputM` etc.) → `qw-btn` → priced summary.
- **Saving the quoted design carries its quantities**: after saving, "Add to Cart" from My
  Designs lands a cart with real items (verified: `Subtotal (12 items)`).
- **But "Proceed to Checkout" (`[data-testid="order-submit"]`) stays disabled for a *blank*
  design** — CustomInk requires actual artwork to order (note the separate "quote on blank items"
  path). So an orderable seed must **add art/text in NDX first** (canvas editing), then quote +
  save + add-to-cart, *then* the 4-step checkout + payment iframe + place order.
- Net: order seeding needs NDX **artwork editing** on top of the quote flow, plus the full
  payment checkout. Heaviest + most brittle + side-effectful flow; deferred as a focused task.

Page objects to add: `NdxQuotePage` (art + zip + quantities), `CartPage`,
`CheckoutContactPage`/`ShippingPage`/`PaymentPage`, `OrderPlacedPage`; then `account.order-history`
+ `account.reorder`.

**Checkout-with-payment build attempt #2 (deep dive) — findings + scaffolding:**
- Built `NdxPage.seedOrderableDesign()` + `CartPage` (committed as scaffolding). The orderable
  seed = open `/ndx/?SK=176100&PK=176100` → **Add Text** (`ndx-text-input-field` +
  `ndx-add-text-submit-button`) → **Get Price** → postal code → per-size `#sizeInput*` → `qw-btn`
  → Save. Verified via MCP that this produces a **priced, non-blank** design that lands real cart
  items (e.g. `Subtotal (24 items)`).
- **Cart gate identified:** "Proceed to Checkout" (`order-submit`) is disabled while ANY cart item
  has 0 quantity (a "How Many Do You Need?" modal appears for it). A clean cart with one valid
  (art + qty) item is required — naturally satisfied by a fresh-context test.
- **NDX automation is brittle:** NDX is an overlay-heavy canvas SPA; the flow works via JS clicks
  (MCP) but real-Playwright `force` clicks didn't reliably reproduce it (probe failed at the quote
  step). Hardening the canvas interactions is non-trivial.
- **Payment step still unbuilt:** 4-step checkout (contact → shipping → **credit-card iframe**,
  test visa `4111…`) → place order → `me.orders`. Not reached.

**API-first attempt (per "max API, UI only where you can't continue") — findings:**
- **Cart-add IS a clean API** (no NDX needed): the cart is the **project-service** Lambda.
  `GET https://project-service.lambda-staging.customink.com/projects/current` establishes the
  current cart, then `POST /projects/current/designs` with body **`{"designCids":["<cid>"]}`**
  (cookie-auth, `Content-Type: application/json`) adds a saved design; its saved quote supplies
  the quantities. So **design + cart can both be seeded via API** — the reliable way to reach a
  populated, orderable cart (skips the brittle NDX canvas entirely).
- **But the order itself cannot be created via API.** An order in `me.orders` requires checkout
  **completion = payment**, which is PCI/iframe — not API-accessible. Project-service mutations
  beyond add (e.g. DELETE) are also CORS-blocked from the page origin. So the API gets you to a
  ready cart; the **payment/place-order step is the true wall** and is UI-only + brittle +
  side-effectful (real orders).

**Recommendation (unchanged, now confirmed):** seed orders via a **backend/internal order-create**
(deterministic, no payment iframe, no real-order side effects). If/when that endpoint is
available, `order_history`/`reorder` are quick: backend-seed an order → assert it in `me.orders` /
reorder it. Absent a backend seed, the only path is a brittle UI checkout+payment test that places
real staging orders — not recommended as a per-test seed. `order_history`/`reorder` stay deferred.

**Net of the API-max approach:** it *helped* — it removed NDX from the cart-seed path
(`POST /projects/current/designs {designCids}`), but the payment-gated order placement remains
genuinely uncompletable without backend access.

---

### FINAL STATUS — order-history + reorder (`test.fixme`)

**Order *placement* is fully solved and implemented** (`CheckoutPage` + `helper/api/checkout.api.ts`):
create a priced design (`POST /api/designs` with `quoteData` quantities) → add to cart
(`POST project-service/projects/current/designs`) → UI checkout (contact → shipping →
`/checkout/credit_card`) → **pay by submitting `#credit_card` with `payment_method_nonce=
fake-valid-nonce`** (Braintree sandbox; no iframe) → `/checkout/receipt`. Verified end-to-end:
checkout reaches the receipt every run.

**The remaining blocker is account association, not placement.** The cart is the **project-service**
(a `*.lambda-staging.customink.com` subdomain). The profiles auth is scoped to
`www-master.staging.customink.com`, so an `APIRequestContext` reaches project-service
**anonymously** — the cart never links to the brand-new isolated test account, so the order is
placed as a guest and never surfaces in that account's `accounts-service` Order History
(`GET accounts-service/accounts/{id}/orders`). The app avoids this by sending a project-service
**OAuth token (full PKCE authorization-code flow)** that can't be cheaply replicated black-box; the
only UI path that associates needs a *quoted accounts-service design*, which requires the
brittle NDX quote flow (now gated behind extra `order-type` + `order-options` screens whose size
entry never exposes per-size inputs in this context).

Both specs are therefore **`test.fixme`** with the full seed+checkout body intact (skipped, so the
suite stays green and no real orders are placed each run). **Un-fixme once** either (a) a backend
order-seed / order-create exists, or (b) the project-service OAuth token can be minted in-test to
associate the cart with the account.

**Current account-suite status: 15 passing + 2 `fixme` (order-history, reorder).**

**Ops note:** the NDX/design/GOF seeds are heavy; under high parallelism (workers=4) staging
throttles and tests flake. Run the suite at **workers ≤ 2** (or shard) for stability — verified
**15/15 green at workers=2**.

**Key enablement discovered:** a cold `POST /api/designs` does NOT appear in the GraphQL My
Designs list, but **driving NDX "Save | Share" once does** (`NdxPage.seedDesign`). This unblocked
all 5 design/NDX specs.

### 🔬 Deep discovery findings (what's needed to complete the blocked specs)

Captured live via Playwright MCP against www-master staging:

**Auth & environment (solved, in use):**
- Staging **503s bots** without cookie `user_type=automated` (+ consent cookies). Set on the
  browser context **and** the API context.
- **Signup API** `GET /profiles/users/sign_up` (CSRF) → `POST /profiles/users` creates a user
  **and** establishes a session (302 → welcome). This is our per-test auth + data isolation.
- UI login is **email-code OTP** (`/profiles/users/login_code/entercode`); no password path.

**Designs — the data source is GraphQL, not REST (this is the blocker):**
- My Designs renders from **GraphQL** `me { designs(first,after,sort) }`
  (query `AccountsUI_GetMyDesignsCard_Query`, fragment `DesignCardFields`: `compositeId`,
  `card.editUrl`/`editLabel`, `card.buyAction`, `quote`, …).
  Endpoint: **`https://graphql.out.staging.customink.com/`** (prod `https://apollo.out.customink.com/`),
  apollo client headers (`apollographql-client-name`).
- The legacy REST seed **`POST /api/designs?api_version=5`** (payload below) returns
  `{ success:true, design:{ composite_id } }` — **but the saved design does NOT appear in the
  GraphQL `me.designs` list** (verified: `[data-testid="empty design list"]` even with the
  design's `account_email` matching the session user). The two systems are decoupled on current
  staging. The captured GraphQL schema has **no design-create mutation**.
  - Working REST save payload (creates a record, just not surfaced in My Designs):
    `POST /api/designs?api_version=5` body `{ save_source:'ndx', saveData: JSON.stringify({ designName, email:<sessionEmail>, deviceType:'Desktop', sendEmail:false, notes:'', quoteData:{ postalCode:null, totalPrice:false, quantities:{ '176100':{S:0,M:0,L:0,XL:0} } }, personalization:[], products:['176100'], canvas:[{view:1,icons:[]}], inkMatches:{} }) }`, headers `Content-Type: application/json`, `X-Requested-With: XMLHttpRequest`, `client-name: ndx`.
- **To unblock sorting / add-to-cart / add-multi / edit-design:** drive a real **NDX "Save
  Design"** once and capture the exact create call it makes (MCP `browser_network_requests`) — it
  writes to whatever backs the GraphQL designs service. Wrap that as `helper/api/designs.api.ts`.
  Then: My Designs cards = `[data-testid="designs card"]`, multi-select = `[data-testid*="CardSelect"]`,
  sort = `[data-testid="designs filter"] [role="combobox"]`, edit = "Edit Design" link (href has `cid=`).

**NDX (design editor) — needed for edit-design, add-art-to-product, and design seeding:**
- Large canvas app. Entry points: My Designs "Edit Design" (`?cid=…`) or PDP "Start Designing".
- `add_art_to_product`: upload art (uploads flow — DONE) → "Add to Product" → NDX loads.
- Requires its own discovery cycle (canvas interactions); not a simple API.

**Orders (order-history, reorder) — GraphQL `me.orders`, needs a real order:**
- Order History renders from GraphQL `me { orders }` (`OrderHistoryCardFields`). A fresh user has
  none, and there is no cheap order-seed (creating an order = full checkout incl. payment).
  `reorder` is additionally `test.skip` in legacy (QAE-3301). Defer until an order-seed path exists.

**GOF (gof) — needs a pre-existing group order:**
- `/account/group_orders` is empty for a fresh user; the spec needs Place Order/View Design/Manage
  on an existing group order. Requires a GOF-create flow/seed (not yet discovered).

**Net:** the 5 design/NDX specs all funnel through the **NDX save** (since REST-seed doesn't feed
the GraphQL My Designs list); orders need checkout; GOF needs a seeded group order. Each is a
scoped follow-up cycle. The auth/uploads/signup/portal flows (9 specs) are fully solved & green.

**Blockers + precise next steps**
- **Design seeding (sorting / add-to-cart / add-multi).** The legacy `seedDesign`
  (`POST /api/designs?api_version=5`) returns HTTP 200 but `{ success: false }` with the legacy
  payload on current staging — the design-save contract has drifted. **Next step:** open NDX, save
  a design manually, capture the real save request (Playwright MCP `browser_network_requests`),
  and rebuild `helper/api/designs.api.ts` from the captured payload. Then the 3 design specs
  become straightforward (seed 1–2 designs via API → assert sort options / add-to-cart redirect).
- **Orders (order-history / reorder).** Need a completed order. There's no cheap order-seeding API
  (checkout is heavy); defer until an order-creation endpoint is identified.
- **NDX (edit-design / add-art-to-product).** Require driving the design editor — a separate large
  surface; migrate when the catalog/NDX area is built.
- **GOF (gof).** Needs a seeded group order; defer until a GOF-create API/flow is captured.

### ⬜ Remaining — by area (batch unit = legacy `tests/<area>/`)
Suggested order (smallest/most-isolated first to validate patterns, then high-value flows):

| Batch | Legacy area | ~specs | Notes |
|---|---|---|---|
| 1 | `accounts_portal` | ~12 | finish (login done); login → `storageState` for the rest |
| 2 | `homepage` / landing pages | — | mostly read-only, good early win |
| 3 | `product_catalog` (pdp/plp/category) | — | large; many shared blocks (recommendations, pricing) |
| 4 | `cookie_consent` | — | small |
| 5 | `project_cart` / `external_checkout` | — | cart/checkout flows → `actions/`, API cart prep |
| 6 | `groups_order_form` | — | |
| 7 | `design_experience` / `ndx_desktop` / `design_templates` | — | large |
| 8 | `mms` (fulfillment) | ~16 locator files | back-office; heavy locator sets → many blocks |
| 9 | `superquoter`, `company_stores`, `security`, `live_chat`, `signalmizely` | — | |
| 10 | `ab_tests` | ~60 | env-prefixed (`staging_`/`prod_`) — map to tags |
| 11 | `graph_ql` / API tests | — | → `tests/api/` + `helper/api/` |

> Counts to be filled per batch from `playwright-ui-tests/tests/<area>` before starting it.

## How to run a batch

For each legacy area:
1. Build the page objects/blocks first (merge its `*.locators.ts` + `*.actions.ts`), register in
   `base.fixture`.
2. Add `api/` wrappers for that area's data setup.
3. Port specs one by one into `tests/<surface>/<area>/`, applying the transformations above.
4. Gate each file: `npm run typecheck`, `npm run lint`, and run the spec against staging.

A migration agent should follow [`ARCHITECTURE.md`](./ARCHITECTURE.md) +
`playwright-test-migration/desired-architecture.md` (Part B trigger→action rules) in the pigment
repo. The bulk port is well-suited to a fan-out (one agent per area), to be run on explicit opt-in.
