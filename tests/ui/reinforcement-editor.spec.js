import { expect, test } from "@playwright/test";

test("map editor authors and renders a reinforcement wave", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('.screen--title, [data-screen-id="map-editor"]')
  ).toBeVisible({ timeout: 45_000 });

  if (await page.locator(".screen--title").isVisible()) {
    await page.locator('[data-action="open-map-editor"]').click({ force: true });
  }

  await expect(page.locator('[data-screen-id="map-editor"]')).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await page.locator('[data-action="map-editor-add-reinforcement-wave"]').click({ force: true });
  await page
    .locator('[data-map-editor-field="reinforcementTriggerType"]')
    .selectOption("tile-crossed");
  await page.locator('[data-map-editor-accordion-summary="reinforcements"]').click();
  await page
    .locator(
      '[data-action="map-editor-select-reinforcement-unit"][data-unit-type-id="grunt"]'
    )
    .click({ force: true });

  const canvas = page.locator("canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).toBeTruthy();
  const boardCenter = {
    x: canvasBox.width / 2,
    y: canvasBox.height / 2
  };

  await canvas.click({ position: boardCenter });
  await page
    .locator('[data-map-editor-tool="reinforcement-trigger"]')
    .click({ force: true });
  await canvas.click({ position: boardCenter });

  await expect(page.locator(".map-editor-reinforcements")).toContainText("1 unit");
  await expect(page.locator(".map-editor-reinforcements")).toContainText("1 trigger tile");

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const compactTools = Array.from(
      document.querySelectorAll(".map-editor-tool--compact")
    );

    return {
      documentX: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      documentY: Math.max(root.scrollHeight, body.scrollHeight) - window.innerHeight,
      compactTools: compactTools.map((element) => ({
        overflowX: window.getComputedStyle(element).overflowX,
        amount: element.scrollWidth - element.clientWidth
      }))
    };
  });

  expect(overflow.documentX).toBeLessThanOrEqual(2);
  expect(overflow.documentY).toBeLessThanOrEqual(2);
  expect(
    overflow.compactTools.every(
      ({ overflowX, amount }) => overflowX === "clip" || amount <= 2
    )
  ).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("reinforcement-editor.png")
  });
});
