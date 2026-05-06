import test from "node:test";
import assert from "node:assert/strict";
import {
  BATTLE_MODES,
  ENEMY_AI_ARCHETYPES,
  TERRAIN_KEYS,
  TURN_SIDES
} from "../src/game/core/constants.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { renderBattleHudView } from "../src/ui/views/battleHudView.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

function renderHudForBattleState(battleState) {
  const system = new BattleSystem(battleState);

  return renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });
}

function getActionButton(html, action) {
  return (
    html.match(
      new RegExp(`<button(?:(?!</button>)[\\s\\S])*data-action="${action}"(?:(?!</button>)[\\s\\S])*</button>`)
    )?.[0] ?? ""
  );
}

test("battle HUD shows hovered enemy stats while targeting", () => {
  const attacker = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const defender = createPlacedUnit("runner", TURN_SIDES.ENEMY, 3, 2);
  const battleState = createTestBattleState({
    playerUnits: [attacker],
    enemyUnits: [defender]
  });
  battleState.selection = { type: "unit", id: attacker.id, x: attacker.x, y: attacker.y };

  const system = new BattleSystem(battleState);

  assert.equal(system.handleTileSelection(attacker.x, attacker.y), true);
  assert.equal(system.beginPendingAttack(), true);

  const state = {
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      playerFocus: null,
      enemyFocus: null,
      hoveredTile: {
        x: defender.x,
        y: defender.y
      }
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  };
  const html = renderBattleHudView(state);

  assert.match(html, /<h3>Target<\/h3>/);
  assert.match(html, /Runner/);
  assert.match(html, /selection-level-badge[^>]*>1<\/span>/);
  assert.match(html, /selection-health__value">100\/100<\/span>/);
  assert.match(html, /selection-stat-grid/);
  assert.match(html, /aria-label="ARM 45 \(\+3\)"/);
  assert.match(html, /aria-label="AMMO 7\/7"/);
  assert.match(html, /aria-label="STA 80\/80"/);
  assert.match(html, /Forecast/);
});

test("battle HUD shows terrain armor bonuses next to the armor stat", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit]
  });
  battleState.map.tiles[playerUnit.y][playerUnit.x] = TERRAIN_KEYS.FOREST;
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };

  const html = renderHudForBattleState(battleState);

  assert.match(html, /aria-label="ARM 6 \(\+2\)"/);
});

test("battle HUD shows building armor bonuses instead of stacking terrain under any building", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit]
  });
  battleState.map.tiles[playerUnit.y][playerUnit.x] = TERRAIN_KEYS.FOREST;
  battleState.map.buildings = battleState.map.buildings.filter(
    (building) => building.x !== playerUnit.x || building.y !== playerUnit.y
  );
  battleState.map.buildings.push({
    id: "neutral-sector-armor",
    type: "sector",
    owner: "neutral",
    x: playerUnit.x,
    y: playerUnit.y
  });
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };

  const html = renderHudForBattleState(battleState);

  assert.match(html, /aria-label="ARM 6 \(\+3\)"/);
  assert.doesNotMatch(html, /aria-label="ARM 6 \(\+5\)"/);
});

test("battle HUD replaces unload command menu with a cancellable unload prompt", () => {
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 2, 2, {
    hasMoved: true
  });
  const infantry = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  runner.transport.carryingUnitId = infantry.id;
  infantry.transport.carriedByUnitId = runner.id;
  const battleState = createTestBattleState({
    playerUnits: [runner, infantry],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4)]
  });
  battleState.selection = { type: "unit", id: runner.id, x: runner.x, y: runner.y };
  battleState.pendingAction = {
    type: "move",
    unitId: runner.id,
    mode: "unload",
    fromX: runner.x,
    fromY: runner.y,
    fromStamina: runner.current.stamina,
    toX: runner.x,
    toY: runner.y
  };
  const html = renderHudForBattleState(battleState);

  assert.match(html, /Unload Mode/);
  assert.match(html, /data-action="cancel-unload-choice"/);
  assert.doesNotMatch(html, /data-action="wait-unit"/);
});

