import test from "node:test";
import assert from "node:assert/strict";
import {
  BATTLE_ENEMY_MOVE_STEP_PAUSE_MS,
  BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
  BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS,
  BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_OPEN_MS,
  BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS,
  BATTLE_MODES,
  BATTLE_REINFORCEMENT_NOTICE_MS,
  BATTLE_REINFORCEMENT_NOTICE_TO_SPAWN_MS,
  BATTLE_REINFORCEMENT_SPAWN_STAGGER_MS,
  ENEMY_AI_ARCHETYPES,
  SCREEN_IDS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { GameController } from "../src/game/app/GameController.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
import { getMapById, MAP_POOL, replaceCustomMaps } from "../src/game/content/maps.js";
import { getDefaultUnlockedRunCardIds } from "../src/game/content/runUpgrades.js";
import { TUTORIAL_IDS } from "../src/game/content/tutorial.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { createBattleStateForRun } from "../src/game/state/runFactory.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

test.afterEach(() => {
  replaceCustomMaps([]);
});

test("initialize seeds custom maps before the first ready state emit", async () => {
  const emittedStates = [];
  const controller = new GameController({
    async loadMeta() {
      return null;
    },
    async listSlots() {
      return [];
    },
    async listCustomMaps() {
      return [
        {
          id: "runtime-seeded",
          name: "Runtime Seeded",
          theme: "ash",
          width: 8,
          height: 8
        }
      ];
    }
  });

  controller.subscribe((state) => {
    emittedStates.push(state);
  });

  await controller.initialize();

  assert.equal(controller.getState().ready, true);
  assert.equal(emittedStates.length, 1);
  assert.equal(getMapById("runtime-seeded")?.name, "Runtime Seeded");
  assert.equal(emittedStates[0].ready, true);
});

test("initialize expands stale run card unlocks to the current default catalog", async () => {
  const staleCardIds = ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"];
  const controller = new GameController({
    async loadMeta() {
      return {
        unlockedRunCardIds: staleCardIds
      };
    },
    async listSlots() {
      return [];
    },
    async listCustomMaps() {
      return [];
    }
  });

  await controller.initialize();

  const unlockedRunCardIds = controller.getState().metaState.unlockedRunCardIds;
  assert.ok(unlockedRunCardIds.includes("combat-stims-1"));
  assert.ok(unlockedRunCardIds.includes("field-repairs-1"));
  assert.ok(staleCardIds.every((cardId) => unlockedRunCardIds.includes(cardId)));
  assert.equal(unlockedRunCardIds.length, getDefaultUnlockedRunCardIds().length);
});

test("unit color option updates normalize and persist", async () => {
  let savedMeta = null;
  const controller = new GameController({
    async saveMeta(metaState) {
      savedMeta = structuredClone(metaState);
    }
  });

  await controller.updateOptions({
    playerColor: "blue",
    enemyColor: "purple"
  });

  assert.equal(controller.getState().metaState.options.playerColor, "blue");
  assert.equal(controller.getState().metaState.options.enemyColor, "purple");
  assert.equal(savedMeta.options.playerColor, "blue");
  assert.equal(savedMeta.options.enemyColor, "purple");

  await controller.updateOptions({
    enemyColor: "blue"
  });

  assert.equal(controller.getState().metaState.options.playerColor, "blue");
  assert.equal(controller.getState().metaState.options.enemyColor, "purple");
});

test("loading a stale run slot expands available run cards to the current catalog", async () => {
  const staleCardIds = ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"];
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });
  const controller = new GameController({
    async loadMeta() {
      return {
        unlockedRunCardIds: staleCardIds
      };
    },
    async listSlots() {
      return [{ slotId: "slot-1", exists: true }];
    },
    async listCustomMaps() {
      return [];
    },
    async loadSlot() {
      return {
        runState: {
          id: "run-stale-cards",
          seed: 99,
          slotId: "slot-1",
          commanderId: "viper",
          mapIndex: 4,
          targetMapCount: 10,
          mapSequence: [MAP_POOL[0].id],
          roster: [],
          completedMaps: [],
          selectedRewards: [],
          pendingRewardChoices: [],
          availableRunCardIds: staleCardIds
        },
        battleState
      };
    },
    async saveMeta() {}
  });

  await controller.initialize();
  await controller.loadSlot("slot-1");

  const availableRunCardIds = controller.getState().runState.availableRunCardIds;
  assert.ok(availableRunCardIds.includes("combat-stims-1"));
  assert.ok(availableRunCardIds.includes("field-repairs-1"));
  assert.equal(availableRunCardIds.length, getDefaultUnlockedRunCardIds().length);
});

