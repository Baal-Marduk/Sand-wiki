import { test, expect, devices } from "@playwright/test";

// Spread only the context-level fields from iPhone 13 so Chromium (the only
// installed browser) handles the tests. `defaultBrowserType` is a device
// metadata key — including it causes Playwright to launch WebKit instead.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- omit defaultBrowserType so it doesn't override the chromium project to webkit
const { defaultBrowserType, ...iphone13 } = devices["iPhone 13"];
test.use(iphone13); // ~390px viewport + touch UA

test("builder shows the desktop-only gate on a phone", async ({ page }) => {
  await page.goto("/builder");
  await expect(page.getByRole("heading", { name: /bigger screen needed/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse the gallery/i })).toHaveAttribute("href", "/gallery");
  await expect(page.getByRole("link", { name: /open the tech tree/i })).toHaveAttribute("href", "/tech");
  // three.js is gated out → no canvas mounts.
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("mobile drawer lists Gallery and navigates to it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /open menu/i }).click();
  const gallery = page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Gallery" });
  await expect(gallery).toBeVisible();
  await gallery.click();
  await expect(page).toHaveURL(/\/gallery$/);
});