test("battle HUD shows commander funds inside the commander panels without a top bar", () => {
  const battleState = createTestBattleState();
  const html = renderHudForBattleState(battleState);

  assert.match(html, /Passive: Shock Doctrine/);
  assert.match(html, /Power: Blitz Surge/);
  assert.match(html, /Passive: Estate Claim/);
  assert.match(html, /Power: Hostile Takeover/);
  assert.match(html, /Infantry and Runners gain \+2 attack; other units gain -2 attack/);
  assert.match(html, /Reserved for a future redesign/);
  assert.match(html, /assets\/img\/commanders\/viper\/Viper%20-%20Portrait\.png/);
  assert.match(html, /assets\/img\/commanders\/rook\/Rook%20-%20Portrait\.png/);
  assert.match(html, /commander-panel--player[\s\S]*?<h2>Viper<\/h2>[\s\S]*?data-funds-panel="player"/);
  assert.match(html, /commander-panel--enemy[\s\S]*?<h2>Rook<\/h2>[\s\S]*?data-funds-panel="enemy"/);
  assert.doesNotMatch(html, /commander-panel__sigil/);
  assert.doesNotMatch(html, /battle-topbar/);
});

test("battle HUD hides funds and recruitment in run mode", () => {
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });
  const building = battleState.map.buildings[0];
  building.owner = TURN_SIDES.PLAYER;
  battleState.selection = { type: "building", id: building.id, x: building.x, y: building.y };
  const html = renderHudForBattleState(battleState);

  assert.doesNotMatch(html, /data-funds-panel="player"/);
  assert.doesNotMatch(html, /data-funds-panel="enemy"/);
  assert.doesNotMatch(html, /<h3>Recruitment<\/h3>/);
});

test("battle HUD shows building ownership in the selection sidebar", () => {
  const battleState = createTestBattleState();
  const building = battleState.map.buildings[0];
  building.owner = TURN_SIDES.ENEMY;
  battleState.map.tiles[building.y][building.x] = TERRAIN_KEYS.FOREST;
  battleState.selection = { type: "building", id: building.id, x: building.x, y: building.y };

  const html = renderHudForBattleState(battleState);

  assert.match(html, /Owner: Enemy/);
  assert.match(html, /Armor bonus: \+4/);
  assert.doesNotMatch(html, /Income:/);
  assert.doesNotMatch(html, /<strong>Forest<\/strong>/);
});

test("battle HUD keeps player and enemy intel in separate sidebars", () => {
  const playerUnit = createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 2);
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  battleState.selection = { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y };
  const system = new BattleSystem(battleState);

  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y },
      enemyFocus: { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y }
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /battle-rail--left[\s\S]*?Player Intel[\s\S]*?Bruiser/);
  assert.match(html, /battle-rail--right[\s\S]*?Enemy Intel[\s\S]*?Runner/);
  assert.doesNotMatch(html, /Player Selection/);
  assert.doesNotMatch(html, /Enemy Selection/);
});

test("battle HUD shows hovered tile coordinates in the command feed instead of the selection card header", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit]
  });
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };
  const system = new BattleSystem(battleState);

  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: { x: 4, y: 1 },
      playerFocus: { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y },
      enemyFocus: null
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /<h3>Command Feed<\/h3>[\s\S]*?Tile 5,2/);
  assert.doesNotMatch(html, /<h3>Player Selection<\/h3>[\s\S]*?Tile 3,3/);
});

test("battle HUD only shows enemy selection details while an enemy is actively selected", () => {
  const playerUnit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const enemyUnit = createPlacedUnit("runner", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [playerUnit],
    enemyUnits: [enemyUnit]
  });
  battleState.selection = { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y };
  const system = new BattleSystem(battleState);

  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: { type: "unit", id: playerUnit.id, x: playerUnit.x, y: playerUnit.y },
      enemyFocus: { type: "unit", id: enemyUnit.id, x: enemyUnit.x, y: enemyUnit.y }
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /battle-rail--left[\s\S]*?Player Intel[\s\S]*?Grunt/);
  assert.match(html, /battle-rail--right[\s\S]*?Enemy Intel[\s\S]*?Enemy scans and hostile unit details will appear here\./);
  assert.doesNotMatch(html, /battle-rail--right[\s\S]*?Enemy Selection[\s\S]*?Runner/);
});

