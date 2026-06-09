import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/items", "/items/scrap-rifle", "/tech", "/about", "/environment", "/tramplers", "/tools"];

for (const path of pages) {
  test(`no serious/critical a11y violations on ${path} (dark)`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("light theme (desertday) has no serious/critical a11y violations on key pages", async ({ page }) => {
  for (const path of ["/", "/items", "/tech"]) {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.dataset.theme = "desertday"; });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});

test("theme toggle switches between desert night and day", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "desertnight");
  await page.getByRole("button", { name: /toggle light and dark theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "desertday");
});

test("search navigates to filtered items list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: /search items/i }).fill("rifle");
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page).toHaveURL(/\/items\?q=rifle/);
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
});

test("category filter narrows the items list", async ({ page }) => {
  await page.goto("/items?category=weapons");
  await expect(page.getByRole("link", { name: "Scrap Rifle" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iron Ore" })).toHaveCount(0);
});

test("nav exposes the Items category menu", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByText("Items", { exact: true }).click();
  await expect(nav.getByRole("link", { name: "Weapons" })).toBeVisible();
});

test("environment section shows a coming-soon placeholder", async ({ page }) => {
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
  await expect(page.getByText("Loot Containers")).toBeVisible();
});

test("tech calculator computes total unlock cost", async ({ page }) => {
  await page.goto("/tech");
  await page.getByLabel(/unlock technology/i).selectOption({ label: "Basic Weapons" });
  await page.getByRole("button", { name: /calculate/i }).click();
  await expect(page.getByText(/30 × Iron Ore/i)).toBeVisible();
  await expect(page.getByText(/5 × Fuel/i)).toBeVisible();
});
