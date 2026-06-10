// Playwright config for migrated tests under outputs/tests/.
//
// Goals:
//   - Tests use relative URLs (per migration-rules.md §1.4.12) — baseURL
//     resolves them.
//   - actionTimeout: 5_000 matches the default Stage 2 expectation; if a
//     migration documents a longer-than-default backend latency in its
//     Risk callouts (e.g. flaky-waits.spec.ts Q5 — 7s rate-limit cooldown),
//     the test adds a per-assertion timeout override rather than bumping
//     the global.
//   - One project per browser. Stage 2 generates browser-agnostic specs;
//     the runner picks all by default.
//
// To run locally:
//   cd outputs/tests && npx playwright test --config playwright.config.ts
//
// To run a single migrated test:
//   npx playwright test outputs/tests/flaky-waits.spec.ts --config outputs/tests/playwright.config.ts

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // Exclude v0.1.x archived specs (kept for history in _legacy-v0.1.x/).
  testIgnore: "**/_legacy-v0.1.x/**",
  // Migrated tests never use parallel fixtures; default is OK.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Reporter stack (adopted from qa-master):
  //   - list      → readable per-test progress locally and in CI logs
  //   - html      → on-disk report for post-run debugging (never auto-opens)
  //   - github    → CI annotations on PRs (only when process.env.CI is set)
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    // Migrations rely on a configured baseURL — set MIGRATION_TARGET_URL
    // in the environment (or via .env) when running. Defaults to localhost
    // for dev iteration; CI should ALWAYS provide the explicit env var.
    baseURL: process.env.MIGRATION_TARGET_URL ?? "http://localhost:3000",
    actionTimeout: 5_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox",  use: devices["Desktop Firefox"] },
    { name: "webkit",   use: devices["Desktop Safari"] },
  ],
});
