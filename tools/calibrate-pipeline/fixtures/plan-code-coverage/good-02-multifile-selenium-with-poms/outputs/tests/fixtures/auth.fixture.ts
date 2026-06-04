// Fixture file — present on disk to satisfy envelope.requiredFixtures[0].
import { test as base } from "@playwright/test";

export const test = base.extend<{ authedPage: void }>({
  authedPage: async ({ page }, use) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("jane@acme.test");
    await page.getByLabel("Password").fill("Sup3rSecret!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await use();
  },
});
