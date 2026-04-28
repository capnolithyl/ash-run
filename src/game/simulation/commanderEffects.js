import { UNIT_TAGS } from "../core/constants.js";
import { getCommanderById, getCommanderPowerMax } from "../content/commanders.js";
import { getLivingUnits } from "./selectors.js";

const RECON_UNIT_IDS = new Set(["runner"]);

const UNIMPLEMENTED_ACTIVE_EFFECT_TYPES = new Set([
  "blaze-ignition",
  "knox-fortress-protocol",
  "falcon-reinforcements",
  "graves-execution-window",
  "nova-overload",
  "sable-lucky-seven"
]);

function getStatuses(unit, type) {
  return unit.statuses
    .filter((status) => status.type === type)
    .reduce((sum, status) => sum + status.value, 0);
}

function getStatusTurnsRemaining(status) {
  return status.turnsRemaining ?? status.turns ?? 0;
}

function getCommanderForSide(state, side) {
  const commanderId = state[side]?.commanderId;
  return getCommanderById(commanderId);
}

function getOpposingSide(side) {
  return side === "player" ? "enemy" : "player";
}

export function getCommanderPowerMaxForSide(state, side) {
  return getCommanderPowerMax(state[side]?.commanderId);
}

export function canSlipstreamAfterAttack(state, unit) {
  if (!unit) {
    return false;
  }

  const commander = getCommanderForSide(state, unit.owner);
  return commander?.passive.type === "echo-slipstream";
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

function getViperShockDoctrineModifier(unit, passive) {
  return unitMatchesGroup(unit, passive.group)
    ? passive.value
    : passive.penalty ?? -passive.value;
}

const attackModifierHandlers = {
  "viper-shock-doctrine": (_state, unit, passive) => getViperShockDoctrineModifier(unit, passive),
  "echo-slipstream": () => 0,
  "blaze-scorched-earth": () => 0,
  "falcon-air-superiority": () => 0,
  "graves-kill-confirm": () => 0,
  "nova-full-magazine": () => 0,
  "sable-loaded-dice": () => 0
};

const armorModifierHandlers = {
  "knox-shield-wall": () => 0,
  "falcon-air-superiority": () => 0
};

const movementModifierHandlers = {
  "echo-slipstream": () => 0
};

const rangeModifierHandlers = {
  "nova-full-magazine": () => 0
};

const luckModifierHandlers = {
  "sable-loaded-dice": () => 0
};

const incomeModifierHandlers = {
  "rook-war-budget": (_state, _side, passive) => passive.value
};

const experienceModifierHandlers = {
  "graves-kill-confirm": () => 0
};

const resupplyPermissionHandlers = {
  "rook-war-budget": () => false
};

export function getAttackModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? attackModifierHandlers[commander.passive.type] : null;

  return getStatuses(unit, "attack") + (passiveHandler ? passiveHandler(state, unit, commander.passive) : 0);
}

export function getArmorModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? armorModifierHandlers[commander.passive.type] : null;

  return getStatuses(unit, "shield") + (passiveHandler ? passiveHandler(state, unit, commander.passive) : 0);
}

export function getMovementModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? movementModifierHandlers[commander.passive.type] : null;

  return getStatuses(unit, "mobility") + (passiveHandler ? passiveHandler(state, unit, commander.passive) : 0);
}

export function getRangeModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? rangeModifierHandlers[commander.passive.type] : null;

  return passiveHandler ? passiveHandler(state, unit, commander.passive) : 0;
}

export function getLuckModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? luckModifierHandlers[commander.passive.type] : null;

  return getStatuses(unit, "luck") + (passiveHandler ? passiveHandler(state, unit, commander.passive) : 0);
}

export function getIncomeBonus(state, side) {
  const commander = getCommanderForSide(state, side);
  const passiveHandler = commander ? incomeModifierHandlers[commander.passive.type] : null;

  return passiveHandler ? passiveHandler(state, side, commander.passive) : 0;
}

export function getExperienceModifier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? experienceModifierHandlers[commander.passive.type] : null;

  return passiveHandler ? passiveHandler(state, unit, commander.passive) : 0;
}

export function getRecruitDiscount() {
  return 0;
}

export function canResupplyUnit(state, unit) {
  if (!unit) {
    return false;
  }

  const commander = getCommanderForSide(state, unit.owner);
  const passiveHandler = commander ? resupplyPermissionHandlers[commander.passive.type] : null;

  return passiveHandler ? passiveHandler(state, unit, commander.passive) : true;
}

export function canReceiveService(_state, unit) {
  return Boolean(unit);
}

function resupplyUnit(state, unit) {
  if (!canResupplyUnit(state, unit)) {
    return false;
  }

  const previousAmmo = unit.current.ammo;
  const previousStamina = unit.current.stamina;

  unit.current.ammo = unit.stats.ammoMax;
  unit.current.stamina = unit.stats.staminaMax;

  return unit.current.ammo !== previousAmmo || unit.current.stamina !== previousStamina;
}

