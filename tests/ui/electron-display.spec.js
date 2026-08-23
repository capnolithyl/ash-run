import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.skip(
  process.env.ASH_RUN_ELECTRON_SMOKE !== "1",
  "Set ASH_RUN_ELECTRON_SMOKE=1 to run the Electron display smoke test."
);

function createElectronSmokeEnv(userDataDir) {
  const env = {
    ...process.env,
    ASH_RUN_84_DEV_SERVER: "1",
    ASH_RUN_84_DEV_PORT: "4173",
    ASH_RUN_84_USER_DATA_DIR: userDataDir
  };

  delete env.ELECTRON_RUN_AS_NODE;

  return env;
}

async function expectRendererDisplayMode(page, displayMode) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.displayMode))
    .toBe(displayMode);
}

async function expectRendererWindowPreset(page, windowResolution) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.windowResolution))
    .toBe(windowResolution);
}

async function expectRendererWindowSizeVars(page, width, height) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: getComputedStyle(document.documentElement).getPropertyValue("--app-window-width").trim(),
        height: getComputedStyle(document.documentElement).getPropertyValue("--app-window-height").trim()
      }))
    )
    .toEqual({
      width: `${width}px`,
      height: `${height}px`
    });
}

async function readCanvasPaint(page) {
  return page.locator("#game-root canvas").evaluate((canvas) => {
    if (!canvas.width || !canvas.height) {
      return {
        width: canvas.width,
        height: canvas.height,
        visibleSamples: 0,
        distinctColorBuckets: 0
      };
    }

    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let visibleSamples = 0;

    for (let index = 0; index < pixels.length; index += 4 * 97) {
      const alpha = pixels[index + 3];
      const brightness = pixels[index] + pixels[index + 1] + pixels[index + 2];
      if (alpha > 0 && brightness > 18) visibleSamples += 1;
      colors.add(`${pixels[index] >> 4}:${pixels[index + 1] >> 4}:${pixels[index + 2] >> 4}:${alpha >> 5}`);
    }

    return {
      width: canvas.width,
      height: canvas.height,
      visibleSamples,
      distinctColorBuckets: colors.size
    };
  });
}

async function readCanvasFrameDrift(page) {
  return page.locator("#game-root canvas").evaluate((canvas) => {
    const game = window.__ASH_RUN_DEV__?.game;
    const context = canvas.getContext("2d");
    const before = context.getImageData(0, 0, canvas.width, canvas.height).data;

    game.renderer.preRender();
    game.scene.getScenes(true).forEach((activeScene) => {
      activeScene.sys.render(game.renderer);
    });
    game.renderer.postRender();
    const after = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let changedPixels = 0;

    for (let index = 0; index < before.length; index += 4) {
      const difference =
        Math.abs(before[index] - after[index]) +
        Math.abs(before[index + 1] - after[index + 1]) +
        Math.abs(before[index + 2] - after[index + 2]) +
        Math.abs(before[index + 3] - after[index + 3]);

      if (difference > 24) changedPixels += 1;
    }

    return { changedPixels };
  });
}

async function readSelectionOverlayPaint(page) {
  return page.evaluate(() => {
    const game = window.__ASH_RUN_DEV__?.game;
    const scene = game?.scene?.getScene?.("BattleScene");
    const selectionGraphics = [
      scene?.selectionLayer?.graphics,
      scene?.selectionLayer?.movementPathGraphics,
      scene?.selectionLayer?.cursorGraphics
    ].filter(Boolean);
    const gridGraphics = scene?.gridLayer?.overlayGraphics;
    const overlayGraphics = [gridGraphics, ...selectionGraphics].filter(Boolean);
    const canvas = game?.canvas;

    if (!scene?.scene?.isActive?.() || overlayGraphics.length !== 4 || !canvas) {
      return {
        changedPixels: 0,
        commandCount: 0,
        gridCommandCount: 0,
        selectionCommandCount: 0,
        available: false
      };
    }

    const renderFrame = () => {
      game.renderer.preRender();
      game.scene.getScenes(true).forEach((activeScene) => {
        activeScene.sys.render(game.renderer);
      });
      game.renderer.postRender();
    };
    const context = canvas.getContext("2d");
    const previousVisibility = overlayGraphics.map((graphics) => graphics.visible);

    const withOverlay = context.getImageData(0, 0, canvas.width, canvas.height).data;

    overlayGraphics.forEach((graphics) => graphics.setVisible(false));
    renderFrame();
    const withoutOverlay = context.getImageData(0, 0, canvas.width, canvas.height).data;

    overlayGraphics.forEach((graphics, index) => graphics.setVisible(previousVisibility[index]));
    renderFrame();

    let changedPixels = 0;
    for (let index = 0; index < withOverlay.length; index += 4) {
      const difference =
        Math.abs(withOverlay[index] - withoutOverlay[index]) +
        Math.abs(withOverlay[index + 1] - withoutOverlay[index + 1]) +
        Math.abs(withOverlay[index + 2] - withoutOverlay[index + 2]) +
        Math.abs(withOverlay[index + 3] - withoutOverlay[index + 3]);

      if (difference > 24) {
        changedPixels += 1;
      }
    }

    return {
      changedPixels,
      commandCount: overlayGraphics.reduce(
        (total, graphics) => total + (graphics.commandBuffer?.length ?? 0),
        0
      ),
      gridCommandCount: gridGraphics.commandBuffer?.length ?? 0,
      selectionCommandCount: selectionGraphics.reduce(
        (total, graphics) => total + (graphics.commandBuffer?.length ?? 0),
        0
      ),
      available: true
    };
  });
}

