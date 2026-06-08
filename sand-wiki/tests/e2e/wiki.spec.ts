import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/items", "/items/scrap-rifle", "/tech", "/about"];

for (const path of pages) {
  test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .disableRules([]) // run full ruleset
      .analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("search navigates to filtered items list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: /search items/i }).fill("rifle");
  await page.getByRole("button", { name: /search/i }).click();
  await expect(page).toHaveURL(/\/items\?q=rifle/);
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
});

test("tech calculator computes total unlock cost", async ({ page }) => {
  await page.goto("/tech");
  await page.getByLabel(/unlock technology/i).selectOption({ label: "Basic Weapons" });
  await page.getByRole("button", { name: /calculate/i }).click();
  await expect(page.getByText(/30 × Iron Ore/i)).toBeVisible();
  await expect(page.getByText(/5 × Fuel/i)).toBeVisible();
});
