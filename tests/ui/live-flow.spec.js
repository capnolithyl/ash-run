import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

async function gotoTitle(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screen--title")).toBeVisible({ timeout: 45_000 });
}

async function skipTutorialPromptIfShown(page) {
  const prompt = page.locator(".tutorial-new-run-prompt");
  if (await prompt.isVisible()) {
    await page.locator('[data-action="resolve-tutorial-prompt"][data-tutorial-choice="skip"]').click();
  }
}

async function getTitleLayoutSnapshot(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".title-menu__item, .title-menu__button, .title-showcase__logo",
      ),
    ).map((element) => ({
      className: element.className,
      left: element.offsetLeft,
      top: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    })),
  );
}

async function getCommanderSelectLayoutSnapshot(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('[data-screen-id="commander-select"]');
    const selectors = [
      ".commander-select-panel",
      ".slot-card",
      ".commander-slider",
      '[data-role="commander-slider"]',
      '[data-role="commander-slider-track"]',
      ".commander-card",
      ".commander-card__art",
      ".commander-card__info-image",
      ".panel-footer",
    ];

    return Array.from(screen?.querySelectorAll(selectors.join(",")) ?? []).map(
      (element, index) => ({
        index,
        className: element.className,
        commanderId: element.dataset?.commanderId ?? "",
        copyIndex: element.dataset?.copyIndex ?? "",
        slotId: element.dataset?.slotId ?? "",
        left: element.offsetLeft,
        top: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
      }),
    );
  });
}

async function getCommanderSelectGeometrySnapshot(page) {
  return page.evaluate(() => {
    const screen = document.querySelector('[data-screen-id="commander-select"]');
    const track = document.querySelector('[data-role="commander-slider-track"]');
    const selectors = [
      ".commander-select-panel",
      ".slot-card",
      ".commander-slider",
      '[data-role="commander-slider"]',
      '[data-role="commander-slider-track"]',
      ".commander-card",
      ".commander-card__art",
      ".commander-card__info-image",
      ".panel-footer",
    ];

    return {
      trackTransform: track?.style.transform ?? "",
      boxes: Array.from(screen?.querySelectorAll(selectors.join(",")) ?? []).map(
        (element, index) => {
          const box = element.getBoundingClientRect();

          return {
            index,
            commanderId: element.dataset?.commanderId ?? "",
            copyIndex: element.dataset?.copyIndex ?? "",
            slotId: element.dataset?.slotId ?? "",
            left: Math.round(box.left * 100) / 100,
            top: Math.round(box.top * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
          };
        },
      ),
    };
  });
}

async function getVisibleCommanderDetailOverlays(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '[data-screen-id="commander-select"] .commander-card__hover-overlay',
      ),
    )
      .filter((overlay) => Number.parseFloat(getComputedStyle(overlay).opacity) > 0.05)
      .map((overlay) => overlay.closest("[data-commander-id]")?.dataset.commanderId ?? "unknown"),
  );
}

async function expectCommanderSelectHoverStable(page, selector, { overlayCommanderId = null } = {}) {
  const target = page.locator(selector);
  const box = await target.boundingBox();
  expect(box).not.toBeNull();

  const before = await getCommanderSelectGeometrySnapshot(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(360);
  const after = await getCommanderSelectGeometrySnapshot(page);

  const hoverState = await target.evaluate((element) => {
    const styles = getComputedStyle(element);

    return {
      transform: styles.transform,
      visibleOverlays: Array.from(
        document.querySelectorAll(
          '[data-screen-id="commander-select"] .commander-card__hover-overlay',
        ),
      ).filter((overlay) => Number.parseFloat(getComputedStyle(overlay).opacity) > 0.05).length,
    };
  });

  expect(hoverState.transform).toBe("none");
  expect(after).toEqual(before);

  if (overlayCommanderId) {
    expect(await getVisibleCommanderDetailOverlays(page)).toContain(overlayCommanderId);
    return;
  }

  expect(hoverState.visibleOverlays).toBe(0);
}

async function expectCommanderSelectClickStable(page, selector) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(220);

  const before = await getCommanderSelectGeometrySnapshot(page);
  await page.locator(selector).click({ force: true });
  await page.waitForTimeout(160);
  const after = await getCommanderSelectGeometrySnapshot(page);

  expect(after).toEqual(before);
}

