import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { getCommanderPowerMax } from "../src/game/content/commanders.js";
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
  assert.match(html, /HP 20\/20/);
  assert.match(html, /Forecast/);
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
  assert.match(html, /Passive: War Budget/);
  assert.match(html, /Power: Liquidation/);
  assert.match(html, /Infantry and Runners gain \+2 attack; other units gain -2 attack/);
  assert.match(html, /Spend all funds\. All units gain \+1 attack per 300 funds spent/);
  assert.match(html, /assets\/img\/commanders\/viper\/Viper%20-%20Portrait\.png/);
  assert.match(html, /assets\/img\/commanders\/rook\/Rook%20-%20Portrait\.png/);
  assert.match(html, /commander-panel--player[\s\S]*?<h2>Viper<\/h2>[\s\S]*?data-funds-panel="player"/);
  assert.match(html, /commander-panel--enemy[\s\S]*?<h2>Rook<\/h2>[\s\S]*?data-funds-panel="enemy"/);
  assert.doesNotMatch(html, /commander-panel__sigil/);
  assert.doesNotMatch(html, /battle-topbar/);
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

  assert.match(html, /battle-rail--left[\s\S]*?Player Selection[\s\S]*?Bruiser/);
  assert.match(html, /battle-rail--right[\s\S]*?Enemy Selection[\s\S]*?Runner/);
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
  assert.match(html, /for="battle-intel-drawer">Intel/);
  assert.match(html, /for="battle-command-drawer">Feed/);
  assert.match(html, /data-action="pause-battle"/);
  assert.match(html, /data-action="select-next-unit"/);
  assert.match(html, /data-action="end-turn"/);
});

test("battle HUD turns the power meter into the activation control", () => {
  const chargingState = createTestBattleState();
  chargingState.player.charge = getCommanderPowerMax(chargingState.player.commanderId) - 1;
  const chargingButton = getActionButton(renderHudForBattleState(chargingState), "activate-power");

  assert.match(chargingButton, /disabled/);
  assert.match(chargingButton, /Power: Shock Doctrine|Power: Blitz Surge|Power:/);

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
  assert.match(html, /<strong>Battle Shortcuts<\/strong>/);
  assert.match(html, /<strong>Selected Unit Overrides<\/strong>/);
  assert.match(html, /data-debug-field="spawn-owner"/);
  assert.match(html, /data-debug-field="unit-hp"/);
});
