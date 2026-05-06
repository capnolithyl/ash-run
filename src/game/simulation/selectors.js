import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { BUILDING_RECRUITMENT, UNIT_CATALOG } from "../content/unitCatalog.js";
import { getTargetProfileForAttack, WEAPON_CLASSES } from "../content/weaponClasses.js";
import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";

const SECONDARY_ATTACK_RATIO = 0.55;

function tileKey(x, y) {
  return `${x},${y}`;
}

export function getLivingUnits(state, side) {
  return state[side].units.filter((unit) => unit.current.hp > 0);
}

function getAllUnits(state) {
  return [...state.player.units, ...state.enemy.units];
}

function hasCorruptedStat(unit, stat) {
  return (unit?.statuses ?? []).some((status) => status.type === "corrupted" && status.stat === stat);
}

function halveVisibleStat(value) {
  return Math.max(0, Math.ceil(value * 0.5));
}

export function getEffectiveCurrentAmmo(unit) {
  const ammo = Math.max(0, unit?.current?.ammo ?? 0);
  return hasCorruptedStat(unit, "ammo") ? halveVisibleStat(ammo) : ammo;
}

export function getEffectiveCurrentStamina(unit) {
  const stamina = Math.max(0, unit?.current?.stamina ?? 0);
  return hasCorruptedStat(unit, "stamina") ? halveVisibleStat(stamina) : stamina;
}

export function getUnitAt(state, x, y) {
  return getAllUnits(state).find(
    (unit) =>
      unit.current.hp > 0 &&
      !unit.transport?.carriedByUnitId &&
      unit.x === x &&
      unit.y === y
  );
}

export function getBuildingAt(state, x, y) {
  return state.map.buildings.find((building) => building.x === x && building.y === y);
}

export function getUnitAttackProfile(unit) {
  if (!unit || unit.stats?.maxRange <= 0 || unit.stats?.attack <= 0) {
    return null;
  }

  if (getEffectiveCurrentAmmo(unit) > 0) {
    return {
      type: "primary",
      attack: unit.stats.attack,
      weaponClass: unit.stats.weaponClass,
      minRange: unit.stats.minRange,
      maxRange: unit.stats.maxRange,
      consumesAmmo: true
    };
  }

  return {
    type: "secondary",
    attack: Math.max(1, Math.floor(unit.stats.attack * SECONDARY_ATTACK_RATIO)),
    weaponClass: WEAPON_CLASSES.RIFLE,
    minRange: 1,
    maxRange: 1,
    consumesAmmo: false
  };
}

export function getAntiAirGearAmmo(unit) {
  return Math.max(0, unit?.gearState?.aaKitAmmo ?? 0);
}

export function hasUsableAntiAirKit(unit) {
  return unit?.gear?.slot === "gear-aa-kit" && getAntiAirGearAmmo(unit) > 0;
}

export function getAttackProfileForTarget(attacker, target) {
  if (
    attacker &&
    target?.family === UNIT_TAGS.AIR &&
    hasUsableAntiAirKit(attacker) &&
    attacker.stats?.maxRange > 0 &&
    attacker.stats?.attack > 0
  ) {
    return {
      type: "gear-aa",
      attack: attacker.stats.attack,
      weaponClass: null,
      minRange: attacker.stats.minRange,
      maxRange: attacker.stats.maxRange,
      consumesAmmo: false,
      consumesGearAmmo: true
    };
  }

  return getUnitAttackProfile(attacker);
}

export function getSelectedUnit(state) {
  if (state.selection.type !== "unit") {
    return null;
  }

  return getAllUnits(state).find((unit) => unit.id === state.selection.id) ?? null;
}

export function getSelectedBuilding(state) {
  if (state.selection.type !== "building") {
    return null;
  }

  return state.map.buildings.find((building) => building.id === state.selection.id) ?? null;
}

export function getSelectionCoordinates(state) {
  if (state.selection.type === "tile") {
    if (Number.isInteger(state.selection.x) && Number.isInteger(state.selection.y)) {
      return { x: state.selection.x, y: state.selection.y };
    }

    return null;
  }

  const selectedUnit = getSelectedUnit(state);

  if (selectedUnit) {
    return { x: selectedUnit.x, y: selectedUnit.y };
  }

  const selectedBuilding = getSelectedBuilding(state);

  if (selectedBuilding) {
    return { x: selectedBuilding.x, y: selectedBuilding.y };
  }

  return null;
}

export function getTerrainAt(state, x, y) {
  const terrainKey = state.map.tiles[y]?.[x];
  return TERRAIN_LIBRARY[terrainKey];
}

function getMovementCost(unit, terrain) {
  if (!terrain) {
    return 99;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return 1;
  }

  return unit.family === UNIT_TAGS.VEHICLE ? terrain.vehicleMoveCost : terrain.moveCost;
}

export function getUnitMovementAllowance(unit, movementBudget) {
  const requestedBudget = Math.max(0, Math.floor(movementBudget ?? 0));
  const currentStamina = Math.max(0, Math.floor(getEffectiveCurrentStamina(unit) ?? requestedBudget));
  return Math.min(requestedBudget, currentStamina);
}

function isTerrainBlockedForUnit(unit, terrain) {
  if (!terrain) {
    return true;
  }

  if (unit.family === UNIT_TAGS.AIR) {
    return false;
  }

  if (terrain.blocksGround) {
    return true;
  }

  return (terrain.blockedFamilies ?? []).includes(unit.family);
}

function isAirUnit(unit) {
  return unit?.family === UNIT_TAGS.AIR;
}