test("title screen appears with startup assets already settled", async ({ page }) => {
  await gotoTitle(page);

  const preloadState = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll(".screen--title img"));
    const buttonImages = Array.from(document.querySelectorAll(".title-button__image"));

    return {
      fontStatus: document.fonts?.status ?? "unsupported",
      incompleteImages: images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
      buttonsWithoutLoadedArt: buttonImages
        .filter((image) => !image.closest("button")?.classList.contains("title-button--image-loaded"))
        .map((image) => image.getAttribute("src")),
    };
  });

  expect(preloadState.fontStatus).toBe("loaded");
  expect(preloadState.incompleteImages).toEqual([]);
  expect(preloadState.buttonsWithoutLoadedArt).toEqual([]);

  const before = await getTitleLayoutSnapshot(page);
  await page.waitForTimeout(250);
  const after = await getTitleLayoutSnapshot(page);

  expect(after).toEqual(before);
});

test("commander select opens with cached art and stable layout", async ({ page }) => {
  await gotoTitle(page);

  await page.locator('[data-action="open-new-run"]').click({ force: true });
  await skipTutorialPromptIfShown(page);
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
  await page.mouse.move(1, 1);

  const preloadState = await page.evaluate(() => {
    const screen = document.querySelector('[data-screen-id="commander-select"]');
    const images = Array.from(screen?.querySelectorAll(".commander-card__info-image") ?? []);

    return {
      fontStatus: document.fonts?.status ?? "unsupported",
      incompleteImages: images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    };
  });

  expect(preloadState.fontStatus).toBe("loaded");
  expect(preloadState.incompleteImages).toEqual([]);

  const before = await getCommanderSelectLayoutSnapshot(page);
  await page.waitForTimeout(350);
  const after = await getCommanderSelectLayoutSnapshot(page);

  expect(after).toEqual(before);

  await expectCommanderSelectHoverStable(page, '[data-action="select-slot"][data-slot-id="slot-1"]');
  await expectCommanderSelectHoverStable(
    page,
    '[data-action="select-commander"][data-commander-id="atlas"][data-copy-index="1"]',
    { overlayCommanderId: "atlas" },
  );
  await page.mouse.move(1, 1);
  await page.waitForTimeout(220);
  expect(await getVisibleCommanderDetailOverlays(page)).toEqual([]);

  const viperCard = page.locator(
    '[data-action="select-commander"][data-commander-id="viper"][data-copy-index="1"]',
  );
  const viperBox = await viperCard.boundingBox();
  expect(viperBox).not.toBeNull();
  await page.mouse.move(viperBox.x + viperBox.width / 2, viperBox.y + viperBox.height / 2);
  await page.waitForTimeout(60);
  expect(await getVisibleCommanderDetailOverlays(page)).toEqual([]);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(220);

  await expectCommanderSelectHoverStable(page, '[data-action="commander-slider-next"]');
  await expectCommanderSelectHoverStable(page, '[data-action="open-run-loadout"]');
  await expectCommanderSelectHoverStable(page, '[data-action="back-to-title"]');
  await expectCommanderSelectClickStable(page, '[data-action="select-slot"][data-slot-id="slot-2"]');
  await expectCommanderSelectClickStable(
    page,
    '[data-action="select-commander"][data-commander-id="viper"][data-copy-index="1"]',
  );

  const sliderBox = await page.locator('[data-role="commander-slider"]').boundingBox();
  expect(sliderBox).not.toBeNull();

  await page.mouse.move(sliderBox.x + sliderBox.width * 0.72, sliderBox.y + sliderBox.height / 2);
  await page.evaluate(() => {
    document.querySelector('[data-action="commander-slider-next"]')?.click();
  });
  await page.waitForTimeout(120);

  expect(await getVisibleCommanderDetailOverlays(page)).toEqual([]);
});