test("battle HUD renders transient battle notices", () => {
  const battleState = createTestBattleState();
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      playerFocus: null,
      enemyFocus: null,
      notice: {
        tone: "warning",
        title: "Unit Limit Reached",
        message: "6/6 units are already deployed.",
        createdAt: Date.now() - 600,
        durationMs: 2100
      },
      hoveredTile: null
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /battle-notice--warning/);
  assert.match(html, /--notice-duration:2100ms/);
  assert.match(html, /--notice-delay:-\d+ms/);
  assert.match(html, /Unit Limit Reached/);
  assert.match(html, /6\/6 units are already deployed/);
});

test("battle HUD renders commander power activation overlays", () => {
  const battleState = createTestBattleState();
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      playerFocus: null,
      enemyFocus: null,
      powerOverlay: {
        side: TURN_SIDES.PLAYER,
        commanderName: "Viper",
        title: "Blitz Surge",
        summary: "Infantry and Runners gain +3 attack; Infantry also gain +2 movement for 1 turn.",
        accent: "#ec775e"
      },
      hoveredTile: null
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /battle-overlay--power-player/);
  assert.match(html, /Player Power Activated/);
  assert.match(html, /Blitz Surge/);
  assert.match(html, /Viper/);
});

test("battle HUD includes drawer toggles and footer turn controls", () => {
  const battleState = createTestBattleState();
  const html = renderHudForBattleState(battleState);

  assert.match(html, /id="battle-intel-drawer"/);
  assert.match(html, /id="battle-command-drawer"/);
  assert.match(html, /class="battle-footer-actions"/);
  assert.match(html, /battle-footer-button--pause/);
  assert.match(html, /battle-footer-button--next/);
  assert.match(html, /battle-footer-button--end-turn/);
  assert.match(html, /for="battle-intel-drawer"[\s\S]*?>[\s\S]*?Intel/);
  assert.match(html, /for="battle-command-drawer"[\s\S]*?>[\s\S]*?Feed/);
  assert.match(html, /data-action="pause-battle"/);
  assert.match(html, /data-action="select-next-unit"/);
  assert.match(html, /data-action="end-turn"/);
});

test("battle HUD turns the power meter into the activation control", () => {
  const chargingState = createTestBattleState();
  chargingState.player.charge = getCommanderPowerMax(chargingState.player.commanderId) - 1;
  const chargingButton = getActionButton(renderHudForBattleState(chargingState), "activate-power");

  assert.match(chargingButton, /disabled/);
  assert.match(
    chargingButton,
    new RegExp(
      `commander-meter__value\">${chargingState.player.charge}\\/${getCommanderPowerMax(chargingState.player.commanderId)}<`
    )
  );

  const readyState = createTestBattleState();
  readyState.player.charge = getCommanderPowerMax(readyState.player.commanderId);
  const readyButton = getActionButton(renderHudForBattleState(readyState), "activate-power");

  assert.doesNotMatch(readyButton, /disabled/);
  assert.match(readyButton, /commander-power-button--charged/);
  assert.doesNotMatch(renderHudForBattleState(readyState), /Use Commander Power/);

  const enemyTurnState = createTestBattleState({
    activeSide: TURN_SIDES.ENEMY
  });
  enemyTurnState.player.charge = getCommanderPowerMax(enemyTurnState.player.commanderId);
  const enemyTurnButton = getActionButton(renderHudForBattleState(enemyTurnState), "activate-power");

  assert.match(enemyTurnButton, /disabled/);
  assert.match(renderHudForBattleState(enemyTurnState), /commander-power-button--readonly/);
});

test("battle HUD keeps the power meter visually active for the rest of the activation turn", () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2)],
    enemyUnits: [createPlacedUnit("grunt", TURN_SIDES.ENEMY, 3, 2)]
  });
  battleState.player.charge = getCommanderPowerMax(battleState.player.commanderId);
  const system = new BattleSystem(battleState);

  assert.equal(system.activatePower(), true);

  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /commander-power-button--active/);
  assert.match(html, /<span class="commander-meter__value">ACTIVE<\/span>/);
  assert.match(html, /Active This Turn/);
});

