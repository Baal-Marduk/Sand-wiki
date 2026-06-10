import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  "/", "/items", "/items/sniper-rifle-silencer", "/items/c4-dynamite", "/items/pistol-ammo",
  "/tech", "/tools", "/about", "/environment", "/environment/weapon-crate", "/tramplers",
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
  await page.goto("/items?category=weapons");
  await expect(page.locator('a[href="/items/sniper-rifle"]')).toBeVisible();
  await expect(page.locator('a[href="/items/energy-bar"]')).toHaveCount(0);
});

test("category quick-nav switches the filtered list", async ({ page }) => {
  await page.goto("/items");
  const quickNav = page.getByRole("navigation", { name: "Item categories" });
  await quickNav.getByRole("link", { name: "Weapons" }).click();
  await expect(page).toHaveURL(/\/items\?category=weapons/);
  await expect(page.getByRole("navigation", { name: "Item categories" })
    .getByRole("link", { name: "Weapons" })).toHaveAttribute("aria-current", "page");
});

test("nav exposes the Items category menu without an All link", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("button", { name: /^Items/ }).hover();
  await expect(nav.getByRole("link", { name: "Weapons" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Artillery" })).toBeVisible();
  // The "All Items" shortcut has been removed.
  await expect(nav.getByRole("link", { name: /^All Items$/ })).toHaveCount(0);
});

test("item detail shows Crafted by and Used in tabs with tables", async ({ page }) => {
  await page.goto("/items/sniper-rifle-iron-sights-silencer");
  await expect(page.getByRole("heading", { name: "1874e/sd Petros Rifle (Silenced)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Crafted by" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Used in" })).toBeVisible();
  // Default tab (Crafted by) renders an Ingredients column.
  await expect(page.getByRole("columnheader", { name: "Ingredients" })).toBeVisible();
  // Switching to Used in shows the Produces column.
  await page.getByRole("tab", { name: "Used in" }).click();
  await expect(page.getByRole("columnheader", { name: "Produces" })).toBeVisible();

  // Ingredient icons expose the item name as their accessible name (shown visually on hover).
  await page.getByRole("tab", { name: "Crafted by" }).click();
  const firstIngredientLink = page.locator('[role="tabpanel"] table tbody a[href^="/items/"]').first();
  await expect(firstIngredientLink).toHaveAttribute("aria-label", /\S+/);
});

test("resource detail exposes a Used in tab", async ({ page }) => {
  await page.goto("/items/resource-metal-parts");
  await expect(page.getByRole("heading", { name: "Scrap Metal" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Used in" })).toBeVisible();
});

test("environment landing lists Loot Containers and links to a container", async ({ page }) => {
  await page.goto("/environment");
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await page.getByRole("link", { name: /Loot Containers/ }).click();
  await expect(page).toHaveURL(/category=loot-containers/);
  await expect(page.getByRole("link", { name: "Weapon Crate" })).toBeVisible();
});

test("loot container detail shows a description and a source link", async ({ page }) => {
  await page.goto("/environment/weapon-crate");
  await expect(page.getByRole("heading", { name: "Weapon Crate" })).toBeVisible();
  await expect(page.getByText(/Player Weapons/)).toBeVisible();
  await expect(page.getByRole("link", { name: /sandgame\.wiki/ })).toHaveAttribute("href", /Weapon_Crate/);
});

test("an unpopulated environment category shows coming soon", async ({ page }) => {
  await page.goto("/environment?category=game-modes");
  await expect(page.getByText(/coming soon/i)).toBeVisible();
});

test("tech section is a placeholder explaining the missing data", async ({ page }) => {
  await page.goto("/tech");
  await expect(page.getByRole("heading", { name: "Tech Tree" })).toBeVisible();
  await expect(page.getByText(/tech tree isn't available/i)).toBeVisible();
  // The old calculator controls are gone.
  await expect(page.getByRole("button", { name: /calculate/i })).toHaveCount(0);
});

test("buyable item shows a Buy tab, header badge, and Details summary", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  await expect(page.getByLabel("Buyable")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Buy" })).toBeVisible();
  await expect(page.getByText("Category")).toBeVisible();
});

test("sellable item lists all sell tiers with a best-price marker", async ({ page }) => {
  await page.goto("/items/pistol-ammo");
  await expect(page.getByLabel("Sellable")).toBeVisible();
  await page.getByRole("tab", { name: "Sell" }).click();
  await expect(page.getByText("1,000 ◈")).toBeVisible();
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
  const option = page.getByRole("option", { name: "1874s/sd Petros Sniper Rifle (Silenced)", exact: true });
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

test("item detail shows a real sprite image", async ({ page }) => {
  await page.goto("/items/c4-dynamite");
  const img = page.getByRole("img", { name: "Time Bomb" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", /^\/icons\/.+\.png$/);
});

test("items list exposes a rarity filter that narrows results", async ({ page }) => {
  await page.goto("/items?category=weapons");
  const f = page.getByRole("navigation", { name: "Rarity" });
  await expect(f).toBeVisible();
  await f.getByRole("link", { name: "Common", exact: true }).click();
  await expect(page).toHaveURL(/rarity=Common/);
});

test("weapon detail shows a rarity badge and a stat box with ammo link", async ({ page }) => {
  await page.goto("/items/rifle-musket");
  await expect(page.getByText("Common")).toBeVisible();
  await expect(page.getByText("Damage")).toBeVisible();
  await expect(page.getByRole("link", { name: "9x42 mm Ammo" })).toBeVisible();
});