export function resupplyUnitIfAllowed(state, unit) {
  return resupplyUnit(state, unit);
}

export function applyChargeFromCombat(state, attackingSide, defendingSide, damageDealt, damageTaken) {
  state[attackingSide].charge = Math.min(
    getCommanderPowerMaxForSide(state, attackingSide),
    state[attackingSide].charge + damageDealt * 0.5
  );

  state[defendingSide].charge = Math.min(
    getCommanderPowerMaxForSide(state, defendingSide),
    state[defendingSide].charge + damageTaken
  );
}

function applyStatusToSide(state, side, statusType, value, options = {}) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses.push({
      type: statusType,
      value,
      turnsRemaining: options.turnsRemaining ?? 1,
      currentTurnOnly: options.currentTurnOnly ?? false,
      tickSide: options.tickSide ?? side
    });
  }
}

function applyStatusToGroup(state, side, group, statusType, value, options = {}) {
  for (const unit of getLivingUnits(state, side)) {
    if (!unitMatchesGroup(unit, group)) {
      continue;
    }

    unit.statuses.push({
      type: statusType,
      value,
      turnsRemaining: options.turnsRemaining ?? 1,
      tickSide: options.tickSide ?? side
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

function applyAtlasOverhaul(state, side, commander, notes) {
  healSideByRatio(state, side, commander.active.healRatio ?? 0.5);
  applyStatusToSide(state, side, "shield", commander.active.armor ?? 2);
  notes.push(`${commander.name} overhauled the line and reinforced the hulls.`);
}

function applyViperBlitzSurge(state, side, commander, notes) {
  applyStatusToGroup(state, side, commander.active.attackGroup, "attack", commander.active.attack ?? 3);
  applyStatusToGroup(state, side, commander.active.movementGroup, "mobility", commander.active.movement ?? 2);
  notes.push(`${commander.name} sent infantry and runners forward.`);
}

function applyEchoDisruption(state, side, commander, notes) {
  applyStatusToSide(
    state,
    getOpposingSide(side),
    "mobility",
    -(commander.active.movementPenalty ?? 1),
    { tickSide: side }
  );
  notes.push(`${commander.name} disrupted enemy movement patterns.`);
}

function applyRookLiquidation(state, side, commander, notes) {
  const fundsSpent = state[side].funds;
  const attackBonus = Math.floor(fundsSpent / (commander.active.fundsPerAttack ?? 300));

  state[side].funds = 0;

  if (attackBonus > 0) {
    applyStatusToSide(state, side, "attack", attackBonus, { currentTurnOnly: true });
  }

  notes.push(`${commander.name} liquidated ${fundsSpent} funds for +${attackBonus} attack this turn.`);
}

function applyUnimplementedPower(_state, _side, commander, notes) {
  notes.push(`${commander.name}'s ${commander.active.name} has no effect yet.`);
}

const activeHandlers = {
  "atlas-overhaul": applyAtlasOverhaul,
  "viper-blitz-surge": applyViperBlitzSurge,
  "echo-disruption": applyEchoDisruption,
  "rook-liquidation": applyRookLiquidation,
  ...Object.fromEntries([...UNIMPLEMENTED_ACTIVE_EFFECT_TYPES].map((type) => [type, applyUnimplementedPower]))
};

export function activateCommanderPower(state, side, seed) {
  const commander = getCommanderForSide(state, side);
  const notes = [];

  if (!commander) {
    return { changed: false, seed, notes };
  }

  if (state[side].charge < getCommanderPowerMaxForSide(state, side)) {
    return { changed: false, seed, notes };
  }

  const handler = activeHandlers[commander.active.type];

  if (!handler) {
    notes.push(`${commander.name}'s ${commander.active.name} has an unknown effect type.`);
    return { changed: false, seed, notes };
  }

  state[side].charge = 0;
  handler(state, side, commander, notes);

  return { changed: true, seed, notes };
}

export function expireCurrentTurnStatuses(state, side) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses = unit.statuses.filter((status) => !status.currentTurnOnly);
  }
}

export function tickSideStatuses(state, side) {
  for (const owner of ["player", "enemy"]) {
    for (const unit of getLivingUnits(state, owner)) {
      unit.statuses = unit.statuses
        .map((status) => {
          const tickSide = status.tickSide ?? unit.owner;

          if (tickSide !== side) {
            return status;
          }

          return {
            ...status,
            turnsRemaining: getStatusTurnsRemaining(status) - 1
          };
        })
        .filter((status) => getStatusTurnsRemaining(status) > 0);
    }
  }

  const commander = getCommanderForSide(state, side);

  if (commander?.passive.type === "atlas-field-repairs") {
    healSide(state, side, commander.passive.value);
  }
}
