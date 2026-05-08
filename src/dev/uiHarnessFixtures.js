import {
  BATTLE_MODES,
  BUILDING_KEYS,
  SCREEN_IDS,
  SLOT_IDS,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../game/core/constants.js";
import { createBlankMapDefinition, createDefaultMapEditorState } from "../game/content/mapEditor.js";
import { RUN_UPGRADES } from "../game/content/runUpgrades.js";
import { createBattlefield } from "../game/content/mapFactory.js";
import { createDefaultMetaState, createEmptySlotSummaries } from "../game/state/defaults.js";
import { BattleSystem } from "../game/simulation/battleSystem.js";
import { createUnitFromType } from "../game/simulation/unitFactory.js";

function createPlacedUnit(unitTypeId, owner, x, y, overrides = {}) {
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
}

function createTestBattleState({
  id = "ui-harness",
  width = 8,
  height = 6,
  playerUnits = [],
  enemyUnits = [],
  activeSide = TURN_SIDES.PLAYER,
  seed = 1337,
  mode = BATTLE_MODES.SKIRMISH
} = {}) {
  const map = createBattlefield({
    id,
    name: "UI Harness",
    theme: "Simulation Harness",
    width,
    height,
    riverColumns: [],
    bridgeRows: []
  });

  return {
    id: `battle-${id}`,
    mode,
    seed,
    map,
    turn: {
      number: 1,
      activeSide
    },
    player: {
      commanderId: "viper",
      funds: 900,
      charge: 0,
      recruitDiscount: 0,
      units: playerUnits
    },
    enemy: {
      commanderId: "rook",
      funds: 900,
      charge: 0,
      recruitDiscount: 0,
      units: enemyUnits
    },
    selection: {
      type: null,
      id: null,
      x: null,
      y: null
    },
    pendingAction: null,
    enemyTurn: null,
    levelUpQueue: [],
    log: [
      "Mission briefing uploaded.",
      "Scanner sweep complete.",
      "Awaiting deployment orders."
    ],
    victory: null
  };
}

function createBaseMetaState() {
  const metaState = createDefaultMetaState();
  metaState.latestClearTurnCount = 67;
  metaState.bestClearTurnCount = 59;
  return metaState;
}

function createTitleState() {
  const slots = createEmptySlotSummaries();
  slots[0] = {
    slotId: SLOT_IDS[0],
    exists: true,
    updatedAt: new Date("2026-04-29T08:30:00.000Z").toISOString(),
    summary: {
      commanderId: "atlas",
      mapIndex: 5
    }
  };

  return {
    screen: SCREEN_IDS.TITLE,
    slots,
    metaState: createBaseMetaState()
  };
}

function createCommanderSelectState() {
  const slots = createEmptySlotSummaries();
  slots[1] = {
    slotId: SLOT_IDS[1],
    exists: true,
    updatedAt: new Date("2026-04-27T16:45:00.000Z").toISOString(),
    summary: {
      commanderId: "viper",
      mapIndex: 3
    }
  };

  return {
    screen: SCREEN_IDS.COMMANDER_SELECT,
    selectedSlotId: SLOT_IDS[1],
    selectedCommanderId: "atlas",
    slots,
    metaState: createBaseMetaState()
  };
}

function createRunLoadoutState() {
  const metaState = createBaseMetaState();
  metaState.unlockedUnitIds = ["grunt", "longshot", "runner", "bruiser", "medic", "skyguard"];

  return {
    screen: SCREEN_IDS.RUN_LOADOUT,
    selectedSlotId: SLOT_IDS[1],
    selectedCommanderId: "atlas",
    runLoadout: {
      budget: 1000,
      fundsRemaining: 150,
      units: ["grunt", "grunt", "longshot", "bruiser"]
    },
    metaState
  };
}

function createSkirmishSetupState(step = "commanders") {
  const metaState = createBaseMetaState();

  return {
    screen: SCREEN_IDS.SKIRMISH_SETUP,
    slots: [],
    metaState,
    skirmishSetup: {
      step,
      playerCommanderId: "atlas",
      enemyCommanderId: "rook",
      mapId: "ashline-crossing",
      startingFunds: 1400,
      fundsPerBuilding: 150
    }
  };
}

function createOptionsState() {
  const metaState = createBaseMetaState();
  metaState.options = {
    ...metaState.options,
    showGrid: false,
    screenShake: true,
    masterVolume: 0.65,
    muted: false
  };

  return {
    screen: SCREEN_IDS.OPTIONS,
    metaState
  };
}

function createProgressionState() {
  const metaState = createBaseMetaState();
  metaState.metaCurrency = 340;
  metaState.unlockedUnitIds = ["grunt", "breaker", "runner", "skyguard", "gunship", "longshot"];
  metaState.unlockedRunCardIds = ["passive-drill", "gear-aa-kit"];

  return {
    screen: SCREEN_IDS.PROGRESSION,
    metaState
  };
}

function createMapEditorState() {
  const mapData = createBlankMapDefinition({
    id: "editor-preview",
    name: "Editor Preview",
    playerSpawns: [{ x: 1, y: 1 }],
    enemySpawns: [{ x: 4, y: 4 }],
    buildings: [
      {
        id: "editor-preview-player-command",
        type: BUILDING_KEYS.COMMAND,
        owner: TURN_SIDES.PLAYER,
        x: 1,
        y: 1
      },
      {
        id: "editor-preview-neutral-hospital",
        type: BUILDING_KEYS.HOSPITAL,
        owner: "neutral",
        x: 3,
        y: 2
      }
    ]
  });

  return {
    screen: SCREEN_IDS.MAP_EDITOR,
    mapEditor: {
      ...createDefaultMapEditorState(mapData),
      selectedTile: { x: 1, y: 1 }
    },
    metaState: createBaseMetaState()
  };
}

function createBaseBattleScreenState() {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  battleState.map.tiles[attacker.y][attacker.x] = TERRAIN_KEYS.FOREST;
  battleState.selection = { type: "unit", id: attacker.id, x: attacker.x, y: attacker.y };

  const system = new BattleSystem(battleState);
  system.handleTileSelection(attacker.x, attacker.y);
  system.beginPendingAttack();

  return {
    screen: SCREEN_IDS.BATTLE,
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      notice: null,
      powerOverlay: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: null,
    banner: "",
    metaState: createBaseMetaState()
  };
}

function createBattleTargetingState() {
  const state = createBaseBattleScreenState();
  const defender = state.battleSnapshot.enemy.units[0];

  state.battleUi.notice = {
    id: "notice-preview",
    title: "Intel Update",
    message: "Target acquired. Forecast is live.",
    tone: "info",
    createdAt: 1700000000000,
    durationMs: 2100
  };
  state.battleUi.hoveredTile = {
    x: defender.x,
    y: defender.y
  };

  return state;
}

function createBattleCommanderLayoutState() {
  const playerUnit = createPlacedUnit("runner", TURN_SIDES.PLAYER, 1, 4, {
    level: 1,
    current: {
      stamina: 8
    }
  });
  const enemyUnit = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 1, {
    level: 1
  });
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  battleState.player.commanderId = "atlas";
  battleState.player.charge = 275;
  battleState.enemy.commanderId = "echo";
  battleState.enemy.charge = 200;
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };

  const system = new BattleSystem(battleState);

  return {
    screen: SCREEN_IDS.BATTLE,
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      notice: null,
      powerOverlay: null,
      hoveredTile: null,
      playerFocus: { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y },
      enemyFocus: { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y }
    },
    debugMode: false,
    runStatus: null,
    banner: "",
    metaState: createBaseMetaState()
  };
}