test("advancing an already-open stale run expands the card pool before reward draw", async () => {
  const staleCardIds = ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"];
  const controller = new GameController({
    async saveMeta() {},
    async saveSlot() {},
    async deleteSlot() {},
    async listSlots() {
      return [];
    }
  });
  const runState = {
    id: "run-open-stale-cards",
    seed: 99,
    slotId: "slot-1",
    commanderId: "atlas",
    mapIndex: 0,
    targetMapCount: 10,
    mapSequence: [MAP_POOL[0].id],
    roster: [],
    completedMaps: [],
    selectedRewards: [],
    pendingRewardChoices: [],
    availableRunCardIds: staleCardIds
  };
  const battleState = createBattleStateForRun(runState);
  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Battle won."
  };

  controller.state.metaState.unlockedRunCardIds = staleCardIds;
  controller.state.runState = runState;
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {};

  await controller.advanceRun();

  const state = controller.getState();
  assert.equal(state.runState.availableRunCardIds.length, getDefaultUnlockedRunCardIds().length);
  assert.ok(state.runState.pendingRewardChoices.some((choice) => !staleCardIds.includes(choice.id)));
});

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

test("controller persists Falcon Air Strike targeting and confirms any selected tile", async () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 7, 4)]
  });
  battleState.player.commanderId = "falcon";
  battleState.player.charge = getCommanderPowerMax("falcon");
  const controller = new GameController();
  let persistCalls = 0;
  let overlaySide = null;

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.battleSystem = new BattleSystem(battleState);
  controller.persistCurrentRun = async () => {
    persistCalls += 1;
  };
  controller.playPowerOverlay = async (side) => {
    overlaySide = side;
    controller.syncBattleState();
  };
  controller.syncBattleState();

  await controller.activatePower();

  assert.equal(controller.getState().battleSnapshot.pendingAction.mode, "air-strike");
  assert.equal(
    controller.getState().battleSnapshot.player.charge,
    getCommanderPowerMax("falcon")
  );

  await controller.handleBattleTileClick(0, 5);

  assert.equal(overlaySide, TURN_SIDES.PLAYER);
  assert.equal(controller.battleSystem.getStateForSave().pendingAction, null);
  assert.deepEqual(controller.battleSystem.getLastPowerResult().center, { x: 0, y: 5 });
  assert.equal(controller.battleSystem.getStateForSave().player.charge, 0);
  assert.equal(persistCalls, 2);
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
      state.battleUi.combatCutscene.hudSnapshot.enemy.units[0].current.hp,
      defender.current.hp
    );
    assert.equal(
      state.battleUi.combatCutscene.steps[0].startMs,
      BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS +
        BATTLE_COMBAT_CUTSCENE_OPEN_MS +
        BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS
    );
    assert.ok(state.battleUi.combatCutscene.steps[0].windowMs >= BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS);
    assert.ok(
      state.battleUi.combatCutscene.durationMs >=
        BATTLE_COMBAT_CUTSCENE_OPEN_MS +
          BATTLE_COMBAT_CUTSCENE_FOCUS_IN_MS +
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
    mapId: MAP_POOL[0].id,
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

test("tutorial launch creates an unsaved tutorial battle", () => {
  let saveSlotCalls = 0;
  const controller = new GameController({
    async saveSlot() {
      saveSlotCalls += 1;
    },
    async listSlots() {
      return [];
    }
  });

  controller.startTutorialBattle();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.BATTLE);
  assert.equal(state.runState, null);
  assert.equal(state.runStatus, null);
  assert.equal(state.battleSnapshot.mode, BATTLE_MODES.TUTORIAL);
  assert.equal(state.battleSnapshot.map.id, TUTORIAL_IDS.MAP);
  assert.equal(state.tutorial.phase, "battle");
  assert.equal(state.battleSnapshot.presentation.tutorial.stepId, "mission-goal");
  assert.equal(saveSlotCalls, 0);
});

