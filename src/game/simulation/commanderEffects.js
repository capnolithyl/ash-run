import { TURN_SIDES, UNIT_TAGS } from "../core/constants.js";
import { getCommanderById, getCommanderPowerMax } from "../content/commanders.js";
import { createUnitFromType } from "./unitFactory.js";
import { getLivingUnits, getBuildingAt, getTerrainAt, getUnitAt } from "./selectors.js";

const RECON_UNIT_IDS = new Set(["runner"]);
const AIRCRAFT_FAMILY = UNIT_TAGS.AIR;
const CORRUPTED_STATS = ["attack", "armor", "range", "ammo", "stamina"];

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getStatusEntries(unit, type) {
  return (unit?.statuses ?? []).filter((status) => status.type === type);
}

function getStatuses(unit, type) {
  return getStatusEntries(unit, type).reduce((sum, status) => sum + (Number(status.value) || 0), 0);
}

function hasStatus(unit, type) {
  return getStatusEntries(unit, type).length > 0;
}

function getStatusTurnsRemaining(status) {
  return status.turnsRemaining ?? status.turns ?? 0;
}

function getCommanderForSide(state, side) {
  const commanderId = state[side]?.commanderId;
  return getCommanderById(commanderId);
}

function getOpposingSide(side) {
  return side === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
}

function ensureSideEffects(state, side) {
  state[side].effects ??= [];
  return state[side].effects;
}

function addSideEffect(state, side, effect) {
  const effects = ensureSideEffects(state, side);
  const nextEffect = {
    turnsRemaining: 1,
    tickSide: side,
    ...effect
  };
  effects.push(nextEffect);
  return nextEffect;
}

function getSideEffects(state, side, type) {
  return (state[side]?.effects ?? []).filter((effect) => effect.type === type);
}

function hasSideEffect(state, side, type) {
  return getSideEffects(state, side, type).length > 0;
}