test("new run flow reaches battle from the live app", async ({ page }) => {
  await gotoTitle(page);

  await page.locator('[data-action="open-new-run"]').click({ force: true });
  await skipTutorialPromptIfShown(page);
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
  await page
    .locator('[data-action="select-commander"][data-commander-id="atlas"][data-copy-index="1"]')
    .click({ force: true });

  await page.locator('[data-action="open-run-loadout"]').click({ force: true });
  await expect(page.locator('[data-screen-id="run-loadout"]')).toBeVisible();

  await page.locator('[data-action="run-loadout-add"][data-unit-type-id="grunt"]').click({ force: true });
  await page.locator('[data-action="open-run-naming-review"]').click({ force: true });
  await expect(page.getByRole("dialog", { name: "Name Your Squad" })).toBeVisible();
  await page.locator('[data-action="start-run"]').click({ force: true });

  await expect(page.locator(".battle-shell")).toBeVisible();
});

test("skirmish flow reaches battle from the live app", async ({ page }) => {
  await gotoTitle(page);

  await page.locator('[data-action="open-skirmish"]').click({ force: true });
  await expect(page.locator('[data-screen-id="skirmish-setup"]')).toBeVisible();

  await page.locator('[data-action="skirmish-next-step"]').click({ force: true });
  await page.locator('[data-action="start-skirmish"]').click({ force: true });

  await expect(page.locator(".battle-shell")).toBeVisible();
});

test("tutorial flow reaches the guided battle from the live app", async ({ page }) => {
  await gotoTitle(page);

  await page.locator('[data-action="open-tutorial"]').click({ force: true });
  await expect(page.locator('[data-screen-id="tutorial"]')).toBeVisible();
  await page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]').click({ force: true });

  await expect(page.locator(".battle-shell")).toBeVisible();
  await expect(page.locator(".tutorial-guide")).toBeVisible();
  await expect(page.locator(".tutorial-guide")).toContainText("Pip");
});

test("highlighted tutorial commands keep the fitted battlefield camera stable", async ({ page }) => {
  await gotoTitle(page);
  await page.locator('[data-action="open-tutorial"]').click({ force: true });
  await page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]').click({ force: true });
  await expect(page.locator(".tutorial-guide")).toBeVisible();

  await page.evaluate(async () => {
    const controller = window.__ASH_RUN_DEV__.controller;
    controller.continueTutorialStep();
    await controller.handleBattleTileClick(1, 4);
    await controller.handleBattleTileClick(3, 4);
  });
  await expect(page.locator('[data-action="redo-move"]')).toBeVisible();

  await page.evaluate(() => {
    const scene = window.__ASH_RUN_DEV__.game.scene.getScene("BattleScene");
    const startedAt = performance.now();
    const samples = [];
    window.__tutorialCameraSampling = { done: false, samples };

    const sample = () => {
      samples.push({ x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY });
      if (performance.now() - startedAt < 500) {
        requestAnimationFrame(sample);
      } else {
        window.__tutorialCameraSampling.done = true;
      }
    };
    requestAnimationFrame(sample);
  });

  await page.locator('[data-action="redo-move"]').click({ force: true });
  await page.waitForFunction(() => window.__tutorialCameraSampling?.done === true);

  const cameraMotion = await page.evaluate(() => {
    const samples = window.__tutorialCameraSampling.samples;
    const first = samples[0];
    return Math.max(
      ...samples.map((sample) => Math.hypot(sample.x - first.x, sample.y - first.y))
    );
  });
  expect(cameraMotion).toBeLessThan(0.01);
});

