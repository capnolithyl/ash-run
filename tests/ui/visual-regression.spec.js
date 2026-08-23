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
  "run-loadout-naming": [
    ".run-naming-dialog__footer",
    '[data-action="start-run"]'
  ],
  "skirmish-commanders": ['[data-action="skirmish-next-step"]'],
  "skirmish-map": ['[data-action="start-skirmish"]'],
  "options": [
    '[data-display-option="displayMode"]',
    '[data-display-option="windowResolution"]'
  ],
  "battle-pause": [
    '[data-debug-field="sandbox-map-family"]',
    '[data-debug-field="sandbox-stage"]',
    '[data-action="resume-battle"]'
  ],
  "battle-reward": ['[data-action="select-run-reward"]'],
  "battle-reinforcement-naming": ['[data-action="confirm-pending-run-unit-name"]'],
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
          ".run-loadout-unit-card__body strong",
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

async function expectNoSidebarHorizontalOverflow(page) {
  const overflowing = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".battle-side-panel, .battle-compact-sheet__panel"
      )
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.scrollWidth - element.clientWidth > 2;
      })
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflow: element.scrollWidth - element.clientWidth
      }))
  );

  expect(overflowing).toEqual([]);
}

for (const scene of UI_HARNESS_SCENES) {
  test(`${scene.id} matches the visual baseline`, async ({ page }) => {
    await page.goto(`/ui-harness.html?scene=${scene.id}&embed=1`);
    await expect(page.locator(scene.locator)).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectCriticalControlsInViewport(page, scene.id);
    await expectNoUnexpectedTextOverflow(page);
    await expectNoSidebarHorizontalOverflow(page);
    await expect(page.locator(scene.locator)).toHaveScreenshot(`${scene.id}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: 4000
    });
  });
}

test("tutorial battle uses a reduced-motion bottom sheet at the narrow breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "preset-1280x720-chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto("/ui-harness.html?scene=battle-tutorial&embed=1");

  const guide = page.locator(".tutorial-guide");
  await expect(guide).toBeVisible();
  const box = await guide.boundingBox();
  const animationName = await guide.evaluate((element) => getComputedStyle(element).animationName);

  expect(box.x).toBeCloseTo(0, 1);
  expect(box.width).toBeCloseTo(760, 1);
  expect(box.y + box.height).toBeLessThanOrEqual(900 - 60);
  expect(animationName).toBe("none");
});

test("run loadout keeps the footer fixed while only the unit grid scrolls", async ({ page }) => {
  await page.goto("/ui-harness.html?scene=run-loadout&embed=1");
  const panel = page.locator(".run-loadout-panel");
  const gridShell = page.locator('[data-role="run-loadout-grid-shell"]');
  const footer = page.locator(".run-loadout-panel__footer");
  const before = await footer.boundingBox();

  await expect(panel).toBeVisible();
  await expect(gridShell).toBeVisible();
  await expect(footer).toBeVisible();
  expect(await panel.evaluate((element) => getComputedStyle(element).overflowY)).toBe("hidden");

  await gridShell.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const after = await footer.boundingBox();

  expect(after.y).toBeCloseTo(before.y, 1);
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
  await expectCriticalControlsInViewport(page, "run-loadout");
});

test("run loadout remains single-scroll at the narrow breakpoint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "preset-1280x720-chromium");
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto("/ui-harness.html?scene=run-loadout&embed=1");

  await expectNoDocumentOverflow(page);
  await expectCriticalControlsInViewport(page, "run-loadout");
  await expect(page.locator(".run-loadout-unit-grid")).toHaveCSS("grid-template-columns", /.+/);
  expect(
    await page.locator(".run-loadout-panel").evaluate((element) => getComputedStyle(element).overflowY)
  ).toBe("hidden");
});

for (const viewport of [
  { width: 1093, height: 614 },
  { width: 1024, height: 576 }
]) {
  test(`level-up Continue stays visible and actionable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "preset-1280x720-chromium");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/ui-harness.html?scene=battle-level-up&embed=1");

    const button = page.locator('[data-action="acknowledge-level-up"]');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(button).toBeFocused();
    await expectCriticalControlsInViewport(page, "battle-level-up");
    await button.click();
  });
}

test("short loadout exposes and keyboard-scrolls to the final starter unit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "preset-1280x720-chromium");
  await page.setViewportSize({ width: 760, height: 600 });
  await page.goto("/ui-harness.html?scene=run-loadout&embed=1");

  const grid = page.locator('[data-role="run-loadout-grid-shell"]');
  const metrics = await grid.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(metrics.clientHeight).toBeGreaterThanOrEqual(120);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await grid.focus();
  await page.keyboard.press("End");
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const gunship = page.locator('.run-loadout-unit-card:has-text("Gunship")');
  await expect(gunship).toBeVisible();
  await expect(gunship.locator('[data-action="run-loadout-add"]')).toBeVisible();
  await expectCriticalControlsInViewport(page, "run-loadout");
});

