import { createId } from "../core/id.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { createInitialGearState } from "../content/runUpgrades.js";

function cloneStats(unitType) {
  return {
    maxHealth: unitType.maxHealth,
    attack: unitType.attack,
    armor: unitType.armor,
    armorClass: unitType.armorClass,
    movement: unitType.movement,
    minRange: unitType.minRange,
    maxRange: unitType.maxRange,
    staminaMax: unitType.staminaMax,
    ammoMax: unitType.ammoMax,
    luck: unitType.luck,
    weaponClass: unitType.weaponClass
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
    armorClass: unitType.armorClass,
    weaponClass: unitType.weaponClass,
    level,
    experience: 0,
    cost: unitType.cost,
    gear: {
      slot: null
    },
    gearState: {},
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
    movedThisTurn: false,
    cooldowns: {},
    transport: {
      carryingUnitId: null,
      carriedByUnitId: null,
      canUnloadAfterMove: false,
      hasLockedUnload: false
    },
    statuses: [],
    temporary: null
  };
}

export function createPersistentUnitSnapshot(unit) {
  return structuredClone({
    id: unit.id,
    unitTypeId: unit.unitTypeId,
    owner: unit.owner,
    family: unit.family,
    name: unit.name,
    armorClass: unit.armorClass,
    weaponClass: unit.weaponClass,
    level: unit.level,
    experience: unit.experience,
    cost: unit.cost,
    stats: unit.stats,
    gear: unit.gear ?? { slot: null }
  });
}

export function deployPersistentUnit(persistentUnit, owner, spawnPoint) {
  const gear = structuredClone(persistentUnit.gear ?? { slot: null });

  return {
    ...structuredClone(persistentUnit),
    owner,
    gear,
    gearState: createInitialGearState(gear.slot),
    x: spawnPoint.x,
    y: spawnPoint.y,
    current: {
      hp: persistentUnit.stats.maxHealth,
      stamina: persistentUnit.stats.staminaMax,
      ammo: persistentUnit.stats.ammoMax
    },
    hasMoved: false,
    hasAttacked: false,
    movedThisTurn: false,
    cooldowns: {},
    transport: {
      carryingUnitId: null,
      carriedByUnitId: null,
      canUnloadAfterMove: false,
      hasLockedUnload: false
    },
    statuses: [],
    temporary: null
  };
}