test("mission Rout animation resolves before its victory result advances", async ({ page }) => {
  await gotoTitle(page);
  await page.evaluate(() => {
    const controller = window.__ASH_RUN_DEV__.controller;
    controller.state.metaState.tutorial = {
      promptSeen: true,
      curriculumVersion: 1,
      completedLessonIds: [
        "basic-orders",
        "combat-roles-terrain",
        "support-transport",
        "buildings-capture-supply"
      ],
      unlockedLessonIds: [
        "basic-orders",
        "combat-roles-terrain",
        "support-transport",
        "buildings-capture-supply",
        "mission-objectives"
      ]
    };
    controller.openTutorialHub();
    controller.startTutorialLesson("mission-objectives");
  });
  await expect(page.locator(".tutorial-guide")).toContainText("Rout: defeat every enemy");

  const routBattleId = await page.evaluate(async () => {
    const controller = window.__ASH_RUN_DEV__.controller;
    const battleId = controller.state.battleSnapshot.id;
    await controller.handleBattleTileClick(2, 4);
    await controller.handleBattleTileClick(2, 4);
    await controller.beginSelectedAttack();
    await controller.handleBattleTileClick(3, 4);
    return battleId;
  });

  await expect(page.locator(".battle-overlay--combat-cutscene")).toHaveCount(1);
  await expect(page.locator(".tutorial-guide")).toHaveCount(0);
  expect(await page.evaluate(() => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.id)).toBe(routBattleId);

  await expect(page.locator(".battle-overlay--combat-cutscene")).toHaveCount(0, { timeout: 12_000 });
  await expect(page.locator(".tutorial-guide--result")).toContainText("Objective Secured");
  await expect(page.locator(".tutorial-guide--result")).toContainText("Victory: enemy force routed");
  expect(await page.evaluate(() => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.id)).toBe(routBattleId);

  await page.locator('[data-action="tutorial-next"]').click();
  await expect(page.locator(".tutorial-guide")).toContainText("HQ Capture: take command ownership");
  await expect.poll(() => page.evaluate(() => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.map.name))
    .toBe("Objective Drill: HQ Capture");
});

test("tutorial manual searches and filters current entries", async ({ page }) => {
  await gotoTitle(page);
  await page.locator('[data-action="open-tutorial"]').click({ force: true });
  await page.locator('[data-action="select-tutorial-tab"][data-tutorial-tab="manual"]').click();
  const search = page.locator("[data-manual-query]");
  await search.fill("Carrier");
  await expect(page.locator('[data-manual-entry]:not([hidden])')).toHaveCount(2);
  await expect(page.locator('[data-manual-entry][data-manual-search-text*="carrier"]:not([hidden])').first()).toBeVisible();
  await search.fill("");
  await page.locator('[data-action="filter-field-manual"][data-manual-filter="missions"]').click();
  await expect(page.locator('[data-manual-entry]:not([hidden])')).toHaveCount(5);
  await expect(page.locator("[data-manual-results]")).toHaveText("5 entries");
});

test("lesson completion unlocks, persists, and leaves Lesson 1 replayable", async ({ page }) => {
  await gotoTitle(page);
  await page.locator('[data-action="open-tutorial"]').click();
  await page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]').click();
  await expect(page.locator(".tutorial-guide")).toBeVisible();
  await page.evaluate(async () => globalThis.__ASH_RUN_DEV__.controller.completeActiveTutorialLesson());
  await expect(page.locator('[data-action="tutorial-epilogue"]')).toBeVisible();
  await page.locator('[data-action="tutorial-epilogue"]').click();

  await expect(page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]')).toHaveText("Replay");
  await expect(page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="combat-roles-terrain"]')).toBeEnabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".screen--title")).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-action="open-tutorial"]').click();
  await expect(page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]')).toHaveText("Replay");
  await expect(page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="combat-roles-terrain"]')).toBeEnabled();
  await page.locator('[data-action="start-tutorial-lesson"][data-lesson-id="basic-orders"]').click();
  await expect(page.locator(".tutorial-guide")).toBeVisible();
});

test("fresh-profile New Run choice persists after reload", async ({ page }) => {
  await gotoTitle(page);
  await page.locator('[data-action="open-new-run"]').click();
  await expect(page.locator(".tutorial-new-run-prompt")).toBeVisible();
  await page.locator('[data-action="resolve-tutorial-prompt"][data-tutorial-choice="skip"]').click();
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".screen--title")).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-action="open-new-run"]').click();
  await expect(page.locator(".tutorial-new-run-prompt")).toHaveCount(0);
  await expect(page.locator('[data-screen-id="commander-select"]')).toBeVisible();
});