function removeSideEffect(state, side, type) {
  state[side].effects = (state[side]?.effects ?? []).filter((effect) => effect.type !== type);
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

function isAircraft(unit) {
  return unit?.family === AIRCRAFT_FAMILY;
}

function getOwnedPropertyCount(state, side) {
  return state.map.buildings.filter((building) => building.owner === side).length;
}

function isStandingOnOwnedProperty(state, unit) {
  const building = getBuildingAt(state, unit.x, unit.y);
  return Boolean(building && building.owner === unit.owner);
}

function halveVisibleStat(value) {
  return Math.max(0, Math.ceil(value * 0.5));
}

function getCorruptedStatPenalty(unit, stat, baseValue) {
  return getStatusEntries(unit, "corrupted")
    .filter((status) => status.stat === stat)
    .reduce((sum, _status) => sum + (halveVisibleStat(baseValue) - baseValue), 0);
}

function getAttackPercentStatuses(unit) {
  return getStatuses(unit, "attackPercent");
}

function getArmorPercentFromStatuses(unit) {
  return getStatuses(unit, "armorPercent");
}

function getAttackPercentBonusFromCommander(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const passiveType = commander?.passive?.type;
  const baseAttack = unit.stats.attack;
  let attackPercent = 0;

  if (passiveType === "viper-shock-doctrine") {
    attackPercent += unitMatchesGroup(unit, commander.passive.group)
      ? commander.passive.attackPercent ?? 0
      : commander.passive.otherAttackPercent ?? 0;
  }

  if (passiveType === "rook-estate-claim" && isStandingOnOwnedProperty(state, unit)) {
    attackPercent += commander.passive.attackPercent ?? 0;
  }

  if (passiveType === "falcon-air-superiority" && isAircraft(unit)) {
    attackPercent += commander.passive.attackPercent ?? 0;
  }

  if (
    passiveType === "nova-full-magazine" &&
    unit.current.ammo === unit.stats.ammoMax &&
    unit.stats.ammoMax > 0
  ) {
    attackPercent += commander.passive.attackPercent ?? 0;
  }

  if (hasSideEffect(state, unit.owner, "rook-hostile-takeover")) {
    attackPercent += getOwnedPropertyCount(state, unit.owner) * (commander?.active?.attackPercentPerProperty ?? 0);
  }

  return {
    baseAttack,
    attackPercent
  };
}

function getAttackMultiplier(state, unit) {
  const { attackPercent } = getAttackPercentBonusFromCommander(state, unit);
  let multiplier = 1 + attackPercent + getAttackPercentStatuses(unit);

  if (hasStatus(unit, "burn")) {
    multiplier *= 0.5;
  }

  if (getStatusEntries(unit, "corrupted").some((status) => status.stat === "attack")) {
    multiplier *= 0.5;
  }

  return Math.max(0, multiplier);
}

function getArmorPercentBonus(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  let armorPercent = getArmorPercentFromStatuses(unit);

  if (commander?.passive?.type === "falcon-air-superiority" && isAircraft(unit)) {
    armorPercent += commander.passive.armorPercent ?? 0;
  }

  if (hasSideEffect(state, unit.owner, "rook-hostile-takeover")) {
    armorPercent +=
      getOwnedPropertyCount(state, unit.owner) * (commander?.active?.armorPercentPerProperty ?? 0);
  }

  return armorPercent;
}

function getDisplayedAttackValue(state, unit) {
  const baseAttack = unit?.stats?.attack ?? 0;
  return Math.max(0, Math.round(baseAttack * getAttackMultiplier(state, unit)));
}

function getDisplayedArmorValue(state, unit) {
  const baseArmor = unit?.stats?.armor ?? 0;
  const flatArmor = getStatuses(unit, "shield");
  const armorPercent = getArmorPercentBonus(state, unit);
  const percentArmorDelta = Math.round(baseArmor * armorPercent);
  const corruptedArmorDelta = getCorruptedStatPenalty(unit, "armor", baseArmor);

  return Math.max(0, baseArmor + flatArmor + percentArmorDelta + corruptedArmorDelta);
}

function getDisplayedMovementValue(state, unit) {
  const baseMovement = unit?.stats?.movement ?? 0;
  return Math.max(
    0,
    baseMovement + getStatuses(unit, "mobility") + getCorruptedStatPenalty(unit, "movement", baseMovement)
  );
}

function getDisplayedRangeCapValue(state, unit) {
  const baseRange = unit?.stats?.maxRange ?? 0;
  return Math.max(
    unit?.stats?.minRange ?? 0,
    baseRange + getStatuses(unit, "range") + getCorruptedStatPenalty(unit, "range", baseRange)
  );
}

function getDisplayedLuckValue(state, unit) {
  const baseLuck = unit?.stats?.luck ?? 0;
  return Math.max(0, baseLuck + getStatuses(unit, "luck") + getCorruptedStatPenalty(unit, "luck", baseLuck));
}

function getPositionalArmorMultiplier(state, unit) {
  const commander = getCommanderForSide(state, unit.owner);
  const hasActiveFortress = hasSideEffect(state, unit.owner, "knox-fortress-protocol");
  const qualifiesForShieldWall =
    commander?.passive?.type === "knox-shield-wall" && !unit.movedThisTurn;

  return hasActiveFortress || qualifiesForShieldWall ? 2 : 1;
}

function isNegativeStatus(status) {
  if (!status) {
    return false;
  }

  if (status.negative === true) {
    return true;
  }

  if (status.type === "burn" || status.type === "corrupted") {
    return true;
  }

  return ["mobility", "shield", "attackPercent", "range", "luck"].includes(status.type) &&
    (Number(status.value) || 0) < 0;
}

function cleanseNegativeStatusesFromUnit(unit) {
  const previousCount = unit.statuses.length;
  unit.statuses = unit.statuses.filter((status) => !isNegativeStatus(status));
  return unit.statuses.length !== previousCount;
}

function applyStatusToSide(state, side, statusType, value, options = {}) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses.push({
      type: statusType,
      value,
      turnsRemaining: options.turnsRemaining ?? 1,
      currentTurnOnly: options.currentTurnOnly ?? false,
      tickSide: options.tickSide ?? side,
      negative: options.negative ?? false,
      stat: options.stat ?? null
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
      currentTurnOnly: options.currentTurnOnly ?? false,
      tickSide: options.tickSide ?? side,
      negative: options.negative ?? false,
      stat: options.stat ?? null
    });
  }
}

