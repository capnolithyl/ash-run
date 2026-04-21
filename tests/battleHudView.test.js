import test from "node:test";
import assert from "node:assert/strict";
import { TURN_SIDES } from "../src/game/core/constants.js";
import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { renderBattleHudView } from "../src/ui/views/battleHudView.js";
import { createPlacedUnit, createTestBattleState } from "./helpers/createTestBattleState.js";

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