test("tutorial blocks wrong actions with a guide nudge", async () => {
  const controller = new GameController();

  controller.startTutorialBattle();
  controller.continueTutorialStep();
  await controller.handleBattleTileClick(2, 5);

  const state = controller.getState();
  assert.equal(state.battleSnapshot.presentation.tutorial.stepId, "select-grunt");
  assert.match(state.tutorial.nudge.message, /Grunt/);
  assert.equal(state.battleSnapshot.selection.type, null);
});

test("tutorial correct capture advances without writing a save", async () => {
  let saveSlotCalls = 0;
  const controller = new GameController({
    async saveSlot() {
      saveSlotCalls += 1;
    },
    async listSlots() {
      return [];
    }
  });

  controller.startTutorialBattle();
  controller.continueTutorialStep();
  await controller.handleBattleTileClick(1, 4);
  await controller.handleBattleTileClick(3, 4);
  await controller.captureWithSelectedUnit();

  const battleState = controller.battleSystem.getStateForSave();
  const captured = battleState.map.buildings.find((building) => building.id === TUTORIAL_IDS.NEUTRAL_SECTOR);
  const state = controller.getState();
  assert.equal(captured.owner, TURN_SIDES.PLAYER);
  assert.equal(state.battleSnapshot.presentation.tutorial.stepId, "building-brief");
  assert.equal(state.battleSnapshot.player.funds, 0);
  assert.equal(state.runState, null);
  assert.equal(saveSlotCalls, 0);
});

test("tutorial can return cleanly to the title", async () => {
  const controller = new GameController();

  controller.startTutorialBattle();
  await controller.returnToTitle();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.TITLE);
  assert.equal(state.battleSnapshot, null);
  assert.equal(state.runState, null);
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
    units: [],
    namingReviewOpen: false
  };

  controller.addRunLoadoutUnit("grunt");
  controller.addRunLoadoutUnit("runner");

  let state = controller.getState();
  assert.deepEqual(state.runLoadout.units.map((unit) => unit.unitTypeId), ["grunt", "runner"]);
  assert.equal(new Set(state.runLoadout.units.map((unit) => unit.name)).size, 2);
  assert.ok(state.runLoadout.units.every((unit) => unit.id && unit.nameRoll === 0));
  assert.equal(state.runLoadout.fundsRemaining, 0);

  controller.removeRunLoadoutUnit("grunt");

  state = controller.getState();
  assert.deepEqual(state.runLoadout.units.map((unit) => unit.unitTypeId), ["runner"]);
  assert.equal(state.runLoadout.fundsRemaining, 100);
});

