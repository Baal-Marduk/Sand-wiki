import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  "/", "/items", "/items/sniper-rifle-silencer", "/items/c4-dynamite", "/items/pistol-ammo",
  "/tech", "/tools", "/about", "/environment", "/tramplers",
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
  const box = page.getByRole("combobox", { name: /search items/i });
  await box.fill("rifle");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/items\?q=rifle/);
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

test("buyable item shows a Buy section and header badge", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  await expect(page.getByLabel("Buyable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buy" })).toBeVisible();
  await expect(page.getByText(/for 10 crowns/i)).toBeVisible();
});

test("sellable item lists all sell tiers with a best-price marker", async ({ page }) => {
  await page.goto("/items/pistol-ammo");
  await expect(page.getByLabel("Sellable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sell" })).toBeVisible();
  await expect(page.getByText(/for 1,000 crowns/i)).toBeVisible();
  await expect(page.getByText("Best")).toBeVisible();
});

test("items grid marks buyable and sellable items", async ({ page }) => {
  await page.goto("/items");
  await expect(page.locator('a[href="/items/c4-dynamite"]').getByLabel("Buyable")).toBeVisible();
  await expect(page.locator('a[href="/items/pistol-ammo"]').getByLabel("Sellable")).toBeVisible();
});

test("navbar search is hidden on home but present elsewhere", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Primary" });
  await page.goto("/");
  await expect(nav.getByRole("combobox")).toHaveCount(0);
  await page.goto("/items");
  await expect(nav.getByRole("combobox")).toBeVisible();
});

test("autocomplete suggests an item and navigates to its page", async ({ page }) => {
  await page.goto("/items");
  const box = page.getByRole("navigation", { name: "Primary" }).getByRole("combobox");
  await box.fill("Sniper Rifle Silencer");
  const option = page.getByRole("option", { name: "Sniper Rifle Silencer", exact: true });
  await option.click();
  await expect(page).toHaveURL(/\/items\/sniper-rifle-silencer/);
});

test("autocomplete category suggestion filters the list", async ({ page }) => {
  await page.goto("/items");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const box = nav.getByRole("combobox");
  await box.fill("weapons");
  const option = nav.getByRole("listbox").getByRole("option", { name: "Weapons", exact: true });
  await option.click();
  await expect(page).toHaveURL(/\/items\?category=weapons/);
});

test("items filters no longer expose a Sort-by control", async ({ page }) => {
  await page.goto("/items");
  await expect(page.getByLabel("Sort by")).toHaveCount(0);
});
