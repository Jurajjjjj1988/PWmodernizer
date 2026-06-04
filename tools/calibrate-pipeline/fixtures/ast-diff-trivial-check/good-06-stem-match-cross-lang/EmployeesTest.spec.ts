import { test, expect } from "@playwright/test";

test.describe("employees search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/employees");
  });

  // plan:scenario=1.1
  test("filters table by surname @positive", async ({ page }) => {
    await page.getByLabel(/employee search/i).fill("Novak");
    await page.getByRole("button", { name: /search/i }).click();

    const rows = page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByRole("cell").filter({ hasText: /novak/i })).toBeVisible();
  });
});
