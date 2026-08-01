import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => globalThis.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screen--title")).toBeVisible({ timeout: 45_000 });
});

test("alpha title exposes only run, progression, and utility actions", async ({ page }) => {
  for (const action of [
    "open-new-run",
    "open-continue",
    "open-progression",
    "open-options",
    "quit-game"
  ]) {
    await expect(page.locator(`[data-action="${action}"]`)).toHaveCount(1);
  }

  await expect(page.locator('[data-action="open-continue"]')).toBeDisabled();

  for (const action of [
    "open-skirmish",
    "open-map-editor",
    "open-tutorial",
    "open-debug-run"
  ]) {
    await expect(page.locator(`[data-action="${action}"]`)).toHaveCount(0);
  }

  await page.locator('[data-action="open-progression"]').click();
  await expect(page.locator(".screen--options")).toContainText("Armory & Unlocks");
  await page.locator('[data-action="back-to-title"]').click();
  await expect(page.locator(".screen--title")).toBeVisible();

  await page.locator('[data-action="open-new-run"]').click();
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
});