test("opening squad names can be reviewed, rerolled, customized, and persisted into battle", async () => {
  const savedSlots = [];
  const controller = new GameController({
    async saveMeta() {},
    async saveSlot(slotId, record) {
      savedSlots.push({ slotId, record });
    },
    async listSlots() {
      return [];
    }
  });

  controller.openNewRun();
  controller.state.metaState.unlockedUnitIds = ["grunt"];
  controller.openRunLoadout();
  controller.addRunLoadoutUnit("grunt");
  const draftId = controller.getState().runLoadout.units[0].id;
  const firstName = controller.getState().runLoadout.units[0].name;

  await controller.startNewRun();
  assert.equal(controller.getState().screen, SCREEN_IDS.RUN_LOADOUT);

  controller.openRunLoadoutNamingReview();
  assert.equal(controller.getState().runLoadout.namingReviewOpen, true);
  controller.closeRunLoadoutNamingReview();
  assert.equal(controller.getState().runLoadout.namingReviewOpen, false);
  await controller.startNewRun();
  assert.equal(controller.getState().screen, SCREEN_IDS.RUN_LOADOUT);
  controller.openRunLoadoutNamingReview();
  controller.randomizeRunLoadoutUnitName(draftId);
  assert.notEqual(controller.getState().runLoadout.units[0].name, firstName);
  controller.updateRunLoadoutUnitName(draftId, "  Mara   Vale  ");
  await controller.startNewRun();

  const state = controller.getState();
  assert.equal(state.screen, SCREEN_IDS.BATTLE);
  assert.equal(state.runState.roster[0].id, draftId);
  assert.equal(state.runState.roster[0].name, "Mara Vale");
  assert.deepEqual(state.runState.unitNameHistory, ["Mara Vale"]);
  assert.equal(state.battleSnapshot.player.units[0].name, "Mara Vale");
  assert.equal(savedSlots.at(-1).record.version, 2);
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
    mapSequence: [MAP_POOL[0].id],
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
  let startNextRunBattleCalls = 0;
  controller.startNextRunBattle = async () => {
    startNextRunBattleCalls += 1;
  };

  await controller.selectRunReward("draft-runner");

  let state = controller.getState();
  assert.equal(state.runStatus, "reward-name-unit");
  assert.equal(state.runState.roster.length, 1);
  assert.equal(state.runState.roster[0].unitTypeId, "runner");
  assert.notEqual(state.runState.roster[0].name, "Runner");
  assert.equal(state.runState.pendingUnitNaming.unitId, state.runState.roster[0].id);
  assert.deepEqual(state.runState.selectedRewards, []);
  assert.deepEqual(state.runState.pendingRewardChoices, []);
  assert.equal(startNextRunBattleCalls, 0);

  await controller.updatePendingRunUnitName("Road Ace");
  await controller.confirmPendingRunUnitName();

  state = controller.getState();
  assert.equal(state.runStatus, null);
  assert.equal(state.runState.pendingUnitNaming, null);
  assert.equal(state.runState.roster[0].name, "Road Ace");
  assert.ok(state.runState.unitNameHistory.includes("Road Ace"));
  assert.equal(startNextRunBattleCalls, 1);
});

test("loading a pending reinforcement naming step restores the overlay state and custom identity", async () => {
  const rosterUnit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 0, 0, {
    name: "Redline"
  });
  const battleUnit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 0, 0, {
    id: rosterUnit.id
  });
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN,
    playerUnits: [battleUnit]
  });
  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Route secured."
  };
  const controller = new GameController({
    async loadSlot() {
      return {
        version: 2,
        runState: {
          id: "run-pending-name",
          seed: 42,
          slotId: "slot-1",
          commanderId: "atlas",
          mapIndex: 1,
          targetMapCount: 10,
          mapSequence: [MAP_POOL[0].id],
          roster: [rosterUnit],
          unitNameHistory: ["Redline"],
          completedMaps: [],
          selectedRewards: [],
          pendingRewardChoices: [],
          pendingGearReward: null,
          pendingUnitNaming: { unitId: rosterUnit.id, nameRoll: 0 }
        },
        battleState
      };
    },
    async saveMeta() {}
  });

  await controller.loadSlot("slot-1");

  const state = controller.getState();
  assert.equal(state.runStatus, "reward-name-unit");
  assert.equal(state.runState.roster[0].name, "Redline");
  assert.equal(state.battleSnapshot.player.units[0].name, "Redline");
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
  grunt.name = "Mara";
  medic.name = "Solace";
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
  assert.equal(updatedMedic.name, "Solace");
  assert.equal(state.runState.roster.find((unit) => unit.id === grunt.id).name, "Mara");
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
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.SKIRMISH,
    playerUnits: [playerUnit]
  });

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.battleSystem = new BattleSystem(battleState);
  controller.syncBattleState();
  await controller.handleBattleTileClick(playerUnit.x, playerUnit.y);

  const state = controller.getState();
  assert.equal(state.runState, null);
  assert.equal(state.battleSnapshot.selection.type, "unit");
  assert.equal(state.battleSnapshot.selection.id, playerUnit.id);
});

