import test from "node:test";
import assert from "node:assert/strict";
import {
  BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
  BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_OPEN_MS,
  BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS,
  BATTLE_MODES,
  ENEMY_AI_ARCHETYPES,
  SCREEN_IDS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { GameController } from "../src/game/app/GameController.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createBattleStateForRun } from "../src/game/state/runFactory.js";
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
  let receivedOptions = null;
  let persistCalls = 0;

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.battleSnapshot = {
    levelUpQueue: []
  };
  controller.syncBattleState = (options = {}) => {
    syncCalls += 1;
    receivedOptions = options;
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
  assert.equal(receivedOptions.allowEnemyFocusDuringEnemyTurn, true);
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

test("syncBattleState ignores enemy auto-selection during enemy turns unless explicitly allowed", () => {
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 5, 4);
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2)],
    enemyUnits: [enemyUnit]
  });
  battleState.turn.activeSide = TURN_SIDES.ENEMY;
  battleState.selection = { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y };
  const system = new BattleSystem(battleState);
  const controller = new GameController();

  controller.battleSystem = system;
  controller.syncBattleState();

  let battleUi = controller.getState().battleUi;
  assert.equal(battleUi.enemyFocus, null);

  controller.syncBattleState({ allowEnemyFocusDuringEnemyTurn: true });

  battleUi = controller.getState().battleUi;
  assert.equal(battleUi.enemyFocus.id, enemyUnit.id);
});

test("syncBattleState auto-detects post-action funds gains outside turn-start flow", async () => {
  const controller = new GameController();
  const previousState = createTestBattleState({ id: "funds-gain-check" });
  const nextState = structuredClone(previousState);
  nextState.player.funds += 100;
  let snapshot = previousState;
  let playedFundsGainId = null;

  controller.battleSystem = {
    getSnapshot() {
      return structuredClone(snapshot);
    }
  };
  controller.playPreparedFundsGain = async (fundsGainId) => {
    playedFundsGainId = fundsGainId;
  };

  controller.syncBattleState();
  snapshot = nextState;
  controller.syncBattleState();

  const battleUi = controller.getState().battleUi;
  assert.equal(battleUi.fundsGain?.side, TURN_SIDES.PLAYER);
  assert.equal(battleUi.fundsGain?.amount, 100);
  assert.equal(battleUi.fundsGain?.from, 900);
  assert.equal(battleUi.fundsGain?.to, 1000);
  assert.equal(battleUi.fundsGain?.pending, true);

  await Promise.resolve();

  assert.equal(playedFundsGainId, battleUi.fundsGain?.id);
});