function healSide(state, side, ratio) {
  for (const unit of getLivingUnits(state, side)) {
    const healAmount = Math.max(1, Math.ceil(unit.stats.maxHealth * ratio));
    unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + healAmount);
  }
}

function applyCorruptedToUnit(state, unit, sourceSide) {
  const rollSeed = state.seed;
  state.seed = (state.seed * 48271 + 1) % 2147483647;
  const roll = hashString(`${rollSeed}:${unit.id}`) % CORRUPTED_STATS.length;
  const stat = CORRUPTED_STATS[roll];
  unit.statuses.push({
    type: "corrupted",
    stat,
    turnsRemaining: 1,
    tickSide: sourceSide,
    negative: true
  });
}

function getImmediateDamageAmount(unit, ratio) {
  return Math.max(1, Math.ceil(unit.stats.maxHealth * ratio));
}

function canSpawnAirUnitAt(state, x, y) {
  return Boolean(getTerrainAt(state, x, y)) && !getUnitAt(state, x, y);
}

function getFalconSpawnPosition(state, side) {
  const hq = state.map.buildings.find((building) => building.type === "command" && building.owner === side);

  if (!hq) {
    return null;
  }

  const candidates = [
    { x: hq.x, y: hq.y },
    { x: hq.x + 1, y: hq.y },
    { x: hq.x - 1, y: hq.y },
    { x: hq.x, y: hq.y + 1 },
    { x: hq.x, y: hq.y - 1 }
  ];

  return candidates.find((candidate) => canSpawnAirUnitAt(state, candidate.x, candidate.y)) ?? null;
}