async function readPhaserInputGeometry(page) {
  return page.evaluate(() => {
    const game = window.__ASH_RUN_DEV__?.game;
    const rect = game.canvas.getBoundingClientRect();
    const bounds = game.scale.canvasBounds;

    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      displayScale: { x: game.scale.displayScale.x, y: game.scale.displayScale.y },
      expectedScale: {
        x: game.scale.baseSize.width / rect.width,
        y: game.scale.baseSize.height / rect.height
      }
    };
  });
}

async function getBoardTileCanvasPosition(page, tile) {
  return page.evaluate((targetTile) => {
    const { controller, game } = window.__ASH_RUN_DEV__;
    const scene = game.scene.getScene("BattleScene");
    const map = controller.state.battleSnapshot?.map ?? controller.state.mapEditor?.mapData;
    const layout = scene.getBoardLayout({ map });
    const camera = scene.cameras.main;
    const worldX = layout.originX + (targetTile.x + 0.5) * layout.cellSize;
    const worldY = layout.originY + (targetTile.y + 0.5) * layout.cellSize;

    return {
      x: camera.x + (worldX - camera.worldView.x) * camera.zoom,
      y: camera.y + (worldY - camera.worldView.y) * camera.zoom
    };
  }, tile);
}

async function sendWindowedRecoveryShortcut(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const browserWindow = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    browserWindow?.webContents.sendInputEvent({ type: "keyDown", keyCode: "F11" });
    browserWindow?.webContents.sendInputEvent({ type: "keyUp", keyCode: "F11" });
  });
}

async function waitForDisplayPhase(page, phase) {
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.ashRun84Api.getDisplayState());
    return state.transitionPhase;
  }).toBe(phase);

  return page.evaluate(() => window.ashRun84Api.getDisplayState());
}

async function applyDisplayAndWaitForPreview(page, options) {
  await page.evaluate(
    (nextOptions) => window.ashRun84Api.applyDisplaySettings(nextOptions),
    options
  );
  return waitForDisplayPhase(page, "previewing");
}

async function confirmDisplayPreview(page, displayState) {
  return page.evaluate(
    (transitionId) => window.ashRun84Api.confirmDisplaySettings(transitionId),
    displayState.transitionId
  );
}

async function expectPaintedCanvasMatchingParent(page) {
  await expect.poll(async () => (await readCanvasPaint(page)).distinctColorBuckets)
    .toBeGreaterThan(6);
  const dimensions = await page.evaluate(() => {
    const canvas = document.querySelector("#game-root canvas");
    const parent = document.getElementById("game-root");
    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      parentWidth: parent.clientWidth,
      parentHeight: parent.clientHeight
    };
  });
  expect(dimensions.canvasWidth).toBe(dimensions.parentWidth);
  expect(dimensions.canvasHeight).toBe(dimensions.parentHeight);
  return dimensions;
}