test("long commander trait and ability names remain inside both panels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "preset-1280x720-chromium");
  await page.goto("/ui-harness.html?scene=battle-commander-layout&embed=1");

  const violations = await page.locator(".commander-panel").evaluateAll((panels) =>
    panels.flatMap((panel) => {
      const panelRect = panel.getBoundingClientRect();
      return Array.from(panel.querySelectorAll(".commander-panel__system strong"))
        .filter((label) => {
          const rect = label.getBoundingClientRect();
          return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1 ||
            rect.top < panelRect.top - 1 || rect.bottom > panelRect.bottom + 1;
        })
        .map((label) => label.textContent.trim());
    })
  );

  expect(violations).toEqual([]);
  await expect(page.locator('.commander-panel__system strong').filter({ hasText: "Estate Claim" })).toHaveCount(2);
  await expect(page.locator('.commander-panel__system strong').filter({ hasText: "Hostile Takeover" })).toHaveCount(2);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 760, height: 600 }
]) {
  test(`open mission drawer matches the layout at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "preset-1280x720-chromium");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/ui-harness.html?scene=battle-commander-layout&embed=1");

    await page.evaluate(() => {
      const drawer = document.querySelector(".battle-mission-drawer");
      const toggle = drawer?.querySelector('[data-action="toggle-mission-details"]');
      const panel = drawer?.querySelector("#battle-mission-details");
      drawer.dataset.missionDetailsOpen = "true";
      toggle?.setAttribute("aria-expanded", "true");
      toggle?.setAttribute("aria-label", "Hide mission details");
      panel?.setAttribute("aria-hidden", "false");
    });

    await expect(page.locator("#battle-mission-details")).toBeVisible();
    await expect(page.locator(".battle-shell")).toHaveScreenshot(
      `battle-mission-drawer-open-${viewport.width}x${viewport.height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixels: 4000
      }
    );
  });
}

for (const sceneId of ["options", "battle-pause"]) {
  test(`${sceneId} tabs expose every settings category without overflow`, async ({ page }) => {
    await page.goto(`/ui-harness.html?scene=${sceneId}&embed=1`);
    await expect(page.locator(".options-tabs")).toBeVisible();

    const categories = [
      ["display", "Display", '[data-display-option="displayMode"]'],
      ["audio", "Audio", '[data-option="masterVolume"]'],
      ["gameplay", "Gameplay", ".unit-color-settings"]
    ];

    if (sceneId === "battle-pause") {
      categories.push(["debug", "Debug", ".debug-toolkit"]);
    }

    for (const [tabId, tabName, controlSelector] of categories) {
      const tab = page.getByRole("tab", { name: tabName, exact: true });
      await expect(tab).toBeVisible();
      await page.evaluate((nextTabId) => {
        for (const candidate of document.querySelectorAll('[role="tab"][data-options-tab]')) {
          const isActive = candidate.dataset.optionsTab === nextTabId;
          candidate.classList.toggle("options-tabs__tab--active", isActive);
          candidate.setAttribute("aria-selected", `${isActive}`);
          candidate.tabIndex = isActive ? 0 : -1;
        }

        for (const panel of document.querySelectorAll('[role="tabpanel"][id^="options-panel-"]')) {
          panel.hidden = panel.id !== `options-panel-${nextTabId}`;
        }
      }, tabId);
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(controlSelector)).toBeVisible();
      await expectNoDocumentOverflow(page);
      await expectNoUnexpectedTextOverflow(page);
      await expectNoSidebarHorizontalOverflow(page);
    }
  });
}

test("battle-pause debug tools remain accessible without page overflow", async ({ page }) => {
  await page.goto("/ui-harness.html?scene=battle-pause&embed=1");
  await expect(page.locator('[data-debug-field="sandbox-stage"]')).toHaveValue("1");

  for (const toolId of [
    "battlefield",
    "spawn",
    "selected-unit",
    "commanders",
    "upgrade-cards",
    "shortcuts"
  ]) {
    await page.evaluate((nextToolId) => {
      for (const card of document.querySelectorAll("[data-debug-tool]")) {
        const isActive = card.dataset.debugTool === nextToolId;
        card.classList.toggle("debug-tool-card--active", isActive);
        card.setAttribute("aria-current", `${isActive}`);
      }

      for (const panel of document.querySelectorAll("[data-battle-debug-panel]")) {
        panel.hidden = panel.dataset.battleDebugPanel !== nextToolId;
      }
    }, toolId);

    await expect(page.locator(`[data-battle-debug-panel="${toolId}"]`)).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectNoUnexpectedTextOverflow(page);
    await expectNoSidebarHorizontalOverflow(page);
  }
});