function sideCanUseLuckySeven(state, side) {
  return hasSideEffect(state, side, "sable-lucky-seven");
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

export function getAttackModifier(state, unit) {
  return getDisplayedAttackValue(state, unit) - (unit?.stats?.attack ?? 0);
}

export function getArmorModifier(state, unit) {
  return getDisplayedArmorValue(state, unit) - (unit?.stats?.armor ?? 0);
}

export function getMovementModifier(state, unit) {
  return getDisplayedMovementValue(state, unit) - (unit?.stats?.movement ?? 0);
}

export function getRangeModifier(state, unit) {
  return getDisplayedRangeCapValue(state, unit) - (unit?.stats?.maxRange ?? 0);
}

export function getLuckModifier(state, unit) {
  return getDisplayedLuckValue(state, unit) - (unit?.stats?.luck ?? 0);
}

export function getDisplayedUnitAttack(state, unit) {
  return getDisplayedAttackValue(state, unit);
}

export function getDisplayedUnitArmor(state, unit) {
  return getDisplayedArmorValue(state, unit);
}

export function getDisplayedUnitMovement(state, unit) {
  return getDisplayedMovementValue(state, unit);
}

export function getDisplayedUnitRangeCap(state, unit) {
  return getDisplayedRangeCapValue(state, unit);
}

export function getDisplayedUnitLuck(state, unit) {
  return getDisplayedLuckValue(state, unit);
}

export function getPositionArmorMultiplier(state, unit) {
  return getPositionalArmorMultiplier(state, unit);
}

export function getAttackPowerForProfile(state, unit, attackProfile) {
  const baseAttack = attackProfile?.attack ?? unit?.stats?.attack ?? 0;
  return Math.max(0, Math.round(baseAttack * getAttackMultiplier(state, unit)));
}

export function getFinalStrikeModifiers(state, attacker, defender) {
  const attackerCommander = getCommanderForSide(state, attacker.owner);
  let damageMultiplier = 1;

  if (
    attackerCommander?.passive?.type === "blaze-scorched-earth" &&
    defender.current.hp < defender.stats.maxHealth
  ) {
    damageMultiplier *= attackerCommander.passive.damageMultiplier ?? 1;
  }

  const attackerLuck = getDisplayedUnitLuck(state, attacker);
  const defenderLuck = getDisplayedUnitLuck(state, defender);
  const critChance = sideCanUseLuckySeven(state, attacker.owner) ? attackerLuck * 10 : attackerLuck;
  const glanceChance = sideCanUseLuckySeven(state, defender.owner) ? defenderLuck * 10 : defenderLuck;

  return {
    damageMultiplier,
    critChance: Math.max(0, Math.min(100, Math.round(critChance))),
    glanceChance: Math.max(0, Math.min(100, Math.round(glanceChance))),
    canCrit: attackerCommander?.passive?.type === "sable-loaded-dice",
    canGlance: getCommanderForSide(state, defender.owner)?.passive?.type === "sable-loaded-dice"
  };
}

export function rollStrikeOutcome(state, attacker, defender, damage) {
  const modifiers = getFinalStrikeModifiers(state, attacker, defender);
  let nextDamage = Math.max(0, Math.round(damage * modifiers.damageMultiplier));
  let isCrit = false;
  let isGlance = false;

  if (modifiers.canCrit && modifiers.critChance > 0) {
    const critRoll = (state.seed % 100) + 1;
    state.seed = (state.seed * 48271 + 3) % 2147483647;

    if (critRoll <= modifiers.critChance) {
      isCrit = true;
      nextDamage *= 2;
    }
  }

  if (modifiers.canGlance && modifiers.glanceChance > 0) {
    const glanceRoll = (state.seed % 100) + 1;
    state.seed = (state.seed * 48271 + 5) % 2147483647;

    if (glanceRoll <= modifiers.glanceChance) {
      isGlance = true;
      nextDamage = Math.round(nextDamage * 0.5);
    }
  }

  return {
    damage: Math.max(0, nextDamage),
    isCrit,
    isGlance
  };
}

export function getStrikeOutcomeRange(state, attacker, defender, damageRange) {
  const modifiers = getFinalStrikeModifiers(state, attacker, defender);
  const baseMin = Math.max(0, Math.round(damageRange.min * modifiers.damageMultiplier));
  const baseMax = Math.max(0, Math.round(damageRange.max * modifiers.damageMultiplier));
  const minWithGlance = modifiers.canGlance && modifiers.glanceChance > 0
    ? Math.round(baseMin * 0.5)
    : baseMin;
  const maxWithCrit = modifiers.canCrit && modifiers.critChance > 0
    ? baseMax * 2
    : baseMax;

  return {
    min: Math.min(baseMin, minWithGlance),
    max: Math.max(baseMax, maxWithCrit)
  };
}

export function getIncomeBonus(_state, _side) {
  return 0;
}

export function getExperienceModifier(state, unit, options = {}) {
  const commander = getCommanderForSide(state, unit.owner);

  if (commander?.passive?.type === "graves-kill-confirm" && options.combatXp) {
    return 0.5;
  }

  return 0;
}

export function getRecruitDiscount() {
  return 0;
}

export function canResupplyUnit(_state, unit) {
  return Boolean(unit);
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
  const attackingPowerLocked =
    state.turn?.activeSide === attackingSide &&
    state[attackingSide]?.powerUsedTurn === state.turn?.number;
  const defendingPowerLocked =
    state.turn?.activeSide === defendingSide &&
    state[defendingSide]?.powerUsedTurn === state.turn?.number;

  if (!attackingPowerLocked) {
    state[attackingSide].charge = Math.min(
      getCommanderPowerMaxForSide(state, attackingSide),
      state[attackingSide].charge + damageDealt * 0.5
    );
  }

  if (!defendingPowerLocked) {
    state[defendingSide].charge = Math.min(
      getCommanderPowerMaxForSide(state, defendingSide),
      state[defendingSide].charge + damageTaken
    );
  }
}

function applyAtlasOverhaul(state, side, commander, notes) {
  healSide(state, side, commander.active.healRatio ?? 0.33);

  for (const unit of getLivingUnits(state, side)) {
    if (commander.active.cleanseNegativeStatuses) {
      cleanseNegativeStatusesFromUnit(unit);
    }
  }

  applyStatusToSide(state, side, "shield", commander.active.armor ?? 3);
  notes.push(`${commander.name} overhauled the line and restored allied systems.`);
  return { applied: true };
}

function applyViperBlitzSurge(state, side, commander, notes) {
  applyStatusToGroup(
    state,
    side,
    commander.active.attackGroup,
    "attackPercent",
    commander.active.attackPercent ?? 0.3
  );
  applyStatusToGroup(state, side, commander.active.movementGroup, "mobility", commander.active.movement ?? 2);
  notes.push(`${commander.name} pushed the fast wing forward.`);
  return { applied: true };
}

function applyRookHostileTakeover(state, side, commander, notes) {
  addSideEffect(state, side, { type: "rook-hostile-takeover" });
  notes.push(`${commander.name} turned every owned property into a front-line bonus.`);
  return { applied: true };
}

function applyEchoDisruption(state, side, commander, notes) {
  applyStatusToSide(
    state,
    getOpposingSide(side),
    "mobility",
    -(commander.active.movementPenalty ?? 1),
    { tickSide: side, negative: true }
  );

  for (const unit of getLivingUnits(state, getOpposingSide(side))) {
    applyCorruptedToUnit(state, unit, side);
  }

  notes.push(`${commander.name} disrupted enemy movement patterns.`);
  return { applied: true };
}

function applyBlazeIgnition(state, side, commander, notes) {
  for (const unit of getLivingUnits(state, getOpposingSide(side))) {
    const damage = getImmediateDamageAmount(unit, commander.active.damageRatio ?? 0.1);
    unit.current.hp = Math.max(0, unit.current.hp - damage);
    unit.statuses = unit.statuses.filter((status) => status.type !== "burn");
    unit.statuses.push({
      type: "burn",
      tickDamageRatio: commander.active.damageRatio ?? 0.1,
      negative: true
    });
  }

  notes.push(`${commander.name} ignited the enemy line.`);
  return { applied: true };
}

function applyKnoxFortressProtocol(state, side, commander, notes) {
  addSideEffect(state, side, {
    type: "knox-fortress-protocol",
    positionalArmorMultiplier: commander.active.positionalArmorMultiplier ?? 2,
    remainingNoDamageCombats: 1
  });
  notes.push(`${commander.name} locked the line into fortress mode.`);
  return { applied: true };
}

function applyFalconReinforcements(state, side, commander, notes) {
  const spawnPosition = getFalconSpawnPosition(state, side);

  if (!spawnPosition) {
    notes.push(`${commander.name} could not deploy reinforcements near HQ.`);
    return { applied: false };
  }

  const summon = createUnitFromType(commander.active.summonUnitTypeId ?? "gunship", side);
  summon.x = spawnPosition.x;
  summon.y = spawnPosition.y;
  summon.temporary = {
    source: "falcon-reinforcements",
    battleLocalOnly: true
  };
  state[side].units.push(summon);

  if (side === TURN_SIDES.ENEMY && state.enemyTurn?.started) {
    state.enemyTurn.pendingUnitIds.unshift(summon.id);
  }

  notes.push(`${commander.name} called in a Gunship near HQ.`);
  return { applied: true };
}

function applyGravesExecutionWindow(state, side, commander, notes) {
  addSideEffect(state, side, { type: "graves-execution-window" });
  notes.push(`${commander.name} opened a brutal counter window.`);
  return { applied: true };
}

function applyNovaOverload(state, side, commander, notes) {
  for (const unit of getLivingUnits(state, side)) {
    const ammoSpent = Math.max(0, unit.current.ammo);
    unit.current.ammo = 0;

    if (ammoSpent > 0) {
      unit.statuses.push({
        type: "attackPercent",
        value: ammoSpent * (commander.active.attackPercentPerAmmo ?? 0.1),
        currentTurnOnly: true
      });
    }
  }

  notes.push(`${commander.name} dumped every magazine into overload mode.`);
  return { applied: true };
}

function applySableLuckySeven(state, side, commander, notes) {
  addSideEffect(state, side, { type: "sable-lucky-seven" });
  notes.push(`${commander.name} tilted the odds in every exchange.`);
  return { applied: true };
}

const activeHandlers = {
  "atlas-overhaul": applyAtlasOverhaul,
  "viper-blitz-surge": applyViperBlitzSurge,
  "rook-hostile-takeover": applyRookHostileTakeover,
  "echo-disruption": applyEchoDisruption,
  "blaze-ignition": applyBlazeIgnition,
  "knox-fortress-protocol": applyKnoxFortressProtocol,
  "falcon-reinforcements": applyFalconReinforcements,
  "graves-execution-window": applyGravesExecutionWindow,
  "nova-overload": applyNovaOverload,
  "sable-lucky-seven": applySableLuckySeven
};

export function activateCommanderPower(state, side, seed) {
  const commander = getCommanderForSide(state, side);
  const notes = [];

  if (!commander) {
    return { changed: false, applied: false, seed: state.seed, notes };
  }

  if (state[side].charge < getCommanderPowerMaxForSide(state, side)) {
    return { changed: false, applied: false, seed: state.seed, notes };
  }

  const handler = activeHandlers[commander.active.type];

  if (!handler) {
    notes.push(`${commander.name}'s ${commander.active.name} has an unknown effect type.`);
    return { changed: false, applied: false, seed: state.seed, notes };
  }

  const outcome = handler(state, side, commander, notes) ?? { applied: true };

  if (!outcome.applied) {
    return { changed: false, applied: false, seed: state.seed, notes };
  }

  state[side].charge = 0;
  state[side].powerUsedTurn = state.turn?.number ?? null;

  return { changed: true, applied: true, seed: state.seed, notes };
}

export function expireCurrentTurnStatuses(state, side) {
  for (const unit of getLivingUnits(state, side)) {
    unit.statuses = unit.statuses.filter((status) => !status.currentTurnOnly && status.type !== "burn");
  }

  state[side].effects = (state[side]?.effects ?? []).filter((effect) => !effect.currentTurnOnly);
}

export function tickSideStatuses(state, side) {
  for (const owner of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    for (const unit of getLivingUnits(state, owner)) {
      const burnedStatus = getStatusEntries(unit, "burn")[0];

      if (burnedStatus && owner === side) {
        const burnDamage = getImmediateDamageAmount(unit, burnedStatus.tickDamageRatio ?? 0.1);
        unit.current.hp = Math.max(1, unit.current.hp - burnDamage);
      }

      unit.statuses = unit.statuses
        .map((status) => {
          const tickSide = status.tickSide ?? unit.owner;

          if (tickSide !== side || status.type === "burn") {
            return status;
          }

          return {
            ...status,
            turnsRemaining: getStatusTurnsRemaining(status) - 1
          };
        })
        .filter((status) => status.type === "burn" || getStatusTurnsRemaining(status) > 0);
    }
  }

  for (const trackedSide of [TURN_SIDES.PLAYER, TURN_SIDES.ENEMY]) {
    state[trackedSide].effects = (state[trackedSide]?.effects ?? [])
      .map((effect) => {
        const tickSide = effect.tickSide ?? trackedSide;

        if (tickSide !== side) {
          return effect;
        }

        return {
          ...effect,
          turnsRemaining: (effect.turnsRemaining ?? 0) - 1
        };
      })
      .filter((effect) => (effect.turnsRemaining ?? 0) > 0);
  }

  const commander = getCommanderForSide(state, side);

  if (commander?.passive.type === "atlas-field-repairs") {
    healSide(state, side, commander.passive.healRatio ?? 0.1);
  }
}

export function shouldPreventCombatDamage(state, attackerOwner, defenderOwner) {
  for (const protectedSide of [attackerOwner, defenderOwner]) {
    const matchingEffect = getSideEffects(state, protectedSide, "knox-fortress-protocol").find(
      (effect) =>
        (effect.remainingNoDamageCombats ?? 0) > 0 &&
        state.turn?.activeSide === getOpposingSide(protectedSide)
    );

    if (matchingEffect) {
      matchingEffect.remainingNoDamageCombats = 0;
      return true;
    }
  }

  return false;
}

export function shouldDefenderPreemptCombat(state, attacker, defender, { canCounter = true } = {}) {
  if (!canCounter || !attacker || !defender) {
    return false;
  }

  const attackerHasExecutionWindow = hasSideEffect(state, attacker.owner, "graves-execution-window");
  const defenderHasExecutionWindow = hasSideEffect(state, defender.owner, "graves-execution-window");

  // Mirror matches cancel back to normal attacker-first combat.
  return defenderHasExecutionWindow && !attackerHasExecutionWindow;
}
