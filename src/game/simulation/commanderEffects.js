import { COMMANDER_POWER_MAX, TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { shuffle } from "../core/random.js";
import { getCommanderById } from "../content/commanders.js";
import { getLivingUnits } from "./selectors.js";

function getStatuses(unit, type) {
  return unit.statuses
    .filter((status) => status.type === type)
    .reduce((sum, status) => sum + status.value, 0);
}

function getCommanderForSide(state, side) {
  const commanderId = state[side].commanderId;
  return getCommanderById(commanderId);
}

export function getAttackModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  let bonus = getStatuses(unit, "attack");

  if (commander.passive.type === "attack-tag" && unit.family === commander.passive.tag) {
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

  if (commander.passive.type === "move-tag" && unit.family === commander.passive.tag) {
    bonus += commander.passive.value;
  }

  return bonus;
}

export function getRangeModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);

  if (commander.passive.type === "range-tag" && unit.family === commander.passive.tag) {
    return commander.passive.value;
  }

  return 0;
}

export function getIncomeBonus(state, side) {
  const commander = getCommanderForSide(state, side);
  return commander.passive.type === "income-bonus" ? commander.passive.value : 0;
}

export function getRecruitDiscount(state, side) {
  const commander = getCommanderForSide(state, side);
  return commander.passive.type === "recruit-discount" ? commander.passive.value : 0;
}

export function applyChargeFromCombat(state, attackingSide, defendingSide, damageDealt, damageTaken) {
  const attackerCommander = getCommanderForSide(state, attackingSide);
  const dealtMultiplier =
    attackerCommander.passive.type === "charge-dealt"
      ? attackerCommander.passive.multiplier
      : 1;

  state[attackingSide].charge = Math.min(
    COMMANDER_POWER_MAX,
    state[attackingSide].charge + damageDealt * 0.5 * dealtMultiplier
  );

  state[defendingSide].charge = Math.min(
    COMMANDER_POWER_MAX,
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

function healSide(state, side, amount) {
  for (const unit of getLivingUnits(state, side)) {
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

  if (state[side].charge < COMMANDER_POWER_MAX) {
    return { changed: false, seed: nextSeed, notes };
  }

  state[side].charge = 0;

  switch (commander.active.type) {
    case "team-shield":
      applyStatusToSide(state, side, "shield", 2);
      notes.push(`${commander.name} deployed a defensive screen.`);
      break;
    case "team-assault":
      applyStatusToSide(state, side, "attack", 2);
      notes.push(`${commander.name} ordered an all-out push.`);
      break;
    case "team-mobility":
      applyStatusToSide(state, side, "mobility", 1);
      notes.push(`${commander.name} opened rapid lanes.`);
      break;
    case "team-heal":
      healSide(state, side, 4);
      notes.push(`${commander.name} stabilized the front line.`);
      break;
    case "team-resupply":
      resupplySide(state, side);
      notes.push(`${commander.name} topped off ammo and stamina.`);
      break;
    case "supply-drop":
      state[side].funds += 350;
      resupplySide(state, side);
      notes.push(`${commander.name} called in a supply drop.`);
      break;
    case "orbital-strike": {
      const randomizedTargets = shuffle(nextSeed, getLivingUnits(state, enemySide));
      nextSeed = randomizedTargets.seed;
      const targets = randomizedTargets.value.slice(0, 3);

      for (const target of targets) {
        target.current.hp = Math.max(0, target.current.hp - 4);
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
        turnsRemaining: status.turnsRemaining - 1
      }))
      .filter((status) => status.turnsRemaining > 0);
  }
}