test("run-complete overlay includes intel breakdown and a progression button", () => {
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });
  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Route secured."
  };
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 10,
      targetMapCount: 10,
      intelLedger: {
        capture: 8,
        mapClear: 50,
        runClearBonus: 30,
        total: 88
      }
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: "complete",
    banner: "Run clear in 18 turns. +30 bonus Intel Credits."
  });

  assert.match(html, /Run Complete/);
  assert.match(html, /Intel Breakdown/);
  assert.match(html, /Total Earned/);
  assert.match(html, /data-action="open-progression"/);
});

test("run-lost overlay shows preserved intel and progression access after a forfeit", () => {
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });
  battleState.rewardLedger = {
    captureIntel: 4,
    captureExperience: 40,
    rewardedCaptureBuildingIds: ["sector-1"],
    forfeited: true
  };
  battleState.victory = {
    winner: TURN_SIDES.ENEMY,
    message: "Retreat ordered. Earned Intel Credits were extracted."
  };
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 3,
      targetMapCount: 10,
      intelLedger: {
        capture: 4,
        mapClear: 10,
        runClearBonus: 0,
        total: 14
      }
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: "failed",
    banner: "Run forfeited."
  });

  assert.match(html, /Run Lost/);
  assert.match(html, /earned Intel Credits were preserved/i);
  assert.match(html, /data-action="open-progression"/);
});

test("reward-equip overlay shows eligible squad units and skip control", () => {
  const battleState = createTestBattleState({
    mode: BATTLE_MODES.RUN
  });
  battleState.victory = {
    winner: TURN_SIDES.PLAYER,
    message: "Route secured."
  };
  const grunt = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 0, 0);
  const runner = createPlacedUnit("runner", TURN_SIDES.PLAYER, 0, 0);
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 1,
      targetMapCount: 10,
      roster: [grunt, runner],
      pendingGearReward: {
        id: "gear-aa-kit",
        type: "gear",
        name: "AA Kit",
        eligibleFamily: "infantry",
        summary: "Equip one infantry unit to attack and counter aircraft."
      }
    },
    battleUi: {
      pauseMenuOpen: false,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    debugMode: false,
    runStatus: "reward-equip",
    banner: ""
  });

  assert.match(html, /Equip AA Kit/);
  assert.match(html, /data-action="equip-run-gear"/);
  assert.match(html, /Grunt/);
  assert.doesNotMatch(html, /Runner<\/strong><br \/>/);
  assert.match(html, /data-action="discard-run-gear"/);
});

test("battle HUD shows gear details and AA ammo in the selection sidebar", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  unit.gear = { slot: "gear-aa-kit" };
  unit.gearState = { aaKitAmmo: 4 };
  const battleState = createTestBattleState({
    playerUnits: [unit]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const html = renderHudForBattleState(battleState);

  assert.match(html, /<strong>Gear<\/strong>/);
  assert.match(html, /AA Kit/);
  assert.match(html, /AA Ammo:<\/strong> 4/);
});

test("battle HUD places experience above HP and shows weapon and armor profiles for selected units", () => {
  const unit = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 2, 2);
  const battleState = createTestBattleState({
    playerUnits: [unit]
  });
  battleState.selection = { type: "unit", id: unit.id, x: unit.x, y: unit.y };

  const html = renderHudForBattleState(battleState);

  assert.match(
    html,
    /<strong>Grunt<\/strong>[\s\S]*?<strong>Experience<\/strong>[\s\S]*?selection-health__label">HP<\/span>/
  );
  assert.match(html, /<strong>Rifle<\/strong>/);
  assert.match(html, /<strong>Infantry Armor<\/strong>/);
  assert.doesNotMatch(html, /Weapon Profile/);
  assert.doesNotMatch(html, /Armor Profile/);
});

test("medics with field medpacks show separate heal and medpack actions", () => {
  const medic = createPlacedUnit("medic", TURN_SIDES.PLAYER, 2, 2);
  medic.gear = { slot: "gear-field-meds" };
  medic.gearState = {};
  const ally = createPlacedUnit("grunt", TURN_SIDES.PLAYER, 3, 2, {
    current: {
      hp: 10
    }
  });
  const enemy = createPlacedUnit("grunt", TURN_SIDES.ENEMY, 6, 4);
  const battleState = createTestBattleState({
    playerUnits: [medic, ally],
    enemyUnits: [enemy]
  });
  battleState.selection = { type: "unit", id: medic.id, x: medic.x, y: medic.y };
  battleState.pendingAction = {
    type: "move",
    unitId: medic.id,
    mode: "menu",
    fromX: medic.x,
    fromY: medic.y,
    fromStamina: medic.current.stamina,
    toX: medic.x,
    toY: medic.y
  };

  const html = renderHudForBattleState(battleState);

  assert.match(html, /data-action="use-support">Heal<\/button>/);
  assert.match(html, /data-action="use-medpack">Medpack<\/button>/);
});

