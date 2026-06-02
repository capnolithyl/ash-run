import { expect, test } from "@playwright/test";

async function setupMoveThenFireBattle(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screen--title")).toBeVisible({ timeout: 20_000 });

  await page.evaluate(async () => {
    const controller = window.__ASH_RUN_DEV__?.controller;

    if (!controller) {
      throw new Error("Ash Run dev hook is unavailable.");
    }

    const [{ BATTLE_MODES, SCREEN_IDS, TERRAIN_KEYS, TURN_SIDES }, { createBattlefield }, { BattleSystem }, { createUnitFromType }] =
      await Promise.all([
        import("/src/game/core/constants.js"),
        import("/src/game/content/mapFactory.js"),
        import("/src/game/simulation/battleSystem.js"),
        import("/src/game/simulation/unitFactory.js")
      ]);

    const createPlacedUnit = (unitTypeId, owner, x, y, overrides = {}) => {
      const unit = createUnitFromType(unitTypeId, owner, overrides.level ?? 1);
      unit.x = x;
      unit.y = y;

      if (overrides.current) {
        unit.current = {
          ...unit.current,
          ...overrides.current
        };
      }

      Object.assign(unit, {
        ...overrides,
        current: unit.current
      });

      return unit;
    };

    const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
    const defender = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 1);
    const map = createBattlefield({
      id: "playwright-combat-cutscene",
      name: "Playwright Combat Cutscene",
      theme: "ash",
      width: 6,
      height: 4,
      riverColumns: [],
      bridgeRows: []
    });

    map.tiles = Array.from({ length: map.height }, () =>
      Array.from({ length: map.width }, () => TERRAIN_KEYS.ROAD)
    );

    const battleState = {
      id: "battle-playwright-combat-cutscene",
      mode: BATTLE_MODES.SKIRMISH,
      seed: 1337,
      map,
      turn: {
        number: 1,
        activeSide: TURN_SIDES.PLAYER
      },
      player: {
        commanderId: "viper",
        funds: 900,
        charge: 0,
        recruitDiscount: 0,
        units: [attacker]
      },
      enemy: {
        commanderId: "rook",
        aiArchetype: "balanced",
        funds: 900,
        charge: 0,
        recruitDiscount: 0,
        units: [defender]
      },
      selection: {
        type: "unit",
        id: attacker.id,
        x: attacker.x,
        y: attacker.y
      },
      pendingAction: null,
      enemyTurn: null,
      levelUpQueue: [],
      log: [],
      victory: null
    };

    controller.battleSystem = new BattleSystem(battleState);
    controller.state.screen = SCREEN_IDS.BATTLE;
    controller.state.runState = null;
    controller.state.runStatus = null;
    controller.state.banner = "";
    controller.state.debugMode = false;
    controller.resetBattleUi();
    controller.syncBattleState();
  });

  await expect(page.locator(".battle-shell")).toBeVisible();
}

async function readBattleCameraState(page) {
  return page.evaluate(() => {
    const scene = window.__ASH_RUN_DEV__?.game?.scene?.getScene?.("BattleScene");
    const camera = scene?.cameras?.main;

    return {
      zoom: camera?.zoom ?? 0,
      scrollX: camera?.scrollX ?? 0,
      scrollY: camera?.scrollY ?? 0
    };
  });
}

test("left-edge battlefield zoom preserves the pointed screen anchor", async ({ page }) => {
  await setupMoveThenFireBattle(page);

  const result = await page.evaluate(() => {
    const scene = window.__ASH_RUN_DEV__?.game?.scene?.getScene?.("BattleScene");
    const snapshot = scene?.latestState?.battleSnapshot;

    if (!scene || !snapshot) {
      throw new Error("Battle scene snapshot is unavailable.");
    }

    scene.resetBattlefieldCamera();

    const layout = scene.getBoardLayout(snapshot);
    const screenX = layout.originX + layout.cellSize * 0.5;
    const screenY = layout.originY + layout.cellSize * 1.5;
    const before = scene.getWorldPointFromScreen(screenX, screenY);

    scene.zoomBattlefieldAt(screenX, screenY, 3);

    const after = scene.getWorldPointFromScreen(screenX, screenY);
    const camera = scene.cameras.main;

    return {
      before,
      after,
      cellSize: layout.cellSize,
      scrollX: camera.scrollX,
      zoom: camera.zoom
    };
  });

  expect(result.zoom).toBeGreaterThan(2.9);
  expect(result.scrollX).toBeLessThan(-1);
  expect(Math.abs(result.after.x - result.before.x)).toBeLessThan(result.cellSize * 0.15);
  expect(Math.abs(result.after.y - result.before.y)).toBeLessThan(result.cellSize * 0.15);
});

test("duel popup stays hidden until move animation finishes when fire is pressed mid-move", async ({
  page
}) => {
  await setupMoveThenFireBattle(page);
  const initialCamera = await readBattleCameraState(page);

  await page.evaluate(async () => {
    await window.__ASH_RUN_DEV__.controller.handleBattleTileClick(3, 1);
  });
  await expect(page.locator('[data-action="begin-attack"]')).toBeVisible();
  await page.evaluate(async () => {
    await window.__ASH_RUN_DEV__.controller.beginSelectedAttack();
  });
  await expect(page.locator('[data-action="cancel-attack"]')).toBeVisible();
  await page.evaluate(async () => {
    await window.__ASH_RUN_DEV__.controller.handleBattleTileClick(4, 1);
  });

  const cutsceneOverlay = page.locator(".battle-overlay--combat-cutscene");
  await expect(cutsceneOverlay).toHaveClass(/battle-overlay--combat-cutscene-hidden/, {
    timeout: 500
  });

  await page.waitForTimeout(250);
  await expect(cutsceneOverlay).toHaveClass(/battle-overlay--combat-cutscene-hidden/);

  await page.waitForFunction(
    () => {
      const overlay = document.querySelector(".battle-overlay--combat-cutscene");
      const canvas = document.querySelector("#game-root canvas");

      return (
        overlay?.classList.contains("battle-overlay--combat-cutscene-hidden") &&
        overlay?.classList.contains("battle-overlay--combat-cutscene-focusing") &&
        canvas &&
        window.getComputedStyle(canvas).filter !== "none"
      );
    },
    null,
    {
      polling: 50,
      timeout: 3_000
    }
  );
  await page.waitForFunction(
    () => {
      const scene = window.__ASH_RUN_DEV__?.game?.scene?.getScene?.("BattleScene");
      return (scene?.cameras?.main?.zoom ?? 0) > 1.05;
    },
    null,
    {
      polling: 50,
      timeout: 3_000
    }
  );
  await expect(cutsceneOverlay).not.toHaveClass(/battle-overlay--combat-cutscene-hidden/, {
    timeout: 1_500
  });
  await expect(cutsceneOverlay).toHaveCount(0, { timeout: 6_000 });

  const restoredCamera = await readBattleCameraState(page);
  expect(Math.abs(restoredCamera.zoom - initialCamera.zoom)).toBeLessThan(0.02);
  expect(Math.abs(restoredCamera.scrollX - initialCamera.scrollX)).toBeLessThan(1);
  expect(Math.abs(restoredCamera.scrollY - initialCamera.scrollY)).toBeLessThan(1);
});