function createBattlePauseState() {
  const state = createBaseBattleScreenState();
  const playerUnit = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 2, {
    current: {
      hp: 17,
      stamina: 4
    }
  });
  const enemyUnit = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };

  const system = new BattleSystem(battleState);

  state.battleSnapshot = system.getSnapshot();
  state.runState = {
    mapIndex: 2,
    targetMapCount: 10
  };
  state.battleUi.pauseMenuOpen = true;
  state.battleUi.playerFocus = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };
  state.battleUi.enemyFocus = { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y };
  state.debugMode = true;

  return state;
}

function createBattleRewardState() {
  const state = createBaseBattleScreenState();
  state.runStatus = "reward";
  state.banner = "+5 Intel Credits banked. Choose your next edge.";
  state.runState = {
    mapIndex: 3,
    targetMapCount: 10,
    pendingRewardChoices: RUN_UPGRADES.slice(0, 3)
  };
  state.battleSnapshot = {
    ...state.battleSnapshot,
    victory: {
      winner: TURN_SIDES.PLAYER,
      message: "Battle won."
    }
  };

  return state;
}

function createBattleRunCompleteState() {
  const state = createBaseBattleScreenState();
  state.runStatus = "complete";
  state.banner = "Ten maps secured. Route held end to end.";
  state.runState = {
    mapIndex: 10,
    targetMapCount: 10,
    intelLedger: {
      capture: 12,
      mapClear: 50,
      runClearBonus: 30,
      total: 92
    }
  };
  state.battleSnapshot = {
    ...state.battleSnapshot,
    victory: {
      winner: TURN_SIDES.PLAYER,
      message: "Run complete."
    }
  };

  return state;
}