test("enemy turn sequence force-passes when enemy processing throws", async () => {
  const controller = new GameController();
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 1, 1);
  const enemyUnit = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 4, 1);
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN,
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  const system = new BattleSystem(battleState);
  let recruitmentCalls = 0;

  assert.equal(system.endTurn(), true);
  system.processEnemyTurnStep = () => {
    throw new Error("AI step failed");
  };
  system.performEnemyEndTurnRecruitment = () => {
    recruitmentCalls += 1;
    return { changed: false, deployments: [] };
  };
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "test-run" };
  controller.battleSystem = system;
  controller.persistCurrentRun = async () => {
    controller.syncBattleState();
  };

  await controller.runEnemyTurnSequence();

  const state = controller.getState();
  assert.equal(state.battleSnapshot.turn.activeSide, TURN_SIDES.PLAYER);
  assert.equal(state.battleSnapshot.enemyTurn, null);
  assert.equal(state.battleSnapshot.log[0], "Enemy command stalled. Enemy passed the turn.");
  assert.equal(recruitmentCalls, 0);
});

test("enemy turn sequence waits for the configured pause after movement steps", async () => {
  const controller = new GameController();
  const timeoutDelays = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let capturedHold = null;
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 4, 3);
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 3);
  const battleState = createTestBattleState({
    id: "movement-delay",
    mode: BATTLE_MODES.RUN,
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit],
    activeSide: TURN_SIDES.ENEMY
  });

  battleState.enemy.funds = 0;
  battleState.enemyTurn = {
    started: true,
    pendingAttack: null,
    pendingSlipstream: null,
    pendingUnitIds: [enemyUnit.id],
    pendingReinforcementDeployments: [],
    forcePassed: false
  };
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "run-movement-delay" };
  controller.battleSystem = new BattleSystem(battleState);
  controller.syncBattleState();
  controller.persistCurrentRun = async () => {};

  global.setTimeout = (callback, delayMs) => {
    timeoutDelays.push(delayMs);

    if (delayMs === BATTLE_ENEMY_MOVE_STEP_PAUSE_MS) {
      capturedHold = structuredClone(controller.state.battleUi.enemyMoveHold);
      assert.equal(capturedHold?.unitId, enemyUnit.id);
      assert.equal(capturedHold?.owner, TURN_SIDES.ENEMY);
      assert.deepEqual(capturedHold?.path, [
        { x: 6, y: 3 },
        { x: 5, y: 3 }
      ]);
      assert.deepEqual(capturedHold?.tile, { x: 5, y: 3 });
      assert.equal(capturedHold?.durationMs, BATTLE_ENEMY_MOVE_STEP_PAUSE_MS);
    }

    queueMicrotask(callback);
    return timeoutDelays.length;
  };
  global.clearTimeout = () => {};

  try {
    await controller.runEnemyTurnSequence();
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }

  assert.ok(timeoutDelays.includes(BATTLE_ENEMY_MOVE_STEP_PAUSE_MS));
  assert.ok(capturedHold);
  assert.equal(controller.getState().battleUi.enemyMoveHold, null);
});

test("enemy turn sequence does not expose move hold for non-move steps", async () => {
  const controller = new GameController();
  const timeoutDelays = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let hasPendingStep = true;
  let observedHold = false;
  const originalEmit = controller.emit.bind(controller);

  controller.emit = () => {
    observedHold ||= Boolean(controller.state.battleUi.enemyMoveHold);
    originalEmit();
  };
  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "run-attack-delay" };
  controller.state.battleSnapshot = null;
  controller.battleSystem = {
    startEnemyTurnActions() {
      return { changed: false };
    },
    getStateForSave() {
      return { mode: BATTLE_MODES.RUN, victory: null };
    },
    shouldEnemyUsePower() {
      return false;
    },
    getLastPowerResult() {
      return null;
    },
    hasPendingEnemyTurn() {
      return hasPendingStep;
    },
    processEnemyTurnStep() {
      hasPendingStep = false;
      return {
        changed: true,
        done: false,
        type: "attack",
        unitId: "enemy-gunner"
      };
    },
    performEnemyEndTurnRecruitment() {
      return { changed: false, deployments: [] };
    },
    finalizeEnemyTurn() {
      return { changed: false, incomeGain: null };
    }
  };
  controller.syncBattleState = () => {
    controller.state.battleSnapshot = {
      id: "battle-attack-delay",
      map: { id: "attack-delay-map", buildings: [], tiles: [] },
      turn: { activeSide: TURN_SIDES.ENEMY },
      player: { funds: 0, units: [] },
      enemy: { funds: 0, units: [] },
      selection: { type: null, id: null, x: null, y: null },
      levelUpQueue: [],
      victory: null
    };
    controller.emit();
  };
  controller.persistCurrentRun = async () => {};

  global.setTimeout = (callback, delayMs) => {
    timeoutDelays.push(delayMs);
    queueMicrotask(callback);
    return timeoutDelays.length;
  };
  global.clearTimeout = () => {};

  try {
    await controller.runEnemyTurnSequence();
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    controller.emit = originalEmit;
  }

  assert.equal(observedHold, false);
  assert.equal(controller.getState().battleUi.enemyMoveHold, null);
  assert.equal(timeoutDelays.includes(BATTLE_ENEMY_MOVE_STEP_PAUSE_MS), false);
});

