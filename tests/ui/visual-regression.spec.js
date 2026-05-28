import { expect, test } from "@playwright/test";
import { UI_HARNESS_SCENES } from "../../src/dev/uiHarnessFixtures.js";

test.describe.configure({ mode: "serial" });

const CRITICAL_SELECTORS_BY_SCENE = {
  "commander-select": [
    ".commander-select-panel .panel-footer",
    '[data-role="start-run-button"]'
  ],
  "run-loadout": [
    ".run-loadout-panel__footer",
    '[data-role="start-run-button"]'
  ],
  "skirmish-commanders": ['[data-action="skirmish-next-step"]'],
  "skirmish-map": ['[data-action="start-skirmish"]'],
  "options": ['[data-display-option="displayMode"]', '[data-display-option="windowResolution"]'],
  "battle-pause": [
    '[data-display-option="displayMode"]',
    '[data-display-option="windowResolution"]',
    '[data-action="resume-battle"]'
  ],
  "battle-reward": ['[data-action="select-run-reward"]'],
  "battle-run-complete": ['[data-action="open-progression"]'],
  "battle-run-lost": ['[data-action="back-to-title"]'],
  "battle-level-up": ['[data-action="acknowledge-level-up"]']
};

async function expectNoDocumentOverflow(page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const width = Math.max(root.scrollWidth, body.scrollWidth);
    const height = Math.max(root.scrollHeight, body.scrollHeight);

    return {
      overflowX: width - window.innerWidth,
      overflowY: height - window.innerHeight
    };
  });

  expect(overflow.overflowX).toBeLessThanOrEqual(2);
  expect(overflow.overflowY).toBeLessThanOrEqual(2);
}

async function expectCriticalControlsInViewport(page, sceneId) {
  const selectors = CRITICAL_SELECTORS_BY_SCENE[sceneId] ?? [];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();

    expect(box, `${sceneId} ${selector} should have a bounding box`).toBeTruthy();
    expect(box.x, `${sceneId} ${selector} should not sit left of the viewport`).toBeGreaterThanOrEqual(-2);
    expect(box.y, `${sceneId} ${selector} should not sit above the viewport`).toBeGreaterThanOrEqual(-2);
    expect(
      box.x + box.width,
      `${sceneId} ${selector} should not sit right of the viewport`
    ).toBeLessThanOrEqual(page.viewportSize().width + 2);
    expect(
      box.y + box.height,
      `${sceneId} ${selector} should not sit below the viewport`
    ).toBeLessThanOrEqual(page.viewportSize().height + 2);
  }
}

async function expectNoUnexpectedTextOverflow(page) {
  const overflowing = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "button",
          "select",
          "summary",
          ".option-row > span",
          ".slot-card strong",
          ".commander-name",
          ".run-loadout-unit-cell__body strong",
          ".overlay-card h2"
        ].join(",")
      )
    );

    return candidates
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          style.visibility === "hidden" ||
          style.display === "none" ||
          style.overflowX === "hidden" ||
          style.overflowX === "clip"
        ) {
          return false;
        }

        return element.scrollWidth - element.clientWidth > 2;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        text: element.textContent.trim().slice(0, 80),
        overflow: element.scrollWidth - element.clientWidth
      }));
  });

  expect(overflowing).toEqual([]);
}

for (const scene of UI_HARNESS_SCENES) {
  test(`${scene.id} matches the visual baseline`, async ({ page }) => {
    await page.goto(`/ui-harness.html?scene=${scene.id}&embed=1`);
    await expect(page.locator(scene.locator)).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectCriticalControlsInViewport(page, scene.id);
    await expectNoUnexpectedTextOverflow(page);
    await expect(page.locator(scene.locator)).toHaveScreenshot(`${scene.id}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 4000
    });
  });
}
