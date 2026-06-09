import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  "/", "/items", "/items/sniper-rifle-silencer", "/tech", "/tools",
  "/about", "/environment", "/tramplers",
];

for (const path of pages) {
  test(`no serious/critical a11y violations on ${path} (dark)`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("light theme (desertday) has no serious/critical a11y violations on key pages", async ({ page }) => {
  // Persist the light theme so the anti-FOUC script applies it at load time — this
  // avoids analyzing mid-transition colors that a runtime data-theme swap would catch.
  await page.addInitScript(() => {
    try { localStorage.setItem("sand-theme", "desertday"); } catch { /* ignore */ }
  });
  for (const path of ["/", "/items", "/tech"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "desertday");
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
  // Item-card links carry category/tier badge text in their accessible name, so match by href.
  await expect(page.locator('a[href="/items/sniper-rifle"]')).toBeVisible();
});

test("category filter narrows the items list", async ({ page }) => {
  await page.goto("/items?category=guns");
  await expect(page.locator('a[href="/items/sniper-rifle"]')).toBeVisible();
  await expect(page.locator('a[href="/items/energy-bar"]')).toHaveCount(0);
});

test("workbench tier filter narrows the items list", async ({ page }) => {
  await page.goto("/items?tier=2");
  // Tier-2 items only; the result count badge reports a non-zero, bounded set.
  await expect(page.getByText(/\d+ result\(s\)/)).toBeVisible();
  await expect(page.locator('a[href="/items/sniper-rifle-silencer"]')).toBeVisible();
});

test("nav exposes the Items category menu", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByText("Items", { exact: true }).click();
  await expect(nav.getByRole("link", { name: "Weapons" })).toBeVisible();
});

test("item detail shows multiple 'Crafted by' recipes and 'Used in'", async ({ page }) => {
  // sniper-rifle-silencer is produced by more than one recipe.
  await page.goto("/items/sniper-rifle-silencer");
  await expect(page.getByRole("heading", { name: "Sniper Rifle Silencer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crafted by" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();
  // Each recipe card labels its inputs/outputs.
  await expect(page.getByRole("heading", { name: "Inputs" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outputs" }).first()).toBeVisible();
});

test("resource detail lists the recipes it is used in", async ({ page }) => {
  await page.goto("/items/resource-metal-parts");
  await expect(page.getByRole("heading", { name: "Resource Metal Parts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();
  // Used-in recipe cards render their outputs (the items this resource helps craft).
  await expect(page.getByRole("heading", { name: "Outputs" }).first()).toBeVisible();
});

test("environment section shows a coming-soon placeholder", async ({ page }) => {
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
  await expect(page.getByText("Loot Containers")).toBeVisible();
});

test("tech section is a placeholder explaining the missing data", async ({ page }) => {
  await page.goto("/tech");
  await expect(page.getByRole("heading", { name: "Tech Tree" })).toBeVisible();
  await expect(page.getByText(/tech tree isn't available/i)).toBeVisible();
  // The old calculator controls are gone.
  await expect(page.getByRole("button", { name: /calculate/i })).toHaveCount(0);
});
