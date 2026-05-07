import { expect, test } from "@playwright/test";

test("new run flow reaches battle from the live app", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="open-new-run"]').click({ force: true });
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
  await page
    .locator('[data-action="select-commander"][data-commander-id="atlas"][data-copy-index="1"]')
    .click({ force: true });

  await page.locator('[data-action="open-run-loadout"]').click({ force: true });
  await expect(page.locator('[data-screen-id="run-loadout"]')).toBeVisible();

  await page.locator('[data-action="run-loadout-add"][data-unit-type-id="grunt"]').click({ force: true });
  await page.locator('[data-action="start-run"]').click({ force: true });

  await expect(page.locator(".battle-shell")).toBeVisible();
});

test("skirmish flow reaches battle from the live app", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="open-skirmish"]').click({ force: true });
  await expect(page.locator('[data-screen-id="skirmish-setup"]')).toBeVisible();

  await page.locator('[data-action="skirmish-next-step"]').click({ force: true });
  await page.locator('[data-action="start-skirmish"]').click({ force: true });

  await expect(page.locator(".battle-shell")).toBeVisible();
});

test("title utility screens open and return cleanly", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-action="open-progression"]').click({ force: true });
  await expect(page.locator(".screen--options")).toBeVisible();
  await page.locator('[data-action="back-to-title"]').click({ force: true });
  await expect(page.locator(".screen--title")).toBeVisible();

  await page.locator('[data-action="open-options"]').click({ force: true });
  await expect(page.locator(".screen--options")).toBeVisible();
  await page.locator('[data-action="back-to-title"]').click({ force: true });
  await expect(page.locator(".screen--title")).toBeVisible();
});
