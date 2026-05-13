import { ENEMY_AI_ARCHETYPE_ORDER, TURN_SIDES } from "../core/constants.js";
import { getCommanderById, getEnemyAiArchetypeLabel } from "../content/commanders.js";
import {
  canUnitEquipRunUpgrade,
  createInitialGearState,
  getRunUpgradeById
} from "../content/runUpgrades.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { appendLog } from "./battleLog.js";
import { getCommanderPowerMaxForSide, getRecruitDiscount } from "./commanderEffects.js";
import { getLivingUnits, getSelectedUnit, getTerrainAt, getUnitAt } from "./selectors.js";
import { createUnitFromType } from "./unitFactory.js";

function resolveDebugGearSlot(unit, requestedGearSlot = null) {
  if (!requestedGearSlot) {
    return null;
  }

  const gearUpgrade = getRunUpgradeById(requestedGearSlot);

  if (!canUnitEquipRunUpgrade(unit, gearUpgrade)) {
    return null;
  }

  return gearUpgrade.id;
}

export function spawnDebugUnit(system, unitTypeId, owner, x, y, statOverrides = {}, gearSlot = null) {
  if (!UNIT_CATALOG[unitTypeId] || ![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(owner)) {
    return false;
  }

  if (!getTerrainAt(system.state, x, y) || getUnitAt(system.state, x, y)) {
    return false;
  }

  const unit = createUnitFromType(unitTypeId, owner);
  unit.x = x;
  unit.y = y;
  unit.hasMoved = false;
  unit.hasAttacked = false;

  for (const [statKey, value] of Object.entries(statOverrides)) {
    if (Number.isFinite(value) && statKey in unit.stats) {
      unit.stats[statKey] = Math.max(0, Math.floor(value));
    }
  }

  unit.stats.maxHealth = Math.max(1, unit.stats.maxHealth);
  unit.stats.movement = Math.max(1, unit.stats.movement);
  unit.stats.maxRange = Math.max(unit.stats.minRange, unit.stats.maxRange);
  unit.gear = {
    slot: resolveDebugGearSlot(unit, gearSlot)
  };
  unit.gearState = createInitialGearState(unit.gear.slot);
  unit.current.hp = unit.stats.maxHealth;
  unit.current.stamina = unit.stats.staminaMax;
  unit.current.ammo = unit.stats.ammoMax;

  system.state[owner].units.push(unit);
  system.state.selection = { type: "unit", id: unit.id, x, y };
  system.clearPendingAction();
  const gearLabel = unit.gear.slot ? ` with ${getRunUpgradeById(unit.gear.slot)?.name ?? unit.gear.slot}` : "";
  appendLog(system.state, `[Debug] Spawned ${unit.name} (${owner}) at ${x + 1},${y + 1}${gearLabel}.`);
  system.updateVictoryState();
  return true;
}

export function applyDebugStatsToSelectedUnit(system, debugPatch) {
  const selectedUnit = getSelectedUnit(system.state);

  if (!selectedUnit) {
    return false;
  }

  const patchValue = (key, min = 0) => {
    const nextValue = Number(debugPatch[key]);

    if (Number.isFinite(nextValue)) {
      selectedUnit.stats[key] = Math.max(min, Math.floor(nextValue));
    }
  };

  patchValue("attack");
  patchValue("armor");
  patchValue("movement", 1);
  patchValue("minRange");
  patchValue("maxRange");
  patchValue("staminaMax");
  patchValue("ammoMax");
  patchValue("luck");

  if (selectedUnit.stats.maxRange < selectedUnit.stats.minRange) {
    selectedUnit.stats.maxRange = selectedUnit.stats.minRange;
  }

  const maxHealth = Number(debugPatch.maxHealth);

  if (Number.isFinite(maxHealth)) {
    selectedUnit.stats.maxHealth = Math.max(1, Math.floor(maxHealth));
  }

  const level = Number(debugPatch.level);

  if (Number.isFinite(level)) {
    selectedUnit.level = Math.max(1, Math.floor(level));
  }

  const experience = Number(debugPatch.experience);

  if (Number.isFinite(experience)) {
    selectedUnit.experience = Math.max(0, Math.floor(experience));
  }

  const hp = Number(debugPatch.hp);

  if (Number.isFinite(hp)) {
    selectedUnit.current.hp = Math.max(0, Math.min(selectedUnit.stats.maxHealth, Math.floor(hp)));
  } else {
    selectedUnit.current.hp = Math.min(selectedUnit.current.hp, selectedUnit.stats.maxHealth);
  }

  const stamina = Number(debugPatch.stamina);

  if (Number.isFinite(stamina)) {
    selectedUnit.current.stamina = Math.max(
      0,
      Math.min(selectedUnit.stats.staminaMax, Math.floor(stamina))
    );
  } else {
    selectedUnit.current.stamina = Math.min(selectedUnit.current.stamina, selectedUnit.stats.staminaMax);
  }

  const ammo = Number(debugPatch.ammo);

  if (Number.isFinite(ammo)) {
    selectedUnit.current.ammo = Math.max(0, Math.min(selectedUnit.stats.ammoMax, Math.floor(ammo)));
  } else {
    selectedUnit.current.ammo = Math.min(selectedUnit.current.ammo, selectedUnit.stats.ammoMax);
  }

  const requestedGearSlot =
    typeof debugPatch.gearSlot === "string" && debugPatch.gearSlot.length > 0
      ? debugPatch.gearSlot
      : null;
  const currentGearSlot = selectedUnit.gear?.slot ?? null;
  let resolvedGearSlot = currentGearSlot;

  if (requestedGearSlot !== currentGearSlot) {
    resolvedGearSlot = resolveDebugGearSlot(selectedUnit, requestedGearSlot);
    selectedUnit.gear = {
      slot: resolvedGearSlot
    };
    selectedUnit.gearState = createInitialGearState(resolvedGearSlot);
  }

  const gearName = resolvedGearSlot ? getRunUpgradeById(resolvedGearSlot)?.name ?? resolvedGearSlot : "None";
  appendLog(
    system.state,
    `[Debug] Updated ${selectedUnit.name} at ${selectedUnit.x + 1},${selectedUnit.y + 1} (Gear: ${gearName}).`
  );
  system.updateVictoryState();
  return true;
}

export function setDebugCommanders(system, commanderAssignments) {
  let changed = false;
  const updatedSides = [];

  for (const [side, commanderId] of Object.entries(commanderAssignments ?? {})) {
    if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
      continue;
    }

    const commander = getCommanderById(commanderId);

    if (!commander || system.state[side].commanderId === commander.id) {
      continue;
    }

    system.state[side].commanderId = commander.id;
    system.state[side].charge = Math.max(
      0,
      Math.min(getCommanderPowerMaxForSide(system.state, side), Number(system.state[side].charge) || 0)
    );
    system.state[side].recruitDiscount = getRecruitDiscount(system.state, side);
    changed = true;
    updatedSides.push(`${side}: ${commander.name}`);
  }

  if (commanderAssignments?.enemyAiArchetype) {
    const requestedArchetype = commanderAssignments.enemyAiArchetype;

    if (
      ENEMY_AI_ARCHETYPE_ORDER.includes(requestedArchetype) &&
      system.state.enemy.aiArchetype !== requestedArchetype
    ) {
      system.state.enemy.aiArchetype = requestedArchetype;
      changed = true;
      updatedSides.push(`enemy AI: ${getEnemyAiArchetypeLabel(requestedArchetype)}`);
    }
  }

  if (!changed) {
    return false;
  }

  appendLog(system.state, `[Debug] Commander override updated (${updatedSides.join(", ")}).`);
  return true;
}

export function setDebugCharge(system, side, charge) {
  if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
    return false;
  }

  system.state[side].charge = Math.max(
    0,
    Math.min(getCommanderPowerMaxForSide(system.state, side), Number(charge) || 0)
  );
  appendLog(system.state, `[Debug] ${side} commander charge set to ${Math.floor(system.state[side].charge)}.`);
  return true;
}

export function resetDebugUnitActions(system, side) {
  if (![TURN_SIDES.PLAYER, TURN_SIDES.ENEMY].includes(side)) {
    return false;
  }

  for (const unit of getLivingUnits(system.state, side)) {
    unit.hasMoved = false;
    unit.hasAttacked = false;
    unit.current.stamina = unit.stats.staminaMax;
  }

  appendLog(system.state, `[Debug] Refreshed ${side} unit actions.`);
  return true;
}
