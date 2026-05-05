import { TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { UNIT_CATALOG } from "../src/game/content/unitCatalog.js";
import { getAttackForecast } from "../src/game/simulation/combatResolver.js";
import { canUnitAttackTarget } from "../src/game/simulation/selectors.js";
import { createUnitFromType } from "../src/game/simulation/unitFactory.js";

function createNeutralState(attacker, defender) {
  return {
    id: "damage-threshold-test",
    mode: "skirmish",
    seed: 12345,
    map: {
      width: 8,
      height: 4,
      tiles: Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => TERRAIN_KEYS.ROAD)),
      buildings: []
    },
    turn: { number: 1, activeSide: TURN_SIDES.PLAYER },
    player: {
      commanderId: null,
      funds: 0,
      charge: 0,
      recruitDiscount: 0,
      units: [attacker]
    },
    enemy: {
      commanderId: null,
      funds: 0,
      charge: 0,
      recruitDiscount: 0,
      units: [defender]
    },
    selection: { type: null, id: null, x: null, y: null },
    pendingAction: null,
    enemyTurn: null,
    levelUpQueue: [],
    log: [],
    victory: null
  };
}

function getPreferredAttackDistance(unit) {
  if (unit.stats.minRange > 1) {
    return unit.stats.minRange;
  }

  return 1;
}

function placeUnits(attacker, defender, distance) {
  attacker.x = 1;
  attacker.y = 1;
  defender.x = attacker.x + distance;
  defender.y = attacker.y;
}

function formatRange(range) {
  return `${range.min}% - ${range.max}%`;
}

function describeForecast(attackerTypeId, defenderTypeId) {
  const attacker = createUnitFromType(attackerTypeId, TURN_SIDES.PLAYER);
  const defender = createUnitFromType(defenderTypeId, TURN_SIDES.ENEMY);
  const distance = getPreferredAttackDistance(attacker);
  placeUnits(attacker, defender, distance);

  if (!canUnitAttackTarget(attacker, defender)) {
    return "N/A";
  }

  const forecast = getAttackForecast(createNeutralState(attacker, defender), attacker, defender);

  if (!forecast.received) {
    return `${formatRange(forecast.dealt)} vs 0%`;
  }

  return `${formatRange(forecast.dealt)} vs ${formatRange(forecast.received)}`;
}

for (const attackerTypeId of Object.keys(UNIT_CATALOG)) {
  console.log(`\n${UNIT_CATALOG[attackerTypeId].name}`);

  for (const defenderTypeId of Object.keys(UNIT_CATALOG)) {
    console.log(
      `  vs ${UNIT_CATALOG[defenderTypeId].name}: ${describeForecast(attackerTypeId, defenderTypeId)}`
    );
  }
}
