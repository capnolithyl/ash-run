import { createId } from "../core/id.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";

function cloneStats(unitType) {
  return {
    maxHealth: unitType.maxHealth,
    attack: unitType.attack,
    armor: unitType.armor,
    movement: unitType.movement,
    minRange: unitType.minRange,
    maxRange: unitType.maxRange,
    staminaMax: unitType.staminaMax,
    ammoMax: unitType.ammoMax,
    luck: unitType.luck
  };
}

export function createUnitFromType(unitTypeId, owner, level = 1) {
  const unitType = UNIT_CATALOG[unitTypeId];
  const stats = cloneStats(unitType);

  return {
    id: createId(unitTypeId),
    unitTypeId,
    owner,
    family: unitType.family,
    name: unitType.name,
    level,
    experience: 0,
    effectiveAgainstTags: [...unitType.effectiveAgainstTags],
    cost: unitType.cost,
    stats,
    current: {
      hp: stats.maxHealth,
      stamina: stats.staminaMax,
      ammo: stats.ammoMax
    },
    x: 0,
    y: 0,
    hasMoved: false,
    hasAttacked: false,
    statuses: []
  };
}

export function createPersistentUnitSnapshot(unit) {
  return structuredClone({
    id: unit.id,
    unitTypeId: unit.unitTypeId,
    owner: unit.owner,
    family: unit.family,
    name: unit.name,
    level: unit.level,
    experience: unit.experience,
    effectiveAgainstTags: unit.effectiveAgainstTags,
    cost: unit.cost,
    stats: unit.stats
  });
}

export function deployPersistentUnit(persistentUnit, owner, spawnPoint) {
  return {
    ...structuredClone(persistentUnit),
    owner,
    x: spawnPoint.x,
    y: spawnPoint.y,
    current: {
      hp: persistentUnit.stats.maxHealth,
      stamina: persistentUnit.stats.staminaMax,
      ammo: persistentUnit.stats.ammoMax
    },
    hasMoved: false,
    hasAttacked: false,
    statuses: []
  };
}