test("syncBattleState creates and clears combat cutscene state for attack transitions", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  const system = new BattleSystem(battleState);
  const controller = new GameController();
  let cutsceneTimeoutCallback = null;
  let cutsceneTimeoutDelay = null;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.battleSystem = {
    getSnapshot() {
      return system.getSnapshot();
    }
  };

  controller.syncBattleState();
  assert.equal(system.attackTarget(attacker.id, defender.id), true);

  global.setTimeout = (callback, delay) => {
    cutsceneTimeoutCallback = callback;
    cutsceneTimeoutDelay = delay;
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    controller.syncBattleState();

    let state = controller.getState();
    assert.ok(state.battleUi.combatCutscene);
    assert.equal(state.battleUi.combatCutscene.playerUnit.id, attacker.id);
    assert.equal(state.battleUi.combatCutscene.enemyUnit.id, defender.id);
    assert.equal(
      state.battleUi.combatCutscene.steps[0].startMs,
      BATTLE_COMBAT_CUTSCENE_OPEN_MS + BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
    );
    assert.ok(state.battleUi.combatCutscene.steps[0].windowMs >= BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS);
    assert.ok(
      state.battleUi.combatCutscene.durationMs >=
        BATTLE_COMBAT_CUTSCENE_OPEN_MS +
          BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS +
          BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS +
          BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS +
          BATTLE_COMBAT_CUTSCENE_CLOSE_MS
    );
    assert.equal(controller.isBattleInputLocked(), true);
    assert.equal(typeof cutsceneTimeoutCallback, "function");
    assert.equal(cutsceneTimeoutDelay, state.battleUi.combatCutscene.durationMs);

    cutsceneTimeoutCallback();
    state = controller.getState();
    assert.equal(state.battleUi.combatCutscene, null);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
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

test("new run can advance to loadout once a commander is selected", () => {
  const controller = new GameController();

  controller.openNewRun();
  controller.openRunLoadout();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.RUN_LOADOUT);
  assert.equal(state.selectedCommanderId, "atlas");
});

test("run loadout purchases update counts and remaining funds", () => {
  const controller = new GameController();

  controller.state.metaState.unlockedUnitIds = ["grunt", "runner"];
  controller.state.runLoadout = {
    budget: 500,
    fundsRemaining: 500,
    units: []
  };

  controller.addRunLoadoutUnit("grunt");
  controller.addRunLoadoutUnit("runner");

  let state = controller.getState();
  assert.deepEqual(state.runLoadout.units, ["grunt", "runner"]);
  assert.equal(state.runLoadout.fundsRemaining, 0);

  controller.removeRunLoadoutUnit("grunt");

  state = controller.getState();
  assert.deepEqual(state.runLoadout.units, ["runner"]);
  assert.equal(state.runLoadout.fundsRemaining, 100);
});

test("run-mode captures award intel credits instead of funds", async () => {
  const controller = new GameController({
    async saveMeta() {},
    async saveSlot() {},
    async listSlots() {
      return [];
    }
  });
  const playerInfantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN,
    playerUnits: [playerInfantry]
  });
  battleState.player.funds = 0;
  const capturable = battleState.map.buildings.find((building) => building.type === "sector");
  capturable.owner = TURN_SIDES.ENEMY;
  playerInfantry.x = capturable.x;
  playerInfantry.y = capturable.y;
  battleState.pendingAction = {
    type: "move",
    unitId: playerInfantry.id,
    mode: "menu"
  };

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "run-1" };
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {};

  await controller.captureWithSelectedUnit();

  const state = controller.getState();
  assert.equal(state.metaState.metaCurrency, 2);
  assert.equal(state.runState.intelLedger.capture, 2);
  assert.equal(state.battleUi.notice?.title, "Intel Secured");
  assert.match(state.battleUi.notice?.message ?? "", /\+20 EXP/);
  assert.equal(controller.battleSystem.getStateForSave().player.funds, 0);
  assert.equal(controller.battleSystem.getStateForSave().player.units[0].experience, 20);
});

test("run-mode capture rewards only pay once per building even after a recapture", async () => {
  const controller = new GameController({
    async saveMeta() {},
    async saveSlot() {},
    async listSlots() {
      return [];
    }
  });
  const playerInfantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN,
    playerUnits: [playerInfantry]
  });
  const capturable = battleState.map.buildings.find((building) => building.type === "sector");
  capturable.owner = TURN_SIDES.ENEMY;
  playerInfantry.x = capturable.x;
  playerInfantry.y = capturable.y;
  battleState.pendingAction = {
    type: "move",
    unitId: playerInfantry.id,
    mode: "menu"
  };

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "run-1" };
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {};

  await controller.captureWithSelectedUnit();

  controller.battleSystem.state.map.buildings.find((building) => building.id === capturable.id).owner = TURN_SIDES.ENEMY;
  controller.battleSystem.state.pendingAction = {
    type: "move",
    unitId: playerInfantry.id,
    mode: "menu"
  };

  await controller.captureWithSelectedUnit();

  const state = controller.getState();
  assert.equal(state.metaState.metaCurrency, 2);
  assert.equal(state.runState.intelLedger.capture, 2);
  assert.equal(controller.battleSystem.getStateForSave().rewardLedger.captureIntel, 2);
  assert.equal(controller.battleSystem.getStateForSave().player.units[0].experience, 20);
});

