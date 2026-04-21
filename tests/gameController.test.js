import test from "node:test";
import assert from "node:assert/strict";
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
