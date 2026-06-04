import { test, expect } from "@playwright/test";

// Legacy promise-chain style (pre-async/await migration era).
test("registration with callbacks", ({ page }) => {
  return page
    .goto("https://app.acme.test/register")
    .then(() => page.locator("#email").fill("jane@acme.test"))
    .then(() => page.locator("#password").fill("hunter2"))
    .then(() => page.locator("#password-confirm").fill("hunter2"))
    .then(() => page.locator("button.create-account").click())
    .then(() => page.waitForSelector(".welcome-banner"))
    .then(() => page.locator(".welcome-banner").textContent())
    .then((txt) => {
      expect(txt).toContain("Welcome");
    })
    .catch((err) => {
      console.error("registration failed", err);
      throw err;
    });
});