test("title utility screens open and return cleanly", async ({ page }) => {
  await gotoTitle(page);

  await page.locator('[data-action="open-progression"]').click({ force: true });
  await expect(page.locator(".screen--options")).toBeVisible();
  await page.locator('[data-action="back-to-title"]').click({ force: true });
  await expect(page.locator(".screen--title")).toBeVisible();

  await page.locator('[data-action="open-options"]').click({ force: true });
  await expect(page.locator(".screen--options")).toBeVisible();
  await page.locator('[data-action="back-to-title"]').click({ force: true });
  await expect(page.locator(".screen--title")).toBeVisible();
});

test("main-menu options update without rebuilding the options screen", async ({ page }) => {
  await gotoTitle(page);
  await page.locator('[data-action="open-options"]').click({ force: true });

  const optionsScreen = page.locator('[data-screen-id="options"]');
  await expect(optionsScreen).toBeVisible();
  await optionsScreen.evaluate((element) => {
    globalThis.__ashRunOptionsScreen = element;
  });

  await page.locator('[data-options-tab="gameplay"]').click({ force: true });
  await page.locator('[data-option="showGrid"]').click({ force: true });
  await expect(page.locator('[data-options-tab="gameplay"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.locator('[data-options-tab="audio"]').click({ force: true });
  await page.locator('[data-option="masterVolume"]').evaluate((control) => {
    control.value = control.value === "0.61" ? "0.62" : "0.61";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator('[data-options-tab="audio"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await expect
    .poll(() =>
      page.evaluate(
        () => globalThis.__ashRunOptionsScreen === document.querySelector('[data-screen-id="options"]'),
      ),
    )
    .toBe(true);
});

test("sandbox pause Debug tab preserves tools and loads an exact validated stage", async ({ page }) => {
  await gotoTitle(page);
  await page.waitForFunction(() => Boolean(window.__ASH_RUN_DEV__?.controller?.state?.ready));
  await page.evaluate(() => {
    window.__ASH_RUN_DEV__.controller.startDebugRun({ keepPauseMenuOpen: true });
  });

  const debugTab = page.getByRole("tab", { name: "Debug", exact: true });
  await expect(debugTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-battle-debug-panel="battlefield"]')).toBeVisible();

  await page.locator('[data-debug-tool="spawn"]').click();
  await page.locator('[data-debug-field="spawn-attack"]').fill("77");
  await page.locator('[data-debug-tool="selected-unit"]').click();
  await page.locator('[data-debug-tool="spawn"]').click();
  await expect(page.locator('[data-debug-field="spawn-attack"]')).toHaveValue("77");

  await page.locator('[data-debug-tool="battlefield"]').click();
  const mapFamily = page.locator('[data-debug-field="sandbox-map-family"]');
  const stage = page.locator('[data-debug-field="sandbox-stage"]');
  const familyOptions = await mapFamily.locator("option").allTextContents();
  expect(familyOptions.map((label) => label.trim())).toEqual([
    "Basin Bash",
    "Cauldron",
    "Mereopolis"
  ]);

  const originalMapId = await page.evaluate(
    () => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.map.id
  );
  await stage.fill("99");
  await page.locator('[data-action="debug-load-map"]').click();
  await expect(page.locator("[data-debug-map-error]")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.map.id))
    .toBe(originalMapId);

  await mapFamily.selectOption("cauldron");
  await stage.fill("7");
  await page.locator('[data-action="debug-load-map"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__ASH_RUN_DEV__.controller.state.battleSnapshot.map.id))
    .toBe("cauldron-stage-7-run");
  await expect(page.locator(".battle-overlay--pause")).toBeVisible();
  await expect(debugTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  await page.locator('[data-action="resume-battle"]').click();
  await page.evaluate(() => window.__ASH_RUN_DEV__.controller.openPauseMenu());
  await expect(page.getByRole("tab", { name: "Audio", exact: true })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});