test("run victories award five intel credits per cleared map", async () => {
  const controller = new GameController({
    async saveMeta() {},
    async saveSlot() {},
    async deleteSlot() {},
    async listSlots() {
      return [];
    }
  });
  const runState = {
    id: "run-test",
    seed: 99,
    slotId: "slot-1",
    commanderId: "atlas",
    mapIndex: 0,
    targetMapCount: 10,
    mapSequence: ["ashline-crossing"],
    roster: [],
    completedMaps: [],
    selectedRewards: [],
    pendingRewardChoices: []
  };
  const battleState = createBattleStateForRun(runState);
  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Battle won."
  };

  controller.state.runState = runState;
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {};

  await controller.advanceRun();

  const state = controller.getState();
  assert.equal(state.metaState.metaCurrency, 5);
  assert.equal(state.runState.intelLedger.mapClear, 5);
  assert.match(state.banner, /\+5 Intel Credits/);
});

test("selecting a reinforcement draft adds that unit to the run roster", async () => {
  const controller = new GameController();

  controller.state.runStatus = "reward";
  controller.state.runState = {
    id: "run-draft",
    roster: [],
    selectedRewards: [],
    pendingRewardChoices: [
      {
        id: "draft-runner",
        type: "unit",
        unitTypeId: "runner",
        name: "Runner",
        summary: "Draft Runner into your run roster for the next map."
      }
    ]
  };
  controller.startNextRunBattle = async () => {};

  await controller.selectRunReward("draft-runner");

  const state = controller.getState();
  assert.equal(state.runStatus, null);
  assert.equal(state.runState.roster.length, 1);
  assert.equal(state.runState.roster[0].unitTypeId, "runner");
  assert.deepEqual(state.runState.selectedRewards, []);
  assert.deepEqual(state.runState.pendingRewardChoices, []);
});

test("selecting a gear reward enters the equip flow instead of starting the next battle", async () => {
  const controller = new GameController();
  let startNextRunBattleCalls = 0;
  let persistCalls = 0;

  controller.state.runStatus = "reward";
  controller.state.runState = {
    id: "run-gear",
    roster: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0)],
    selectedRewards: [],
    pendingRewardChoices: [
      {
        id: "gear-aa-kit",
        type: "gear",
        name: "AA Kit",
        eligibleFamily: "infantry",
        summary: "Equip one infantry unit to attack and counter aircraft."
      }
    ]
  };
  controller.startNextRunBattle = async () => {
    startNextRunBattleCalls += 1;
  };
  controller.persistCurrentRun = async () => {
    persistCalls += 1;
  };

  await controller.selectRunReward("gear-aa-kit");

  const state = controller.getState();
  assert.equal(state.runStatus, "reward-equip");
  assert.equal(state.runState.pendingGearReward?.id, "gear-aa-kit");
  assert.equal(startNextRunBattleCalls, 0);
  assert.equal(persistCalls, 1);
});

test("equipping pending run gear writes it onto the selected roster unit", async () => {
  const controller = new GameController();
  let startNextRunBattleCalls = 0;
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0);
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 0, 0);
  medic.gear = { slot: "gear-field-meds" };

  controller.state.runStatus = "reward-equip";
  controller.state.runState = {
    id: "run-gear-equip",
    roster: [grunt, medic],
    selectedRewards: [],
    pendingRewardChoices: [],
    pendingGearReward: {
      id: "gear-aa-kit",
      type: "gear",
      name: "AA Kit",
      eligibleFamily: "infantry"
    }
  };
  controller.startNextRunBattle = async () => {
    startNextRunBattleCalls += 1;
  };

  await controller.equipPendingRunGear(medic.id);

  const state = controller.getState();
  const updatedMedic = state.runState.roster.find((unit) => unit.id === medic.id);
  assert.equal(state.runStatus, null);
  assert.equal(state.runState.pendingGearReward, null);
  assert.equal(updatedMedic.gear.slot, "gear-aa-kit");
  assert.equal(startNextRunBattleCalls, 1);
});