test("Electron applies windowed, fullscreen, and borderless display modes", async () => {
  test.setTimeout(90_000);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-electron-smoke-"));
  const storageDir = path.join(userDataDir, "storage");
  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(
    path.join(storageDir, "meta.json"),
    JSON.stringify({ options: { safeGraphicsMode: true } }),
    "utf8"
  );
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, "."],
    cwd: process.cwd(),
    env: createElectronSmokeEnv(userDataDir)
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#game-root canvas");
    await page.waitForFunction(() => Boolean(window.ashRun84Api?.getDisplayState));
    await page.waitForFunction(() => Boolean(window.__ASH_RUN_DEV__?.controller?.state?.ready));
    await expect.poll(() => page.evaluate(() => window.ashRun84Api.getDisplayState()))
      .toMatchObject({ revision: expect.any(Number), safeGraphicsModeActive: true });

    let displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "windowed",
      windowResolution: "1280x720"
    });

    expect(displayState.current.displayMode).toBe("windowed");
    expect(displayState.current.windowResolution).toBe("1280x720");
    await expectRendererDisplayMode(page, "windowed");
    await expectRendererWindowPreset(page, "1280x720");
    await expectRendererWindowSizeVars(page, 1280, 720);
    await expect(page.locator("[data-window-action='minimize']")).toBeVisible();
    await expect(page.locator("[data-window-action='close']")).toBeVisible();
    await confirmDisplayPreview(page, displayState);

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "fullscreen",
      windowResolution: "1280x720"
    });
    expect(displayState.current.displayMode).toBe("fullscreen");
    displayState = await page.evaluate(
      (transitionId) => window.ashRun84Api.revertDisplaySettings(transitionId),
      displayState.transitionId
    );
    expect(displayState.current.displayMode).toBe("windowed");
    expect(displayState.current.windowResolution).toBe("1280x720");
    await expectRendererWindowPreset(page, "1280x720");

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "fullscreen",
      windowResolution: "1280x720"
    });

    expect(displayState.current.displayMode).toBe("fullscreen");
    await expectRendererDisplayMode(page, "fullscreen");
    await expect(page.locator(".window-chrome")).toHaveCount(0);
    await confirmDisplayPreview(page, displayState);

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "borderless",
      windowResolution: "1280x720"
    });

    expect(displayState.current.displayMode).toBe("borderless");
    await expectRendererDisplayMode(page, "borderless");
    await expect(page.locator(".window-chrome")).toHaveCount(0);
    await confirmDisplayPreview(page, displayState);

    displayState = await page.evaluate(() => window.ashRun84Api.returnToWindowed());
    expect(displayState.current.displayMode).toBe("windowed");
    await expectRendererDisplayMode(page, "windowed");
    await expect(page.locator("[data-window-action='minimize']")).toBeVisible();

    const canvasBox = await page.locator("#game-root canvas").boundingBox();
    expect(canvasBox?.width).toBeGreaterThan(0);
    expect(canvasBox?.height).toBeGreaterThan(0);

    await page.waitForFunction(() => Boolean(window.__ASH_RUN_DEV__?.controller?.state?.ready));
    await page.evaluate(() => window.__ASH_RUN_DEV__.controller.startTutorialBattle());
    await expect(page.locator(".battle-shell")).toBeVisible();
    await expect(page.locator(".tutorial-guide")).toBeVisible();
    await expect.poll(async () => (await readCanvasPaint(page)).visibleSamples)
      .toBeGreaterThan(100);
    await expect.poll(async () => (await readCanvasPaint(page)).distinctColorBuckets)
      .toBeGreaterThan(6);
    const windowedPaint = await readCanvasPaint(page);
    expect(windowedPaint.visibleSamples).toBeGreaterThan(100);
    expect(windowedPaint.distinctColorBuckets).toBeGreaterThan(6);

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "fullscreen",
      windowResolution: "1280x720"
    });
    expect(displayState.current.displayMode).toBe("fullscreen");
    await expectRendererDisplayMode(page, "fullscreen");
    await expect.poll(async () => (await readCanvasPaint(page)).distinctColorBuckets).toBeGreaterThan(6);
    await page.locator("#game-root canvas").click({ position: { x: 320, y: 260 } });

    await sendWindowedRecoveryShortcut(app);
    await expectRendererDisplayMode(page, "windowed");
    await expect(page.locator("[data-window-action='minimize']")).toBeVisible();
    await expect.poll(async () => (await readCanvasPaint(page)).distinctColorBuckets).toBeGreaterThan(6);

    await page.evaluate(() => {
      const controller = window.__ASH_RUN_DEV__.controller;
      const unit = controller.battleSystem.state.player.units[0];
      controller.battleSystem.awardExperienceToUnit(unit.id, 120);
      controller.syncBattleState();
    });
    await expect(page.locator(".battle-overlay--level-up")).toBeVisible();

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "fullscreen",
      windowResolution: "1280x720"
    });
    await expectRendererDisplayMode(page, "fullscreen");
    await expect(page.locator('[data-action="acknowledge-level-up"]')).toBeVisible();
    await expect.poll(async () => (await readCanvasPaint(page)).distinctColorBuckets).toBeGreaterThan(6);
    await sendWindowedRecoveryShortcut(app);
    await expectRendererDisplayMode(page, "windowed");

    await page.evaluate(async () => {
      const controller = window.__ASH_RUN_DEV__.controller;
      while (controller.state.battleSnapshot?.levelUpQueue?.length) {
        await controller.acknowledgeLevelUp();
      }
      controller.openPauseMenu();
    });
    await expect(page.locator(".battle-overlay--pause")).toBeVisible();
    await page.getByRole("tab", { name: "Display", exact: true }).click();
    await expect(page.locator('[data-display-option="displayMode"]')).toBeVisible();
    await expect(page.locator('[data-display-option="windowResolution"]')).toBeVisible();

    await page.evaluate(async () => {
      const controller = window.__ASH_RUN_DEV__.controller;
      await controller.returnToTitle();
      controller.openOptions();
    });
    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "windowed",
      windowResolution: "1600x900"
    });
    await confirmDisplayPreview(page, displayState);

    await page.evaluate(async () => {
      const controller = window.__ASH_RUN_DEV__.controller;
      await controller.returnToTitle();
      controller.openMapEditor();
    });
    await expect(page.locator('[data-screen-id="map-editor"]')).toBeVisible();
    const beforeResolutionPaint = await readCanvasPaint(page);
    expect(beforeResolutionPaint.distinctColorBuckets).toBeGreaterThan(6);

    await page.evaluate(async () => {
      const controller = window.__ASH_RUN_DEV__.controller;
      await controller.returnToTitle();
      controller.openOptions();
    });
    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "windowed",
      windowResolution: "1440x900"
    });
    await confirmDisplayPreview(page, displayState);
    await page.evaluate(async () => {
      const controller = window.__ASH_RUN_DEV__.controller;
      await controller.returnToTitle();
      controller.openMapEditor();
    });
    await expect(page.locator('[data-screen-id="map-editor"]')).toBeVisible();
    const mapEditorDimensions = await expectPaintedCanvasMatchingParent(page);
    expect(mapEditorDimensions.parentWidth).toBe(1440);
    expect(mapEditorDimensions.parentHeight).toBe(866);
    await page.locator("#game-root canvas").click({ position: { x: 720, y: 430 } });
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.controller.state.mapEditor?.selectedTile ?? null
    )).not.toBeNull();
    const selectionOverlayPaint = await readSelectionOverlayPaint(page);
    expect(selectionOverlayPaint.available).toBe(true);
    expect(selectionOverlayPaint.commandCount).toBeGreaterThan(0);
    expect(selectionOverlayPaint.gridCommandCount).toBeGreaterThan(0);
    expect(selectionOverlayPaint.selectionCommandCount).toBeGreaterThan(0);
    expect(selectionOverlayPaint.changedPixels).toBeGreaterThan(40);

    const originDisplayId = (await page.evaluate(() =>
      window.ashRun84Api.getDisplayState()
    )).display.id;
    for (let index = 0; index < 10; index += 1) {
      const resolution = index % 2 === 0 ? "1280x720" : "1440x900";
      displayState = await applyDisplayAndWaitForPreview(page, {
        displayMode: "windowed",
        windowResolution: resolution
      });
      if (index % 3 === 0) {
        await page.evaluate(
          (transitionId) => window.ashRun84Api.revertDisplaySettings(transitionId),
          displayState.transitionId
        );
      } else {
        await confirmDisplayPreview(page, displayState);
      }
      await expectPaintedCanvasMatchingParent(page);
      const settledState = await page.evaluate(() => window.ashRun84Api.getDisplayState());
      expect(settledState.transitionPhase).toBeNull();
      expect(settledState.display.id).toBe(originDisplayId);
      const workArea = settledState.display.workArea;
      expect(settledState.bounds.x).toBeGreaterThanOrEqual(workArea.x);
      expect(settledState.bounds.y).toBeGreaterThanOrEqual(workArea.y);
      expect(settledState.bounds.x + settledState.bounds.width)
        .toBeLessThanOrEqual(workArea.x + workArea.width);
      expect(settledState.bounds.y + settledState.bounds.height)
        .toBeLessThanOrEqual(workArea.y + workArea.height);
    }

    const beforeFailedPreview = await page.evaluate(() => window.ashRun84Api.getDisplayState());
    await page.locator("#game-root").evaluate((element) => {
      element.style.display = "none";
    });
    await page.evaluate((resolution) => window.ashRun84Api.applyDisplaySettings({
      displayMode: "windowed",
      windowResolution: resolution
    }), beforeFailedPreview.current.windowResolution === "1280x720" ? "1440x900" : "1280x720");
    await expect.poll(async () => page.evaluate(() => window.ashRun84Api.getDisplayState()), {
      timeout: 8_000
    }).toMatchObject({
      transitionPhase: null,
      transitionFailure: { reason: "renderer-timeout" }
    });
    await page.locator("#game-root").evaluate((element) => {
      element.style.display = "";
    });
    await expectPaintedCanvasMatchingParent(page);
  } finally {
    await app.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});