test("debug pause menu groups tools into accordion sections", () => {
  const battleState = createTestBattleState({
    playerUnits: [createPlacedUnit("bruiser", TURN_SIDES.PLAYER, 2, 2)]
  });
  battleState.selection = { type: "unit", id: battleState.player.units[0].id, x: 2, y: 2 };
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: true,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    metaState: {
      options: {
        showGrid: true,
        screenShake: true,
        masterVolume: 0.4,
        muted: false
      }
    },
    debugMode: true,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /class="pause-section" open/);
  assert.match(html, /<strong>Debug Toolkit<\/strong>/);
  assert.match(html, /class="debug-section" open/);
  assert.match(html, /<strong>Spawn Unit<\/strong>/);
  assert.match(html, /<strong>Commander Overrides<\/strong>/);
  assert.match(html, /<strong>Battle Shortcuts<\/strong>/);
  assert.match(html, /<strong>Selected Unit Overrides<\/strong>/);
  assert.match(html, /data-debug-field="spawn-owner"/);
  assert.match(html, /data-debug-field="player-commander"/);
  assert.match(html, /data-debug-field="enemy-commander"/);
  assert.match(html, /data-debug-field="enemy-ai-archetype"/);
  assert.match(html, /data-debug-field="unit-hp"/);
});

test("debug spawn fields start with the selected unit type defaults", () => {
  const defaultUnit = UNIT_CATALOG.grunt;
  const battleState = createTestBattleState();
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: true,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    metaState: {
      options: {
        showGrid: true,
        screenShake: true,
        masterVolume: 0.4,
        muted: false
      }
    },
    debugMode: true,
    runStatus: null,
    banner: ""
  });

  assert.match(html, new RegExp(`data-stat-attack="${defaultUnit.attack}"`));
  assert.match(html, /value="grunt"[\s\S]*selected/);
  assert.match(html, new RegExp(`data-debug-field="spawn-attack" type="number" value="${defaultUnit.attack}"`));
  assert.match(
    html,
    new RegExp(`data-debug-field="spawn-max-health" type="number" value="${defaultUnit.maxHealth}"`)
  );
  assert.match(
    html,
    new RegExp(`data-debug-field="spawn-max-ammo" type="number" value="${defaultUnit.ammoMax}"`)
  );
});

test("debug commander overrides reflect the current battle commanders", () => {
  const battleState = createTestBattleState();
  battleState.player.commanderId = "atlas";
  battleState.enemy.commanderId = "sable";
  battleState.enemy.aiArchetype = ENEMY_AI_ARCHETYPES.HQ_RUSH;
  const system = new BattleSystem(battleState);
  const html = renderBattleHudView({
    battleSnapshot: system.getSnapshot(),
    runState: {
      mapIndex: 0,
      targetMapCount: 10
    },
    battleUi: {
      pauseMenuOpen: true,
      confirmAbandon: false,
      fundsGain: null,
      hoveredTile: null,
      playerFocus: null,
      enemyFocus: null
    },
    metaState: {
      options: {
        showGrid: true,
        screenShake: true,
        masterVolume: 0.4,
        muted: false
      }
    },
    debugMode: true,
    runStatus: null,
    banner: ""
  });

  assert.match(html, /Atlas vs Sable \| HQ Rush AI/);
  assert.match(html, /data-debug-field="player-commander"[\s\S]*value="atlas" selected/);
  assert.match(html, /data-debug-field="enemy-commander"[\s\S]*value="sable" selected/);
  assert.match(html, /data-debug-field="enemy-ai-archetype"[\s\S]*value="hq-rush" selected/);
  assert.match(html, /data-action="debug-apply-commanders"/);
});