test("discarding a pending gear reward advances without changing the roster", async () => {
  const controller = new GameController();
  let startNextRunBattleCalls = 0;
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 0, 0);

  controller.state.runStatus = "reward-equip";
  controller.state.runState = {
    id: "run-gear-discard",
    roster: [runner],
    selectedRewards: [],
    pendingRewardChoices: [],
    pendingGearReward: {
      id: "gear-field-meds",
      type: "gear",
      name: "Field Medpack",
      eligibleFamily: "infantry"
    }
  };
  controller.startNextRunBattle = async () => {
    startNextRunBattleCalls += 1;
  };

  await controller.discardPendingRunGear();

  const state = controller.getState();
  assert.equal(state.runStatus, null);
  assert.equal(state.runState.pendingGearReward, null);
  assert.equal(state.runState.roster[0].gear.slot, null);
  assert.equal(startNextRunBattleCalls, 1);
});

test("forfeiting a run marks the battle as lost and preserves earned intel", async () => {
  const controller = new GameController();
  const runState = {
    id: "run-forfeit",
    slotId: "slot-1",
    intelLedger: {
      capture: 6,
      mapClear: 5,
      runClearBonus: 0,
      total: 11
    }
  };
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = runState;
  controller.state.runStatus = null;
  controller.state.battleUi.pauseMenuOpen = true;
  controller.state.metaState.metaCurrency = 11;
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {
    controller.syncBattleState();
  };

  await controller.abandonRun();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.BATTLE);
  assert.equal(state.runStatus, "failed");
  assert.equal(state.metaState.metaCurrency, 11);
  assert.equal(state.battleUi.pauseMenuOpen, false);
  assert.equal(state.battleSnapshot.victory?.winner, TURN_SIDES.ENEMY);
  assert.equal(state.battleSnapshot.rewardLedger?.forfeited, true);
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

test("sandbox commander overrides update both battle sides without saving a run", async () => {
  const controller = new GameController();
  const system = new BattleSystem(createTestBattleState());

  controller.battleSystem = system;
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.debugMode = true;

  await controller.debugSetCommanders({
    playerCommanderId: "atlas",
    enemyCommanderId: "sable",
    enemyAiArchetype: ENEMY_AI_ARCHETYPES.HQ_RUSH
  });

  const state = controller.getState();
  assert.equal(state.runState, null);
  assert.equal(state.battleSnapshot.player.commanderId, "atlas");
  assert.equal(state.battleSnapshot.enemy.commanderId, "sable");
  assert.equal(state.battleSnapshot.enemy.aiArchetype, ENEMY_AI_ARCHETYPES.HQ_RUSH);
});

test("sandbox debug spawning can equip infantry gear", async () => {
  const controller = new GameController();
  const system = new BattleSystem(createTestBattleState());

  controller.battleSystem = system;
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.debugMode = true;

  await controller.debugSpawnUnit({
    owner: TURN_SIDES.PLAYER,
    unitTypeId: "grunt",
    x: 3,
    y: 2,
    gearSlot: "gear-aa-kit",
    stats: {}
  });

  const spawnedUnit = controller
    .battleSystem.state.player.units.find((unit) => unit.x === 3 && unit.y === 2);
  const battleUi = controller.getState().battleUi;

  assert.ok(spawnedUnit);
  assert.equal(spawnedUnit.gear?.slot, "gear-aa-kit");
  assert.equal(spawnedUnit.gearState?.aaKitAmmo, 6);
  assert.equal(battleUi.playerFocus?.id, spawnedUnit.id);
  assert.equal(controller.getState().battleSnapshot.presentation.selectedTile.unit.gear?.slot, "gear-aa-kit");
  assert.equal(controller.getState().battleSnapshot.presentation.selectedTile.unit.gear?.ammo, 6);
});

test("sandbox debug spawning surfaces field medpack gear in the selected unit snapshot", async () => {
  const controller = new GameController();
  const system = new BattleSystem(createTestBattleState());

  controller.battleSystem = system;
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.debugMode = true;

  await controller.debugSpawnUnit({
    owner: TURN_SIDES.PLAYER,
    unitTypeId: "medic",
    x: 4,
    y: 2,
    gearSlot: "gear-field-meds",
    stats: {}
  });

  const selectedUnit = controller.getState().battleSnapshot.presentation.selectedTile.unit;
  assert.equal(controller.getState().battleUi.playerFocus?.id, selectedUnit.id);
  assert.equal(selectedUnit.name, "Medic");
  assert.equal(selectedUnit.gear?.slot, "gear-field-meds");
  assert.equal(selectedUnit.gear?.name, "Field Medpack");
});

test("sandbox selected-unit stat edits preserve gear state unless the gear changes", async () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const battleState = createTestBattleState({
    playerUnits: [grunt]
  });
  battleState.selection = {
    type: "unit",
    id: grunt.id,
    x: grunt.x,
    y: grunt.y
  };

  const controller = new GameController();
  const system = new BattleSystem(battleState);

  controller.battleSystem = system;
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.debugMode = true;

  await controller.debugApplySelectedUnitStats({
    gearSlot: "gear-aa-kit"
  });

  let selectedUnit = controller.getState().battleSnapshot.presentation.selectedTile.unit;
  assert.equal(selectedUnit.editable?.attack, 62);
  assert.equal(selectedUnit.gear?.slot, "gear-aa-kit");
  assert.equal(selectedUnit.gear?.ammo, 6);

  controller.battleSystem.state.player.units[0].gearState.aaKitAmmo = 2;

  await controller.debugApplySelectedUnitStats({
    hp: 77,
    attack: 9,
    gearSlot: "gear-aa-kit"
  });

  const internalUnit = controller.battleSystem.state.player.units[0];
  selectedUnit = controller.getState().battleSnapshot.presentation.selectedTile.unit;
  assert.equal(internalUnit.stats.attack, 9);
  assert.equal(internalUnit.current.hp, 77);
  assert.equal(selectedUnit.editable?.attack, 9);
  assert.equal(selectedUnit.editable?.hp, 77);
  assert.equal(selectedUnit.gear?.slot, "gear-aa-kit");
  assert.equal(selectedUnit.gear?.ammo, 2);
  assert.match(
    controller.getState().battleSnapshot.log[0] ?? "",
    /\[Debug\] Updated Grunt at 2,2 \(Gear: AA Kit\)\./
  );
});