test("Electron keeps battle selection overlays painted across a resolution change", async () => {
  test.setTimeout(45_000);
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-electron-selection-"));
  const storageDir = path.join(userDataDir, "storage");
  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(
    path.join(storageDir, "meta.json"),
    JSON.stringify({ options: { safeGraphicsMode: true, showGrid: true } }),
    "utf8"
  );
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, "."],
    cwd: process.cwd(),
    env: createElectronSmokeEnv(userDataDir)
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#game-root canvas");
    await page.waitForFunction(() => Boolean(window.ashRun84Api?.getDisplayState));
    await page.waitForFunction(() => Boolean(window.__ASH_RUN_DEV__?.controller?.state?.ready));

    let displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "windowed",
      windowResolution: "1920x1080"
    });
    await confirmDisplayPreview(page, displayState);

    await page.evaluate(async () => {
      const { controller, game } = window.__ASH_RUN_DEV__;
      controller.startDebugRun({ keepPauseMenuOpen: false });
      const map = controller.state.battleSnapshot.map;
      let spawn = null;
      for (let y = 0; y < map.height && !spawn; y += 1) {
        for (let x = 0; x < map.width && !spawn; x += 1) {
          if (controller.battleSystem.spawnDebugUnit("grunt", "player", x, y, {})) {
            spawn = { x, y };
          }
        }
      }
      controller.syncBattleState();
      if (!spawn) throw new Error("Unable to find a valid debug spawn tile.");
      const scene = game.scene.getScene("BattleScene");
      scene.hoveredTile = { x: spawn.x, y: spawn.y };
      scene.renderBattle();
    });
    await expect(page.locator(".battle-shell")).toBeVisible();
    await page.waitForTimeout(100);

    const beforeResize = await readSelectionOverlayPaint(page);
    expect(beforeResize.available).toBe(true);
    expect(beforeResize.gridCommandCount).toBeGreaterThan(0);
    expect(beforeResize.selectionCommandCount).toBeGreaterThan(0);
    expect(beforeResize.changedPixels).toBeGreaterThan(40);

    await page.evaluate(() => window.__ASH_RUN_DEV__.controller.openPauseMenu());
    await expect(page.locator(".battle-overlay--pause")).toBeVisible();
    await page.getByRole("tab", { name: "Display", exact: true }).click();
    await page.locator('[data-display-option="windowResolution"]').selectOption("1600x900");
    await page.locator('[data-action="apply-display-settings"]').click();
    displayState = await waitForDisplayPhase(page, "previewing");
    await expectPaintedCanvasMatchingParent(page);
    await page.waitForTimeout(100);

    const duringPreview = await readSelectionOverlayPaint(page);
    expect(duringPreview.gridCommandCount).toBeGreaterThan(0);
    expect(duringPreview.selectionCommandCount).toBeGreaterThan(0);
    expect(duringPreview.changedPixels).toBeGreaterThan(40);

    await page.locator('[data-action="keep-display-settings"]').click();
    await expect.poll(() => page.evaluate(() =>
      window.ashRun84Api.getDisplayState()
    )).toMatchObject({ transitionPhase: null, current: { windowResolution: "1600x900" } });
    await page.waitForTimeout(100);
    const afterKeep = await readSelectionOverlayPaint(page);
    expect(afterKeep.gridCommandCount).toBeGreaterThan(0);
    expect(afterKeep.selectionCommandCount).toBeGreaterThan(0);
    expect(afterKeep.changedPixels).toBeGreaterThan(40);

    await page.locator('[data-action="resume-battle"]').click();
    await expect(page.locator(".battle-overlay--pause")).toHaveCount(0);
    const stalledFrame = await page.evaluate(() => {
      const loop = window.__ASH_RUN_DEV__.game.loop;
      loop.raf.stop();
      return loop.frame;
    });
    const battleHoverTile = { x: 5, y: 5 };
    const battleHoverPosition = await getBoardTileCanvasPosition(page, battleHoverTile);
    const battleCanvasBox = await page.locator("#game-root canvas").boundingBox();
    await page.mouse.move(
      battleCanvasBox.x + battleHoverPosition.x,
      battleCanvasBox.y + battleHoverPosition.y
    );
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.game.scene.getScene("BattleScene").hoveredTile
    )).toEqual(battleHoverTile);
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.game.loop.frame
    )).toBeGreaterThan(stalledFrame);
    const hoverFrameDrift = await readCanvasFrameDrift(page);
    expect(hoverFrameDrift.changedPixels).toBeLessThan(20);

    await page.evaluate(async () => {
      const { controller, game } = window.__ASH_RUN_DEV__;
      await controller.returnToTitle();
      controller.openMapEditor();
      controller.setMapEditorSelectedTile({ x: 4, y: 4 });
      const scene = game.scene.getScene("BattleScene");
      scene.hoveredTile = { x: 5, y: 4 };
      scene.renderBattle();
    });
    await expect(page.locator('[data-screen-id="map-editor"]')).toBeVisible();
    await page.waitForTimeout(100);
    const editorBeforeResize = await readSelectionOverlayPaint(page);
    expect(editorBeforeResize.gridCommandCount).toBeGreaterThan(0);
    expect(editorBeforeResize.selectionCommandCount).toBeGreaterThan(0);
    expect(editorBeforeResize.changedPixels).toBeGreaterThan(40);

    displayState = await applyDisplayAndWaitForPreview(page, {
      displayMode: "windowed",
      windowResolution: "1440x900"
    });
    await expectPaintedCanvasMatchingParent(page);
    await page.waitForTimeout(100);
    const editorDuringPreview = await readSelectionOverlayPaint(page);
    expect(editorDuringPreview.gridCommandCount).toBeGreaterThan(0);
    expect(editorDuringPreview.selectionCommandCount).toBeGreaterThan(0);
    expect(editorDuringPreview.changedPixels).toBeGreaterThan(40);

    const inputGeometry = await readPhaserInputGeometry(page);
    expect(inputGeometry.bounds.x).toBeCloseTo(inputGeometry.rect.x, 4);
    expect(inputGeometry.bounds.y).toBeCloseTo(inputGeometry.rect.y, 4);
    expect(inputGeometry.bounds.width).toBeCloseTo(inputGeometry.rect.width, 4);
    expect(inputGeometry.bounds.height).toBeCloseTo(inputGeometry.rect.height, 4);
    expect(inputGeometry.displayScale.x).toBeCloseTo(inputGeometry.expectedScale.x, 4);
    expect(inputGeometry.displayScale.y).toBeCloseTo(inputGeometry.expectedScale.y, 4);
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.game.scene.getScene("BattleScene").hoveredTile
    )).toBeNull();
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.controller.state.mapEditor.selectedTile
    )).toEqual({ x: 4, y: 4 });

    const hoverTile = { x: 6, y: 5 };
    const hoverPosition = await getBoardTileCanvasPosition(page, hoverTile);
    await page.locator("#game-root canvas").hover({ position: hoverPosition });
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.game.scene.getScene("BattleScene").hoveredTile
    )).toEqual(hoverTile);

    const selectedTile = { x: 7, y: 5 };
    const selectedPosition = await getBoardTileCanvasPosition(page, selectedTile);
    await page.locator("#game-root canvas").click({ position: selectedPosition });
    await expect.poll(() => page.evaluate(() =>
      window.__ASH_RUN_DEV__.controller.state.mapEditor.selectedTile
    )).toEqual(selectedTile);
    await confirmDisplayPreview(page, displayState);
  } finally {
    await app.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
