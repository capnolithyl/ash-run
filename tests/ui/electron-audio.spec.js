import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.skip(
  process.env.ASH_RUN_ELECTRON_SMOKE !== "1",
  "Set ASH_RUN_ELECTRON_SMOKE=1 to run the Electron audio smoke test."
);

test("Electron starts menu music after boot without user interaction", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-electron-audio-"));
  const env = {
    ...process.env,
    ASH_RUN_84_DEV_SERVER: "1",
    ASH_RUN_84_DEV_PORT: "4173"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, "."],
    cwd: process.cwd(),
    env
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.focus();
    });
    await page.bringToFront();
    await page.waitForFunction(() => {
      const game = window.__ASH_RUN_DEV__?.game;
      const musicDirector = game?.registry?.get("audioDirector")?.musicDirector;
      return game?.sound?.locked === false &&
        musicDirector?.currentSound?.isPlaying === true;
    });

    const audioState = await page.evaluate(() => {
      const game = window.__ASH_RUN_DEV__.game;
      const musicDirector = game.registry.get("audioDirector").musicDirector;
      return {
        contextState: game.sound.context?.state,
        locked: game.sound.locked,
        musicKey: musicDirector.currentKey,
        isPlaying: musicDirector.currentSound?.isPlaying
      };
    });

    expect(audioState).toMatchObject({
      locked: false,
      musicKey: "music:menu",
      isPlaying: true
    });
    // Playwright can remove OS focus from the Electron window after startup,
    // which lets Phaser suspend an otherwise-unlocked context on blur.
    expect(["running", "suspended"]).toContain(audioState.contextState);
  } finally {
    await app.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
