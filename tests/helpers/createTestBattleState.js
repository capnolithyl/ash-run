import { TURN_SIDES } from "../../src/game/core/constants.js";
import { createBattlefield } from "../../src/game/content/mapFactory.js";
import { createUnitFromType } from "../../src/game/simulation/unitFactory.js";

export function createPlacedUnit(unitTypeId, owner, x, y, overrides = {}) {
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

export function createTestBattleState({
  id = "test-field",
  width = 8,
  height = 6,
  playerUnits = [],
  enemyUnits = [],
  activeSide = TURN_SIDES.PLAYER,
  seed = 1337
} = {}) {
  const map = createBattlefield({
    id,
    name: "Test Field",
    theme: "Simulation Harness",
    width,
    height,
    riverColumns: [],
    bridgeRows: []
  });

  return {
    id: `battle-${id}`,
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
    log: [],
    victory: null
  };
}