test("sandbox selected-unit stat edits can clear and replace gear while resetting gear state only on gear change", async () => {
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  grunt.gear = { slot: "gear-aa-kit" };
  grunt.gearState = { aaKitAmmo: 2 };
  const battleState = createTestBattleState({
    playerUnits: [grunt]
  });
  battleState.selection = {
    type: "unit",
    id: grunt.id,
    x: grunt.x,
    y: grunt.y
  };

  const controller = new GameController();
  const system = new BattleSystem(battleState);

  controller.battleSystem = system;
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.debugMode = true;

  await controller.debugApplySelectedUnitStats({
    gearSlot: ""
  });

  let internalUnit = controller.battleSystem.state.player.units[0];
  let selectedUnit = controller.getState().battleSnapshot.presentation.selectedTile.unit;
  assert.equal(internalUnit.gear.slot, null);
  assert.deepEqual(internalUnit.gearState, {});
  assert.equal(selectedUnit.editable?.gearSlot, null);
  assert.equal(selectedUnit.gear, null);

  await controller.debugApplySelectedUnitStats({
    gearSlot: "gear-field-meds"
  });

  internalUnit = controller.battleSystem.state.player.units[0];
  selectedUnit = controller.getState().battleSnapshot.presentation.selectedTile.unit;
  assert.equal(internalUnit.gear.slot, "gear-field-meds");
  assert.deepEqual(internalUnit.gearState, {});
  assert.equal(selectedUnit.editable?.gearSlot, "gear-field-meds");
  assert.equal(selectedUnit.gear?.slot, "gear-field-meds");
});
