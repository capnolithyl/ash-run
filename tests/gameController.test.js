import test from "node:test";
import assert from "node:assert/strict";
import { SCREEN_IDS } from "../src/game/core/constants.js";
import { GameController } from "../src/game/app/GameController.js";

test("battle context action ignores duplicate right-click source events", async () => {
  const controller = new GameController();
  let contextActionCalls = 0;

  controller.battleSystem = {
    handleContextAction() {
      contextActionCalls += 1;
      return false;
    }
  };

  await controller.handleBattleContextAction();
  await controller.handleBattleContextAction();

  assert.equal(contextActionCalls, 1);
});

test("recruiting at the player unit cap shows a battle notice", async () => {
  const controller = new GameController();

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.battleSnapshot = {
    levelUpQueue: []
  };
  controller.battleSystem = {
    recruitUnit() {
      return false;
    },
    getPlayerUnitLimitStatus() {
      return {
        count: 6,
        limit: 6,
        isAtLimit: true
      };
    }
  };

  await controller.recruitUnit("grunt");

  assert.equal(controller.getState().battleUi.notice.title, "Unit Limit Reached");
  assert.equal(controller.getState().battleUi.notice.message, "6/6 units are already deployed.");

  controller.resetBattleUi();
});