function createBattleRunLostState() {
  const state = createBaseBattleScreenState();
  state.runStatus = "failed";
  state.banner = "Run forfeited.";
  state.runState = {
    mapIndex: 4,
    targetMapCount: 10,
    intelLedger: {
      capture: 6,
      mapClear: 15,
      runClearBonus: 0,
      total: 21
    }
  };
  state.battleSnapshot = {
    ...state.battleSnapshot,
    rewardLedger: {
      captureIntel: 6,
      captureExperience: 60,
      rewardedCaptureBuildingIds: ["sector-alpha", "sector-beta", "sector-gamma"],
      forfeited: true
    },
    victory: {
      winner: TURN_SIDES.ENEMY,
      message: "Enemy counteroffensive broke the line."
    }
  };

  return state;
}

function createBattleLevelUpState() {
  const state = createBaseBattleScreenState();
  state.battleSnapshot = {
    ...state.battleSnapshot,
    levelUpQueue: [
      {
        unitId: "level-up-grunt",
        unitName: "Grunt",
        previousLevel: 2,
        newLevel: 3,
        statGains: [
          { label: "Attack", delta: 1, previousValue: 7, nextValue: 8 },
          { label: "Armor", delta: 1, previousValue: 2, nextValue: 3 },
          { label: "Max HP", delta: 2, previousValue: 18, nextValue: 20 }
        ]
      }
    ]
  };

  return state;
}

export const UI_HARNESS_SCENES = [
  { id: "title", label: "Title Screen", locator: "#ui-root" },
  { id: "commander-select", label: "Commander Select", locator: "#ui-root" },
  { id: "run-loadout", label: "Run Loadout", locator: "#ui-root" },
  { id: "skirmish-commanders", label: "Skirmish Commanders", locator: "#ui-root" },
  { id: "skirmish-map", label: "Skirmish Map", locator: "#ui-root" },
  { id: "options", label: "Options", locator: "#ui-root" },
  { id: "progression", label: "Progression", locator: "#ui-root" },
  { id: "map-editor", label: "Map Editor", locator: ".battle-shell" },
  { id: "battle-commander-layout", label: "Battle Commander Layout", locator: ".battle-shell" },
  { id: "battle-targeting", label: "Battle HUD Targeting", locator: ".battle-shell" },
  { id: "battle-pause", label: "Battle HUD Pause", locator: ".battle-shell" },
  { id: "battle-reward", label: "Battle Reward", locator: ".battle-shell" },
  { id: "battle-run-complete", label: "Battle Run Complete", locator: ".battle-shell" },
  { id: "battle-run-lost", label: "Battle Run Lost", locator: ".battle-shell" },
  { id: "battle-level-up", label: "Battle Level Up", locator: ".battle-shell" }
];

export function createUiHarnessScene(sceneId) {
  switch (sceneId) {
    case "commander-select":
      return {
        sceneId,
        state: createCommanderSelectState()
      };
    case "run-loadout":
      return {
        sceneId,
        state: createRunLoadoutState()
      };
    case "skirmish-commanders":
      return {
        sceneId,
        state: createSkirmishSetupState("commanders")
      };
    case "skirmish-map":
      return {
        sceneId,
        state: createSkirmishSetupState("map")
      };
    case "options":
      return {
        sceneId,
        state: createOptionsState()
      };
    case "progression":
      return {
        sceneId,
        state: createProgressionState()
      };
    case "map-editor":
      return {
        sceneId,
        state: createMapEditorState()
      };
    case "battle-targeting":
      return {
        sceneId,
        state: createBattleTargetingState()
      };
    case "battle-commander-layout":
      return {
        sceneId,
        state: createBattleCommanderLayoutState()
      };
    case "battle-pause":
      return {
        sceneId,
        state: createBattlePauseState()
      };
    case "battle-reward":
      return {
        sceneId,
        state: createBattleRewardState()
      };
    case "battle-run-complete":
      return {
        sceneId,
        state: createBattleRunCompleteState()
      };
    case "battle-run-lost":
      return {
        sceneId,
        state: createBattleRunLostState()
      };
    case "battle-level-up":
      return {
        sceneId,
        state: createBattleLevelUpState()
      };
    case "title":
    default:
      return {
        sceneId: "title",
        state: createTitleState()
      };
  }
}