function occupiesBlockingLayer(movingUnit, occupant) {
  if (!occupant) {
    return false;
  }

  return isAirUnit(movingUnit) === isAirUnit(occupant);
}

function canUnitOccupyTile(state, unit, x, y) {
  const terrain = getTerrainAt(state, x, y);

  if (isTerrainBlockedForUnit(unit, terrain)) {
    return false;
  }

  return !getUnitAt(state, x, y);
}

export function getValidUnloadTiles(state, runner, carriedUnit) {
  if (!runner || !carriedUnit || runner.transport?.carryingUnitId !== carriedUnit.id) {
    return [];
  }

  return [
    { x: runner.x + 1, y: runner.y },
    { x: runner.x - 1, y: runner.y },
    { x: runner.x, y: runner.y + 1 },
    { x: runner.x, y: runner.y - 1 }
  ].filter((tile) => canUnitOccupyTile(state, carriedUnit, tile.x, tile.y));
}

function getMovementSearch(state, unit, movementBudget) {
  const allowedBudget = getUnitMovementAllowance(unit, movementBudget);
  const frontier = [{ x: unit.x, y: unit.y, cost: 0 }];
  const bestCosts = new Map([[tileKey(unit.x, unit.y), 0]]);
  const previous = new Map();
  const settled = new Set();
  const reachable = [];

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.cost - right.cost || left.y - right.y || left.x - right.x);
    const current = frontier.shift();
    const currentKey = tileKey(current.x, current.y);

    if (settled.has(currentKey)) {
      continue;
    }

    settled.add(currentKey);

    const currentOccupant = getUnitAt(state, current.x, current.y);

    if (!currentOccupant || currentOccupant.id === unit.id) {
      reachable.push({ x: current.x, y: current.y, cost: current.cost });
    }

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (const direction of directions) {
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const terrain = getTerrainAt(state, nextX, nextY);

      if (!terrain) {
        continue;
      }

      const nextCost = current.cost + getMovementCost(unit, terrain);
      const key = tileKey(nextX, nextY);
      const occupant = getUnitAt(state, nextX, nextY);
      const occupiedByBlockingUnit =
        occupant &&
        occupant.id !== unit.id &&
        occupant.owner !== unit.owner &&
        occupiesBlockingLayer(unit, occupant);
      const bestKnownCost = bestCosts.get(key);

      if (
        nextCost > allowedBudget ||
        isTerrainBlockedForUnit(unit, terrain) ||
        occupiedByBlockingUnit ||
        (bestKnownCost !== undefined && bestKnownCost <= nextCost)
      ) {
        continue;
      }

      bestCosts.set(key, nextCost);
      previous.set(key, currentKey);
      frontier.push({ x: nextX, y: nextY, cost: nextCost });
    }
  }

  return {
    reachable,
    bestCosts,
    previous
  };
}

function parseTileKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

/**
 * Breadth-first flood fill is enough for the current board sizes and keeps
 * the movement rules readable while we are prototyping.
 */
export function getReachableTiles(state, unit, movementBudget) {
  return getMovementSearch(state, unit, movementBudget).reachable.map((tile) => ({
    x: tile.x,
    y: tile.y
  }));
}

export function getMovementPath(state, unit, movementBudget, targetX, targetY) {
  const search = getMovementSearch(state, unit, movementBudget);
  const targetKey = tileKey(targetX, targetY);

  if (!search.bestCosts.has(targetKey)) {
    return [];
  }

  const path = [];
  let currentKey = targetKey;

  while (currentKey) {
    path.unshift(parseTileKey(currentKey));
    currentKey = search.previous.get(currentKey);
  }

  return path;
}

export function getMovementPathCost(state, unit, movementBudget, targetX, targetY) {
  const search = getMovementSearch(state, unit, movementBudget);
  const targetKey = tileKey(targetX, targetY);
  return search.bestCosts.get(targetKey) ?? null;
}

export function getTargetsInRange(state, unit, minimumRange, maximumRange) {
  const enemySide = unit.owner === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
  const targets = [];

  for (const target of getLivingUnits(state, enemySide)) {
    const distance = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);

    if (
      distance >= minimumRange &&
      distance <= maximumRange &&
      canUnitAttackTarget(unit, target)
    ) {
      targets.push(target);
    }
  }

  return targets;
}

export function canUnitAttackTarget(attacker, target) {
  if (
    !attacker ||
    !target ||
    attacker.transport?.carriedByUnitId ||
    target.transport?.carriedByUnitId
  ) {
    return false;
  }

  const attackProfile = getAttackProfileForTarget(attacker, target);

  if (!attackProfile) {
    return false;
  }

  if (getTargetProfileForAttack(attacker, target, attackProfile)) {
    return true;
  }

  return false;
}

export function getTilesInRange(state, originX, originY, minimumRange, maximumRange) {
  const tiles = [];

  for (let row = 0; row < state.map.height; row += 1) {
    for (let column = 0; column < state.map.width; column += 1) {
      const distance = Math.abs(originX - column) + Math.abs(originY - row);

      if (distance >= minimumRange && distance <= maximumRange) {
        tiles.push({ x: column, y: row });
      }
    }
  }

  return tiles;
}

export function getRecruitmentOptions(state, building, side) {
  const unitIds = BUILDING_RECRUITMENT[building.type] ?? [];

  return unitIds.map((unitId) => {
    const baseUnit = UNIT_CATALOG[unitId];
    return {
      ...baseUnit,
      adjustedCost: Math.max(100, baseUnit.cost - side.recruitDiscount)
    };
  });
}
