import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.skip(
  process.env.ASH_RUN_ELECTRON_SMOKE !== "1",
  "Set ASH_RUN_ELECTRON_SMOKE=1 to run the Electron display smoke test."
);

function createElectronSmokeEnv() {
  const env = {
    ...process.env,
    ASH_RUN_84_DEV_SERVER: "1",
    ASH_RUN_84_DEV_PORT: "4173"
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

test("Electron applies windowed, fullscreen, and borderless display modes", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-electron-smoke-"));
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, "."],
    cwd: process.cwd(),
    env: createElectronSmokeEnv()
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#game-root canvas");
    await page.waitForFunction(() => Boolean(window.ashRun84Api?.getDisplayState));

    let displayState = await page.evaluate(() =>
      window.ashRun84Api.applyDisplaySettings({
        displayMode: "windowed",
        windowResolution: "1280x720"
      })
    );

    expect(displayState.current.displayMode).toBe("windowed");
    expect(displayState.current.windowResolution).toBe("1280x720");
    await expectRendererDisplayMode(page, "windowed");
    await expectRendererWindowPreset(page, "1280x720");
    await expectRendererWindowSizeVars(page, 1280, 720);
    await expect(page.locator("[data-window-action='minimize']")).toBeVisible();
    await expect(page.locator("[data-window-action='close']")).toBeVisible();
    await page.evaluate(() => window.ashRun84Api.confirmDisplaySettings());

    displayState = await page.evaluate(() =>
      window.ashRun84Api.applyDisplaySettings({
        displayMode: "fullscreen",
        windowResolution: "1280x720"
      })
    );
    expect(displayState.current.displayMode).toBe("fullscreen");
    displayState = await page.evaluate(() => window.ashRun84Api.revertDisplaySettings());
    expect(displayState.current.displayMode).toBe("windowed");
    expect(displayState.current.windowResolution).toBe("1280x720");
    await expectRendererWindowPreset(page, "1280x720");

    displayState = await page.evaluate(() =>
      window.ashRun84Api.applyDisplaySettings({
        displayMode: "fullscreen",
        windowResolution: "1280x720"
      })
    );

    expect(displayState.current.displayMode).toBe("fullscreen");
    await expectRendererDisplayMode(page, "fullscreen");
    await expect(page.locator(".window-chrome")).toHaveCount(0);
    await page.evaluate(() => window.ashRun84Api.confirmDisplaySettings());

    displayState = await page.evaluate(() =>
      window.ashRun84Api.applyDisplaySettings({
        displayMode: "borderless",
        windowResolution: "1280x720"
      })
    );

    expect(displayState.current.displayMode).toBe("borderless");
    await expectRendererDisplayMode(page, "borderless");
    await expect(page.locator(".window-chrome")).toHaveCount(0);
    await page.evaluate(() => window.ashRun84Api.confirmDisplaySettings());

    displayState = await page.evaluate(() => window.ashRun84Api.returnToWindowed());
    expect(displayState.current.displayMode).toBe("windowed");
    await expectRendererDisplayMode(page, "windowed");
    await expect(page.locator("[data-window-action='minimize']")).toBeVisible();

    const canvasBox = await page.locator("#game-root canvas").boundingBox();
    expect(canvasBox?.width).toBeGreaterThan(0);
    expect(canvasBox?.height).toBeGreaterThan(0);

    await page.waitForFunction(() => Boolean(window.__ASH_RUN_DEV__?.controller?.state?.ready));
    await page.evaluate(() => {
      window.__ASH_RUN_DEV__.controller.startDebugRun({ keepPauseMenuOpen: true });
    });
    await expect(page.locator(".battle-overlay--pause")).toBeVisible();
    await expect(page.locator('[data-display-option="displayMode"]')).toBeVisible();
    await expect(page.locator('[data-display-option="windowResolution"]')).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