test("enemy turn sequence announces and staggers queued reinforcements before finalizing", async () => {
  const controller = new GameController();
  const timeoutDelays = [];
  const notices = [];
  const focusSyncs = [];
  const events = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const pendingReinforcementIds = ["arrival-one", "arrival-two"];
  let lastSpawnedUnitId = null;
  let finalized = false;

  controller.state.screen = SCREEN_IDS.BATTLE;
  controller.state.runState = { id: "run-reinforcement-delay" };
  controller.state.battleSnapshot = null;
  controller.showBattleNotice = (notice) => {
    notices.push(notice);
    events.push("notice");
    return "notice-1";
  };
  controller.clearBattleNotice = (noticeId) => {
    events.push(`clear:${noticeId}`);
    return true;
  };
  controller.battleSystem = {
    startEnemyTurnActions() {
      return { changed: false };
    },
    getStateForSave() {
      return { mode: BATTLE_MODES.RUN, victory: null };
    },
    shouldEnemyUsePower() {
      return false;
    },
    getLastPowerResult() {
      return null;
    },
    hasPendingEnemyTurn() {
      return false;
    },
    performEnemyEndTurnRecruitment() {
      return { changed: false, deployments: [] };
    },
    prepareEnemyEndTurnReinforcements() {
      return {
        changed: true,
        deployments: [
          { unitId: "arrival-one", unitTypeId: "grunt", x: 6, y: 4 },
          { unitId: "arrival-two", unitTypeId: "runner", x: 6, y: 3 }
        ]
      };
    },
    hasPendingEnemyTurnReinforcements() {
      return pendingReinforcementIds.length > 0;
    },
    processNextEnemyTurnReinforcement() {
      const unitId = pendingReinforcementIds.shift();
      lastSpawnedUnitId = unitId ?? null;
      events.push(`spawn:${unitId}`);
      return {
        changed: Boolean(unitId),
        done: pendingReinforcementIds.length === 0,
        deployment: unitId ? { unitId } : null
      };
    },
    finalizeEnemyTurn() {
      events.push("finalize");
      finalized = pendingReinforcementIds.length === 0;
      return { changed: false, incomeGain: null };
    }
  };
  controller.syncBattleState = (options = {}) => {
    if (options.allowEnemyFocusDuringEnemyTurn) {
      focusSyncs.push(options);
      events.push(`focus:${lastSpawnedUnitId}`);
    }

    controller.state.battleSnapshot = {
      id: "battle-reinforcement-delay",
      map: { id: "reinforcement-delay-map", buildings: [], tiles: [] },
      turn: { activeSide: TURN_SIDES.ENEMY },
      player: { funds: 0, units: [] },
      enemy: { funds: 0, units: [] },
      selection: { type: null, id: null, x: null, y: null },
      levelUpQueue: [],
      victory: null
    };
  };
  controller.persistCurrentRun = async () => {};

  global.setTimeout = (callback, delayMs) => {
    timeoutDelays.push(delayMs);
    events.push(`delay:${delayMs}`);
    queueMicrotask(callback);
    return timeoutDelays.length;
  };
  global.clearTimeout = () => {};

  try {
    await controller.runEnemyTurnSequence();
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }

  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, "Reinforcements Arrive");
  assert.equal(notices[0].placement, "bottom");
  assert.equal(notices[0].persistent, true);
  assert.equal(notices[0].durationMs, BATTLE_REINFORCEMENT_NOTICE_MS);
  assert.ok(timeoutDelays.includes(BATTLE_REINFORCEMENT_NOTICE_TO_SPAWN_MS));
  assert.equal(
    timeoutDelays.filter((delayMs) => delayMs === BATTLE_REINFORCEMENT_SPAWN_STAGGER_MS).length,
    2
  );
  assert.equal(focusSyncs.length, 2);
  assert.equal(finalized, true);
  assert.deepEqual(events, [
    "notice",
    `delay:${BATTLE_REINFORCEMENT_NOTICE_TO_SPAWN_MS}`,
    "spawn:arrival-one",
    "focus:arrival-one",
    `delay:${BATTLE_REINFORCEMENT_SPAWN_STAGGER_MS}`,
    "spawn:arrival-two",
    "focus:arrival-two",
    `delay:${BATTLE_REINFORCEMENT_SPAWN_STAGGER_MS}`,
    "clear:notice-1",
    "finalize"
  ]);
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

test("sandbox map loading rebuilds the debug battle on the exact chosen family stage", () => {
  const controller = new GameController();

  controller.state.metaState.unlockedCommanderIds = ["atlas", "viper"];
  controller.startDebugRun();
  controller.state.battleUi.pauseMenuOpen = true;
  controller.battleSystem.setDebugCommanders({
    [TURN_SIDES.PLAYER]: "atlas",
    [TURN_SIDES.ENEMY]: "sable",
    enemyAiArchetype: ENEMY_AI_ARCHETYPES.HQ_RUSH
  });

  const currentBaseMapId = controller.getState().battleSnapshot.map.id.replace(/-run$/, "");
  const targetMap = MAP_POOL.find(
    (mapDefinition) => mapDefinition.id !== currentBaseMapId && mapDefinition.id.endsWith("-stage-7")
  ) ?? MAP_POOL.find((mapDefinition) => mapDefinition.id !== currentBaseMapId) ?? MAP_POOL[0];

  controller.startDebugRun({
    mapId: targetMap.id,
    keepPauseMenuOpen: true
  });

  const state = controller.getState();
  assert.equal(state.debugMode, true);
  assert.equal(state.screen, SCREEN_IDS.BATTLE);
  assert.equal(state.battleUi.pauseMenuOpen, true);
  assert.equal(state.battleSnapshot.map.id, `${targetMap.id}-run`);
  assert.equal(state.battleSnapshot.map.variantStage, targetMap.variantStage);
  assert.equal(state.battleSnapshot.player.commanderId, "atlas");
  assert.equal(state.battleSnapshot.enemy.commanderId, "sable");
  assert.equal(state.battleSnapshot.enemy.aiArchetype, ENEMY_AI_ARCHETYPES.HQ_RUSH);
  assert.equal(state.runState.mapSequence[0], `${targetMap.id}-run`);
  assert.equal(state.battleUi.notice?.title, "Sandbox Battlefield Loaded");

  controller.resetBattleUi();
});

test("sandbox upgrade card controls add, inspect, and clear run cards", () => {
  const controller = new GameController();

  controller.state.metaState.unlockedCommanderIds = ["atlas", "viper"];
  controller.startDebugRun();
  controller.state.battleUi.pauseMenuOpen = true;

  controller.debugAddRunCard("combat-stims-1");
  let state = controller.getState();

  assert.equal(state.debugMode, true);
  assert.equal(state.battleUi.pauseMenuOpen, true);
  assert.deepEqual(state.runState.ownedRunCardIds, ["combat-stims-1"]);
  assert.deepEqual(state.battleSnapshot.runCards.ownedCardIds, ["combat-stims-1"]);
  assert.equal(state.battleUi.notice?.title, "Upgrade Card Added");
  assert.ok(state.battleSnapshot.log.some((line) => line.includes("Combat Stims I")));

  controller.openRunCardsPanel();
  assert.equal(controller.getState().battleUi.runCardsOpen, true);
  controller.closeRunCardsPanel();
  assert.equal(controller.getState().battleUi.runCardsOpen, false);

  controller.debugClearRunCards();
  state = controller.getState();
  assert.deepEqual(state.runState.ownedRunCardIds, []);
  assert.deepEqual(state.battleSnapshot.runCards.ownedCardIds, []);
  assert.equal(state.battleUi.notice?.title, "Upgrade Cards Cleared");
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
