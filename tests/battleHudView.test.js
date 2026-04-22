import test from "node:test";
import assert from "node:assert/strict";
import { COMMANDER_POWER_MAX, TURN_SIDES } from "../src/game/core/constants.js";
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
      hoveredTile: null
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

test("battle HUD shows passive and active commander powers without duplicate commander funds", () => {
  const battleState = createTestBattleState();
  const html = renderHudForBattleState(battleState);

  assert.match(html, /Passive/);
  assert.match(html, /Power/);
  assert.match(html, /Overrun: infantry and recons gain \+5 attack/);
  assert.match(html, /Supply Drop: gain 600 funds/);
  assert.doesNotMatch(html, /commander-funds/);
});

test("battle HUD includes compact drawer and quick-action controls", () => {
  const battleState = createTestBattleState();
  const html = renderHudForBattleState(battleState);

  assert.match(html, /id="battle-intel-drawer"/);
  assert.match(html, /id="battle-command-drawer"/);
  assert.match(html, /class="battle-mobile-actions"/);
  assert.match(html, /for="battle-intel-drawer">Intel/);
  assert.match(html, /for="battle-command-drawer">Feed/);
});

test("battle HUD disables commander power until the player can use it", () => {
  const chargingState = createTestBattleState();
  chargingState.player.charge = COMMANDER_POWER_MAX - 1;
  const chargingButton = getActionButton(renderHudForBattleState(chargingState), "activate-power");

  assert.match(chargingButton, /disabled/);

  const readyState = createTestBattleState();
  readyState.player.charge = COMMANDER_POWER_MAX;
  const readyButton = getActionButton(renderHudForBattleState(readyState), "activate-power");

  assert.doesNotMatch(readyButton, /disabled/);

  const enemyTurnState = createTestBattleState({
    activeSide: TURN_SIDES.ENEMY
  });
  enemyTurnState.player.charge = COMMANDER_POWER_MAX;
  const enemyTurnButton = getActionButton(renderHudForBattleState(enemyTurnState), "activate-power");

  assert.match(enemyTurnButton, /disabled/);
});
