import test from "node:test";
import assert from "node:assert/strict";
import { SCREEN_IDS, TURN_SIDES } from "../src/game/core/constants.js";
import { GameController } from "../src/game/app/GameController.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

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

test("enemy-turn inspection clicks sync the HUD without persisting a save", async () => {
  const controller = new GameController();
  let syncCalls = 0;
  let persistCalls = 0;

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.battleSnapshot = {
    levelUpQueue: []
  };
  controller.syncBattleState = () => {
    syncCalls += 1;
  };
  controller.persistCurrentRun = async () => {
    persistCalls += 1;
  };
  controller.battleSystem = {
    handleTileSelection() {
      return true;
    },
    isEnemyTurnActive() {
      return true;
    }
  };

  await controller.handleBattleTileClick(3, 2);

  assert.equal(syncCalls, 1);
  assert.equal(persistCalls, 0);
});

test("syncBattleState preserves player focus when enemy focus updates", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 4);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  const system = new BattleSystem(battleState);
  const controller = new GameController();

  controller.battleSystem = system;

  assert.equal(system.handleTileSelection(playerUnit.x, playerUnit.y), true);
  controller.syncBattleState();

  let battleUi = controller.getState().battleUi;
  assert.equal(battleUi.playerFocus.id, playerUnit.id);
  assert.equal(battleUi.enemyFocus, null);

  assert.equal(system.handleTileSelection(enemyUnit.x, enemyUnit.y), true);
  controller.syncBattleState();

  battleUi = controller.getState().battleUi;
  assert.equal(battleUi.playerFocus.id, playerUnit.id);
  assert.equal(battleUi.enemyFocus.id, enemyUnit.id);
});

test("startSkirmish opens an unsaved battle with configured economy", async () => {
  const controller = new GameController();

  controller.state.metaState.unlockedCommanderIds = ["atlas", "viper"];
  assert.equal(controller.getState().skirmishSetup.step, "commanders");
  controller.updateSkirmishSetup({
    step: "map",
    playerCommanderId: "atlas",
    enemyCommanderId: "viper",
    mapId: "ashline-crossing",
    startingFunds: 2000,
    fundsPerBuilding: 250
  });

  await controller.startSkirmish();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.BATTLE);
  assert.equal(state.runState, null);
  assert.equal(state.skirmishSetup.step, "map");
  assert.equal(state.battleSnapshot.player.commanderId, "atlas");
  assert.equal(state.battleSnapshot.enemy.commanderId, "viper");
  assert.equal(state.battleSnapshot.economy.incomeByType.sector, 250);
});

test("skirmish battle tile clicks sync selection without a run save", async () => {
  const controller = new GameController();

  controller.state.metaState.unlockedCommanderIds = ["atlas", "viper"];
  controller.updateSkirmishSetup({
    step: "map",
    playerCommanderId: "atlas",
    enemyCommanderId: "viper",
    mapId: "ashline-crossing"
  });

  await controller.startSkirmish();

  const playerUnit = controller.getState().battleSnapshot.player.units[0];
  await controller.handleBattleTileClick(playerUnit.x, playerUnit.y);

  const state = controller.getState();
  assert.equal(state.runState, null);
  assert.equal(state.battleSnapshot.selection.type, "unit");
  assert.equal(state.battleSnapshot.selection.id, playerUnit.id);
});
