import { expect, test } from "@playwright/test";
import { UI_HARNESS_SCENES } from "../../src/dev/uiHarnessFixtures.js";

test.describe.configure({ mode: "serial" });

for (const scene of UI_HARNESS_SCENES) {
  test(`${scene.id} matches the visual baseline`, async ({ page }) => {
    await page.goto(`/ui-harness.html?scene=${scene.id}&embed=1`);
    await expect(page.locator(scene.locator)).toBeVisible();
    await expect(page.locator(scene.locator)).toHaveScreenshot(`${scene.id}.png`, {
      animations: "disabled",
      caret: "hide"
    });
  });
}
