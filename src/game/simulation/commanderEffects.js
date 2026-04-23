import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { shuffle } from "../core/random.js";
import { getCommanderById, getCommanderPowerMax } from "../content/commanders.js";
import { getLivingUnits } from "./selectors.js";

const RECON_UNIT_IDS = new Set(["runner"]);

function getStatuses(unit, type) {
  return unit.statuses
    .filter((status) => status.type === type)
    .reduce((sum, status) => sum + status.value, 0);
}

function getStatusTurnsRemaining(status) {
  return status.turnsRemaining ?? status.turns ?? 0;
}

function getCommanderForSide(state, side) {
  const commanderId = state[side].commanderId;
  return getCommanderById(commanderId);
}

export function getCommanderPowerMaxForSide(state, side) {
  return getCommanderPowerMax(state[side]?.commanderId);
}

function unitMatchesGroup(unit, group) {
  switch (group) {
    case "infantry":
      return unit.family === UNIT_TAGS.INFANTRY;
    case "recon":
      return RECON_UNIT_IDS.has(unit.unitTypeId);
    case "infantry-recon":
      return unit.family === UNIT_TAGS.INFANTRY || RECON_UNIT_IDS.has(unit.unitTypeId);
    default:
      return false;
  }
}

export function getAttackModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  let bonus = getStatuses(unit, "attack");

  if (!commander) {
    return bonus;
  }

  if (commander.passive.type === "attack-tag" && unit.family === commander.passive.tag) {
    bonus += commander.passive.value;
  }

  if (commander.passive.type === "attack-group" && unitMatchesGroup(unit, commander.passive.group)) {
    bonus += commander.passive.value;
  }

  if (commander.passive.type === "attack-all") {
    bonus += commander.passive.value;
  }

  return bonus;
}

export function getArmorModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  let bonus = getStatuses(unit, "shield");

  if (!commander) {
    return bonus;
  }

  if (commander.passive.type === "armor-tag" && unit.family === commander.passive.tag) {
    bonus += commander.passive.value;
  }

  if (commander.passive.type === "armor-all") {
    bonus += commander.passive.value;
  }

  return bonus;
}

export function getMovementModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  let bonus = getStatuses(unit, "mobility");

  if (!commander) {
    return bonus;
  }

  if (commander.passive.type === "move-tag" && unit.family === commander.passive.tag) {
    bonus += commander.passive.value;
  }

  return bonus;
}

export function getRangeModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);

  if (!commander) {
    return 0;
  }

  if (commander.passive.type === "range-tag" && unit.family === commander.passive.tag) {
    return commander.passive.value;
  }

  return 0;
}

export function getIncomeBonus(state, side) {
  const commander = getCommanderForSide(state, side);
  return commander?.passive.type === "income-bonus" ? commander.passive.value : 0;
}

export function getRecruitDiscount(state, side) {
  const commander = getCommanderForSide(state, side);
  return commander?.passive.type === "recruit-discount" ? commander.passive.value : 0;
}

export function applyChargeFromCombat(state, attackingSide, defendingSide, damageDealt, damageTaken) {
  const attackerCommander = getCommanderForSide(state, attackingSide);
  const dealtMultiplier =
    attackerCommander?.passive.type === "charge-dealt"
      ? attackerCommander.passive.multiplier
      : 1;

  state[attackingSide].charge = Math.min(
    getCommanderPowerMaxForSide(state, attackingSide),
    state[attackingSide].charge + damageDealt * 0.5 * dealtMultiplier
  );

  state[defendingSide].charge = Math.min(
    getCommanderPowerMaxForSide(state, defendingSide),
    state[defendingSide].charge + damageTaken
  );
}

function applyStatusToSide(state, side, statusType, value) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses.push({
      type: statusType,
      value,
      turnsRemaining: 1
    });
  }
}

function applyStatusToGroup(state, side, group, statusType, value) {
  for (const unit of getLivingUnits(state, side)) {
    if (!unitMatchesGroup(unit, group)) {
      continue;
    }

    unit.statuses.push({
      type: statusType,
      value,
      turnsRemaining: 1
    });
  }
}

function healSide(state, side, amount) {
  for (const unit of getLivingUnits(state, side)) {
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + amount);
  }
}

function healSideByRatio(state, side, ratio) {
  for (const unit of getLivingUnits(state, side)) {
    const amount = Math.max(1, Math.ceil(unit.stats.maxHealth * ratio));
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + amount);
  }
}

function resupplySide(state, side) {
  for (const unit of getLivingUnits(state, side)) {
    unit.current.ammo = unit.stats.ammoMax;
    unit.current.stamina = unit.stats.staminaMax;
  }
}

/**
 * Commander powers intentionally stay generic in the prototype so balance work
 * can happen in data instead of scene code.
 */
export function activateCommanderPower(state, side, seed) {
  const commander = getCommanderForSide(state, side);
  const enemySide = side === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
  let nextSeed = seed;
  const notes = [];

  if (!commander) {
    return { changed: false, seed: nextSeed, notes };
  }

  if (state[side].charge < getCommanderPowerMaxForSide(state, side)) {
    return { changed: false, seed: nextSeed, notes };
  }

  state[side].charge = 0;

  switch (commander.active.type) {
    case "team-shield":
      applyStatusToSide(state, side, "shield", 3);
      notes.push(`${commander.name} deployed a defensive screen.`);
      break;
    case "team-assault":
      applyStatusToSide(state, side, "attack", 3);
      notes.push(`${commander.name} ordered an all-out push.`);
      break;
    case "team-mobility":
      applyStatusToSide(state, side, "mobility", 2);
      notes.push(`${commander.name} opened rapid lanes.`);
      break;
    case "team-heal":
      healSide(state, side, 8);
      notes.push(`${commander.name} stabilized the front line.`);
      break;
    case "field-repair-push":
      healSideByRatio(state, side, commander.active.healRatio ?? 0.5);
      applyStatusToSide(state, side, "shield", commander.active.armor ?? 2);
      notes.push(`${commander.name} overhauled the line and reinforced the hulls.`);
      break;
    case "viper-infantry-push":
      applyStatusToGroup(state, side, commander.active.attackGroup, "attack", commander.active.attack ?? 5);
      applyStatusToGroup(state, side, commander.active.movementGroup, "mobility", commander.active.movement ?? 2);
      notes.push(`${commander.name} sent infantry and recons forward.`);
      break;
    case "team-resupply":
      resupplySide(state, side);
      notes.push(`${commander.name} topped off ammo and stamina.`);
      break;
    case "supply-drop":
      state[side].funds += 600;
      resupplySide(state, side);
      notes.push(`${commander.name} called in a supply drop.`);
      break;
    case "orbital-strike": {
      const randomizedTargets = shuffle(nextSeed, getLivingUnits(state, enemySide));
      nextSeed = randomizedTargets.seed;
      const targets = randomizedTargets.value.slice(0, 4);

      for (const target of targets) {
        target.current.hp = Math.max(0, target.current.hp - 7);
      }

      notes.push(`${commander.name} lit up the enemy column from above.`);
      break;
    }
    default:
      break;
  }

  return { changed: true, seed: nextSeed, notes };
}

export function tickSideStatuses(state, side) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses = unit.statuses
      .map((status) => ({
        ...status,
        turnsRemaining: getStatusTurnsRemaining(status) - 1
      }))
      .filter((status) => status.turnsRemaining > 0);
  }

  const commander = getCommanderForSide(state, side);

  if (commander?.passive.type === "turn-heal") {
    healSide(state, side, commander.passive.value);
  }
}
