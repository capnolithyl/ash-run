import {
  BUILDING_KEYS,
  TERRAIN_KEYS,
  TURN_SIDES,
  UNIT_TAGS
} from "../core/constants.js";
import { randomInt } from "../core/random.js";
import {
  getBattleEffectiveRunUpgrades,
  getEffectiveRunUpgradeIds,
  getRunUpgradeById,
  getRunUpgradeValue,
  hasEffectiveRunUpgrade
} from "../content/runUpgrades.js";

const PLAYER_CARD_SIDE = TURN_SIDES.PLAYER;
const CORRUPTED_STATS = ["attack", "armor", "range", "ammo", "stamina"];

function getAllUnits(state) {
  return [...(state?.player?.units ?? []), ...(state?.enemy?.units ?? [])];
}

function isPlayerCardTarget(unit) {
  return unit?.owner === PLAYER_CARD_SIDE;
}

function getValue(cardId, key, fallback = 0) {
  return getRunUpgradeValue(cardId, key, fallback);
}

function hasCard(state, cardId) {
  return hasEffectiveRunUpgrade(state, cardId);
}

function hasAnyCard(state, cardIds) {
  return cardIds.some((cardId) => hasCard(state, cardId));
}

function unitHasGear(unit, gearId) {
  return unit?.gear?.slot === gearId;
}

function hasAnyGear(unit, gearIds) {
  return gearIds.some((gearId) => unitHasGear(unit, gearId));
}

function getBuildingAt(state, x, y) {
  return state?.map?.buildings?.find((building) => building.x === x && building.y === y) ?? null;
}

function getTerrainKeyAt(state, x, y) {
  return state?.map?.tiles?.[y]?.[x] ?? null;
}

function getAdjacentAllies(state, unit) {
  if (!unit) {
    return [];
  }

  return getAllUnits(state).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.owner === unit.owner &&
      candidate.current?.hp > 0 &&
      !candidate.transport?.carriedByUnitId &&
      Math.abs(candidate.x - unit.x) + Math.abs(candidate.y - unit.y) === 1
  );
}

function hasAdjacentAlly(state, unit) {
  return getAdjacentAllies(state, unit).length > 0;
}

function isOnSector(state, unit) {
  return getBuildingAt(state, unit?.x, unit?.y)?.type === BUILDING_KEYS.SECTOR;
}

function isAtFullHealth(unit) {
  return (unit?.current?.hp ?? 0) >= (unit?.stats?.maxHealth ?? 0);
}

function isBelowHpRatio(unit, ratio) {
  if (!unit?.stats?.maxHealth) {
    return false;
  }

  return unit.current.hp / unit.stats.maxHealth < ratio;
}

function familyMatches(unit, family) {
  return unit?.family === family;
}

function cardIsActiveForUnit(state, unit, cardId, family = null) {
  return isPlayerCardTarget(unit) && hasCard(state, cardId) && (!family || familyMatches(unit, family));
}

function addIfActive(state, unit, cardId, key, family = null, condition = true) {
  return cardIsActiveForUnit(state, unit, cardId, family) && condition
    ? getValue(cardId, key)
    : 0;
}

function getActiveTierCardId(state, ids) {
  return ids.find((id) => hasCard(state, id)) ?? null;
}

function getGearTierId(unit, ids) {
  return ids.find((id) => unitHasGear(unit, id)) ?? null;
}

function ensureRunCardState(unit) {
  unit.runCardState ??= {};
  return unit.runCardState;
}

function applyDamage(unit, amount, { leaveAtOne = false } = {}) {
  const damage = Math.max(0, Math.round(amount));

  if (!unit || damage <= 0) {
    return 0;
  }

  const previousHp = unit.current.hp;
  const minimumHp = leaveAtOne ? 1 : 0;
  unit.current.hp = Math.max(minimumHp, unit.current.hp - damage);
  return previousHp - unit.current.hp;
}

function healUnit(unit, ratio) {
  if (!unit || ratio <= 0 || unit.current.hp <= 0 || unit.current.hp >= unit.stats.maxHealth) {
    return 0;
  }

  const amount = Math.max(1, Math.ceil(unit.stats.maxHealth * ratio));
  const previousHp = unit.current.hp;
  unit.current.hp = Math.min(unit.stats.maxHealth, unit.current.hp + amount);
  return unit.current.hp - previousHp;
}

function rollChance(state, chance) {
  const normalizedChance = Math.max(0, Math.min(1, Number(chance) || 0));

  if (normalizedChance <= 0) {
    return false;
  }

  if (normalizedChance >= 1) {
    return true;
  }

  const roll = randomInt(state.seed, 1, 10000);
  state.seed = roll.seed;
  return roll.value <= Math.round(normalizedChance * 10000);
}

function applyCorruptedToUnit(state, unit, sourceSide) {
  const roll = randomInt(state.seed, 0, CORRUPTED_STATS.length - 1);
  state.seed = roll.seed;
  unit.statuses ??= [];
  unit.statuses.push({
    type: "corrupted",
    stat: CORRUPTED_STATS[roll.value],
    turnsRemaining: 1,
    tickSide: sourceSide,
    negative: true
  });
}

export function isUnitZombified(unit) {
  return (unit?.statuses ?? []).some((status) => status.type === "zombified");
}

export function getRunCardAttackModifier(state, unit, { defender = null } = {}) {
  if (!isPlayerCardTarget(unit)) {
    return 0;
  }

  let modifier = 0;
  const adjacentAllyCount = getAdjacentAllies(state, unit).length;

  modifier += addIfActive(state, unit, "combat-stims-1", "attack");
  modifier += addIfActive(state, unit, "combat-stims-2", "attack");
  modifier += addIfActive(state, unit, "combat-stims-3", "attack");
  modifier += addIfActive(state, unit, "supply-mishap-1", "attack");
  modifier += addIfActive(state, unit, "supply-mishap-2", "attack");
  modifier += addIfActive(state, unit, "supply-mishap-3", "attack");
  modifier += addIfActive(state, unit, "glass-army-1", "attack");
  modifier += addIfActive(state, unit, "glass-army-2", "attack");
  modifier += addIfActive(state, unit, "glass-army-3", "attack");
  modifier += addIfActive(state, unit, "devils-ammo", "attack");
  modifier += addIfActive(state, unit, "overconfidence", "damage");

  modifier += addIfActive(state, unit, "shock-troops-1", "attack", UNIT_TAGS.INFANTRY, isAtFullHealth(unit));
  modifier += addIfActive(state, unit, "shock-troops-2", "attack", UNIT_TAGS.INFANTRY, isAtFullHealth(unit));
  modifier += addIfActive(state, unit, "shock-troops-3", "attack", UNIT_TAGS.INFANTRY);
  modifier += addIfActive(state, unit, "entrench-2", "attack", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "entrench-3", "attack", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "siege-package-3", "attack", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "heavy-payload-1", "attack", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "heavy-payload-2", "attack", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "heavy-payload-3", "attack", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "glass-cannons-1", "attack", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "glass-cannons-2", "attack", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "lone-wolf-1", "attack", null, adjacentAllyCount === 0);
  modifier += addIfActive(state, unit, "lone-wolf-2", "attack", null, adjacentAllyCount === 0);
  modifier += addIfActive(state, unit, "lone-wolf-3", "attack", null, adjacentAllyCount === 0);
  modifier += hasCard(state, "battle-brothers-1") ? adjacentAllyCount * getValue("battle-brothers-1", "attackPerAlly") : 0;
  modifier += hasCard(state, "battle-brothers-2") ? adjacentAllyCount * getValue("battle-brothers-2", "attackPerAlly") : 0;
  modifier += hasCard(state, "battle-brothers-3") ? adjacentAllyCount * getValue("battle-brothers-3", "attackPerAlly") : 0;

  for (const cardId of ["redline-1", "redline-2", "redline-3"]) {
    modifier += addIfActive(
      state,
      unit,
      cardId,
      "attack",
      null,
      isBelowHpRatio(unit, getValue(cardId, "hpRatioBelow"))
    );
  }

  if (defender && unit.family === UNIT_TAGS.AIR) {
    for (const cardId of ["low-altitude-strike-1", "low-altitude-strike-2"]) {
      const targetFamilies = getRunUpgradeById(cardId)?.values?.targetFamilies ?? [];
      modifier += addIfActive(state, unit, cardId, "attack", UNIT_TAGS.AIR, targetFamilies.includes(defender.family));
    }
  }

  return modifier;
}

export function getRunCardArmorModifier(state, unit) {
  if (!isPlayerCardTarget(unit)) {
    return 0;
  }

  let modifier = 0;
  const adjacentAllyCount = getAdjacentAllies(state, unit).length;

  modifier += addIfActive(state, unit, "passive-plating", "armor", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "armor-plating-1", "armor");
  modifier += addIfActive(state, unit, "armor-plating-2", "armor");
  modifier += addIfActive(state, unit, "armor-plating-3", "armor");
  modifier += addIfActive(state, unit, "entrench-1", "armor", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "entrench-2", "armor", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "entrench-3", "armor", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "glass-cannons-1", "armor", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "glass-cannons-2", "armor", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "hold-the-line", "armor", null, adjacentAllyCount > 0);
  modifier += hasCard(state, "battle-brothers-2") ? adjacentAllyCount * getValue("battle-brothers-2", "armorPerAlly") : 0;
  modifier += hasCard(state, "battle-brothers-3") ? adjacentAllyCount * getValue("battle-brothers-3", "armorPerAlly") : 0;
  modifier += addIfActive(state, unit, "glass-army-1", "armor");
  modifier += addIfActive(state, unit, "glass-army-2", "armor");
  modifier += addIfActive(state, unit, "glass-army-3", "armor");
  modifier += addIfActive(state, unit, "iron-army-1", "armor");
  modifier += addIfActive(state, unit, "iron-army-2", "armor");
  modifier += addIfActive(state, unit, "iron-army-3", "armor");

  return modifier;
}

export function getRunCardMovementModifier(state, unit) {
  if (!isPlayerCardTarget(unit)) {
    return 0;
  }

  let modifier = 0;

  modifier += addIfActive(state, unit, "passive-drill", "movement", UNIT_TAGS.INFANTRY);
  modifier += addIfActive(state, unit, "motorized-infantry-3", "movement", UNIT_TAGS.INFANTRY);
  modifier += addIfActive(state, unit, "pack-mules-3", "movement", UNIT_TAGS.INFANTRY);
  modifier += addIfActive(state, unit, "overclocked-engines-1", "movement", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "overclocked-engines-2", "movement", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "siege-package-1", "movement", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "siege-package-2", "movement", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "siege-package-3", "movement", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "afterburners-1", "movement", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "afterburners-2", "movement", UNIT_TAGS.AIR);
  modifier += addIfActive(state, unit, "iron-army-1", "movement");
  modifier += addIfActive(state, unit, "iron-army-2", "movement");
  modifier += addIfActive(state, unit, "glass-fuel-lines", "movement", UNIT_TAGS.VEHICLE);
  modifier += unit?.runCardState?.bloodTrailMovementBonus ?? 0;

  for (const cardId of ["redline-1", "redline-2", "redline-3"]) {
    modifier += addIfActive(
      state,
      unit,
      cardId,
      "movement",
      null,
      isBelowHpRatio(unit, getValue(cardId, "hpRatioBelow"))
    );
  }

  return modifier;
}

export function getRunCardRangeModifier(state, unit) {
  if (!isPlayerCardTarget(unit)) {
    return 0;
  }

  let modifier = 0;

  modifier += addIfActive(state, unit, "entrench-3", "range", UNIT_TAGS.INFANTRY, isOnSector(state, unit));
  modifier += addIfActive(state, unit, "siege-package-1", "range", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "siege-package-2", "range", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "siege-package-3", "range", UNIT_TAGS.VEHICLE);
  modifier += addIfActive(state, unit, "everything-is-a-missile", "range");

  if (hasCard(state, "battle-brothers-3") && hasAdjacentAlly(state, unit)) {
    const minimumRange = getValue("battle-brothers-3", "minimumRangeWithAlly");
    modifier += Math.max(0, minimumRange - (unit.stats.maxRange + modifier));
  }

  return modifier;
}

export function getRunCardPositionArmorBonus(state, unit, rawBonus) {
  if (!isPlayerCardTarget(unit) || !unitHasGear(unit, "gear-pathfinder-2")) {
    return 0;
  }

  if (getTerrainKeyAt(state, unit.x, unit.y) !== TERRAIN_KEYS.FOREST) {
    return 0;
  }

  return rawBonus * (getValue("gear-pathfinder-2", "forestArmorMultiplier", 1) - 1);
}

export function applyRunCardDeploymentEffectsToUnit(state, unit) {
  if (!isPlayerCardTarget(unit)) {
    return unit;
  }

  const maxHealthDelta =
    addIfActive(state, unit, "supply-mishap-1", "maxHealth") +
    addIfActive(state, unit, "supply-mishap-2", "maxHealth") +
    addIfActive(state, unit, "supply-mishap-3", "maxHealth");
  const staminaDelta =
    addIfActive(state, unit, "pack-mules-1", "staminaMax", UNIT_TAGS.INFANTRY) +
    addIfActive(state, unit, "pack-mules-2", "staminaMax", UNIT_TAGS.INFANTRY) +
    addIfActive(state, unit, "pack-mules-3", "staminaMax", UNIT_TAGS.INFANTRY) +
    addIfActive(state, unit, "heavy-payload-1", "staminaMax", UNIT_TAGS.VEHICLE) +
    addIfActive(state, unit, "heavy-payload-2", "staminaMax", UNIT_TAGS.VEHICLE) +
    addIfActive(state, unit, "heavy-payload-3", "staminaMax", UNIT_TAGS.VEHICLE) +
    addIfActive(state, unit, "fuel-reserve-1", "staminaMax", UNIT_TAGS.AIR) +
    addIfActive(state, unit, "fuel-reserve-2", "staminaMax", UNIT_TAGS.AIR);
  const ammoDelta =
    addIfActive(state, unit, "pack-mules-2", "ammoMax", UNIT_TAGS.INFANTRY) +
    addIfActive(state, unit, "pack-mules-3", "ammoMax", UNIT_TAGS.INFANTRY);

  unit.stats.maxHealth = Math.max(1, unit.stats.maxHealth + maxHealthDelta);
  unit.stats.staminaMax = Math.max(0, unit.stats.staminaMax + staminaDelta);
  unit.stats.ammoMax = Math.max(0, unit.stats.ammoMax + ammoDelta);
  unit.current.hp = Math.min(unit.stats.maxHealth, Math.max(1, unit.stats.maxHealth));
  unit.current.stamina = unit.stats.staminaMax;
  unit.current.ammo = unit.stats.ammoMax;
  return unit;
}

export function getRunCardTerrainMoveCost(state, unit, terrainKey, baseCost) {
  if (!unit) {
    return baseCost;
  }

  let cost = baseCost;

  if (isPlayerCardTarget(unit) && unit.family === UNIT_TAGS.INFANTRY) {
    if (terrainKey === TERRAIN_KEYS.ROAD) {
      if (hasCard(state, "motorized-infantry-2")) {
        cost *= getValue("motorized-infantry-2", "roadCostMultiplier", 1);
      } else if (hasCard(state, "motorized-infantry-1")) {
        cost *= getValue("motorized-infantry-1", "roadCostMultiplier", 1);
      }
    }

    if (terrainKey === TERRAIN_KEYS.PLAIN && hasCard(state, "motorized-infantry-2")) {
      cost *= getValue("motorized-infantry-2", "plainCostMultiplier", 1);
    }
  }

  if (isPlayerCardTarget(unit) && terrainKey === TERRAIN_KEYS.MOUNTAIN) {
    if (unitHasGear(unit, "gear-climbing-gear-3")) {
      cost = getValue("gear-climbing-gear-3", "mountainCost", cost);
    } else if (unitHasGear(unit, "gear-climbing-gear-2")) {
      cost = getValue("gear-climbing-gear-2", "mountainCost", cost);
    } else if (unitHasGear(unit, "gear-climbing-gear-1")) {
      cost += getValue("gear-climbing-gear-1", "mountainCostDelta", 0);
    }
  }

  if (isPlayerCardTarget(unit) && terrainKey === TERRAIN_KEYS.RIDGE && unitHasGear(unit, "gear-climbing-gear-3")) {
    cost = getValue("gear-climbing-gear-3", "ridgeCost", cost);
  }

  if (isPlayerCardTarget(unit) && terrainKey === TERRAIN_KEYS.FOREST && unitHasGear(unit, "gear-pathfinder-1")) {
    cost = getValue("gear-pathfinder-1", "forestCost", cost);
  }

  return Math.max(0.25, cost);
}

export function canRunCardUnitCrossBlockedTerrain(state, unit, terrainKey) {
  return (
    isPlayerCardTarget(unit) &&
    terrainKey === TERRAIN_KEYS.RIDGE &&
    unit.family === UNIT_TAGS.INFANTRY &&
    unitHasGear(unit, "gear-climbing-gear-3")
  );
}

export function getRunCardStaminaCostMultiplier(state, unit) {
  if (!unit) {
    return 1;
  }

  if (isPlayerCardTarget(unit)) {
    if (unit.family === UNIT_TAGS.AIR && hasCard(state, "afterburners-1")) {
      return Math.max(1, getValue("afterburners-1", "staminaCostMultiplier", 1));
    }

    if (hasCard(state, "iron-army-3")) {
      return Math.max(1, getValue("iron-army-3", "staminaCostMultiplier", 1));
    }
  }

  if (unit.owner === TURN_SIDES.ENEMY) {
    if (hasCard(state, "dust-storm-3")) {
      return Math.max(1, getValue("dust-storm-3", "staminaCostMultiplier", 1));
    }

    if (hasCard(state, "dust-storm-2")) {
      return Math.max(1, getValue("dust-storm-2", "staminaCostMultiplier", 1));
    }
  }

  return 1;
}

export function getRunCardAmmoCostForAttack(state, unit, baseCost = 1) {
  if (baseCost <= 0) {
    return 0;
  }

  if (isPlayerCardTarget(unit)) {
    if (hasCard(state, "ammo-optional-2")) {
      return 0;
    }

    if (hasCard(state, "ammo-optional-1") && rollChance(state, getValue("ammo-optional-1", "freeAmmoChance"))) {
      return 0;
    }
  }

  if (unit?.owner === TURN_SIDES.ENEMY) {
    const dustCardId = getActiveTierCardId(state, ["dust-storm-3", "dust-storm-2", "dust-storm-1"]);

    if (dustCardId && rollChance(state, getValue(dustCardId, "extraAmmoChance", 1))) {
      return Math.max(baseCost, getValue(dustCardId, "ammoCost", baseCost));
    }
  }

  return baseCost;
}

export function applyRunCardStrikeModifiers(state, attacker, defender, strike) {
  const notes = [];
  const nextStrike = { ...strike };

  if (defender?.owner === PLAYER_CARD_SIDE && hasCard(state, "overconfidence")) {
    nextStrike.damage += getValue("overconfidence", "incomingDamage");
  }

  if (!isPlayerCardTarget(attacker)) {
    return { strike: nextStrike, notes };
  }

  if (hasCard(state, "overconfidence")) {
    nextStrike.damage += getValue("overconfidence", "damage");
  }

  const experimentalCardId = getActiveTierCardId(state, ["experimental-ammunition-2", "experimental-ammunition-1"]);

  if (experimentalCardId) {
    if (rollChance(state, getValue(experimentalCardId, "doubleDamageChance"))) {
      nextStrike.damage *= 2;
      notes.push(`${attacker.name}'s experimental ammunition spiked the shot.`);
    }

    if (
      getValue(experimentalCardId, "instantDestroyChance") > 0 &&
      rollChance(state, getValue(experimentalCardId, "instantDestroyChance"))
    ) {
      nextStrike.damage = Math.max(nextStrike.damage, defender.current.hp);
      notes.push(`${attacker.name}'s experimental ammunition breached ${defender.name}.`);
    }

    if (rollChance(state, getValue(experimentalCardId, "recoilChance"))) {
      const recoilDamage = applyDamage(
        attacker,
        Math.ceil(attacker.stats.maxHealth * getValue(experimentalCardId, "recoilRatio")),
        { leaveAtOne: false }
      );
      notes.push(`${attacker.name}'s experimental ammunition recoiled for ${recoilDamage} damage.`);
    }
  }

  if (hasCard(state, "devils-ammo")) {
    const chance = Math.max(0, getValue("devils-ammo", "selfDamageBaseChance") - (attacker.stats.luck ?? 0) / 100);

    if (rollChance(state, chance)) {
      const recoilDamage = applyDamage(attacker, Math.max(1, nextStrike.damage), { leaveAtOne: false });
      nextStrike.damage = 0;
      notes.push(`${attacker.name}'s Devil's Ammo backfired for ${recoilDamage} damage.`);
    }
  }

  return { strike: nextStrike, notes };
}

export function applyRunCardOnDamageDealt(state, attacker, defender, damageDealt) {
  const notes = [];

  if (!attacker || !defender || damageDealt <= 0) {
    return notes;
  }

  if (unitHasGear(attacker, "gear-toolkit")) {
    applyCorruptedToUnit(state, defender, attacker.owner);
    notes.push(`${defender.name} was corrupted by ${attacker.name}'s Toolkit.`);
  }

  if (unitHasGear(attacker, "gear-flamethrower")) {
    defender.statuses ??= [];
    defender.statuses = defender.statuses.filter((status) => status.type !== "burn");
    defender.statuses.push({
      type: "burn",
      tickDamageRatio: 0.1,
      negative: true
    });
    notes.push(`${defender.name} was burned by ${attacker.name}'s Flamethrower.`);
  }

  if (unitHasGear(attacker, "gear-patient-zero")) {
    defender.statuses ??= [];
    defender.statuses.push({
      type: "zombified",
      negative: true,
      permanent: true
    });
    notes.push(`${defender.name} was zombified.`);
  }

  return notes;
}

export function applyRunCardOnKillEffects(state, attacker, defender) {
  const notes = [];

  if (!attacker || !defender || defender.current.hp > 0) {
    return notes;
  }

  if (unitHasGear(attacker, "gear-scavengers")) {
    const healed = healUnit(attacker, getValue("gear-scavengers", "healRatio"));

    if (healed > 0) {
      notes.push(`${attacker.name}'s Scavengers gear restored ${healed} HP.`);
    }
  }

  if (unitHasGear(attacker, "gear-predators")) {
    const attackGain = getValue("gear-predators", "attack");
    attacker.stats.attack += attackGain;
    notes.push(`${attacker.name}'s Predators gear gained +${attackGain} attack.`);
  }

  if (unitHasGear(attacker, "gear-blood-trail") && !attacker.runCardState?.bloodTrailUsed) {
    const stateBucket = ensureRunCardState(attacker);
    stateBucket.bloodTrailUsed = true;
    stateBucket.bloodTrailMovementBonus = (stateBucket.bloodTrailMovementBonus ?? 0) + getValue("gear-blood-trail", "movement");
    notes.push(`${attacker.name}'s Blood Trail gear gained +${getValue("gear-blood-trail", "movement")} movement.`);
  }

  return notes;
}

export function applyRunCardChainReaction(state, attacker, destroyedUnit) {
  const notes = [];
  const cardId = getActiveTierCardId(state, ["chain-reaction-3", "chain-reaction-2", "chain-reaction-1"]);

  if (!cardId || destroyedUnit?.family !== UNIT_TAGS.VEHICLE || destroyedUnit.owner !== TURN_SIDES.ENEMY) {
    return notes;
  }

  const damage = getValue(cardId, "damage");
  const excludeAttacker = Boolean(getValue(cardId, "excludeAttacker"));

  for (const unit of getAllUnits(state)) {
    if (unit.current.hp <= 0 || unit.id === destroyedUnit.id) {
      continue;
    }

    if (excludeAttacker && attacker?.id === unit.id) {
      continue;
    }

    if (Math.abs(unit.x - destroyedUnit.x) + Math.abs(unit.y - destroyedUnit.y) !== 1) {
      continue;
    }

    const dealt = applyDamage(unit, damage);
    notes.push(`${destroyedUnit.name}'s wreck exploded for ${dealt} damage to ${unit.name}.`);
  }

  return notes;
}

export function canRunCardRepositionAfterAttack(state, attacker, { killed = false } = {}) {
  if (!isPlayerCardTarget(attacker) || attacker.transport?.carriedByUnitId) {
    return false;
  }

  if (hasCard(state, "canto-2")) {
    return true;
  }

  if (killed && hasAnyCard(state, ["canto-1"])) {
    return true;
  }

  if (attacker.family === UNIT_TAGS.INFANTRY && killed && hasCard(state, "bayonet-charge")) {
    return true;
  }

  return attacker.family === UNIT_TAGS.AIR && hasCard(state, "hit-and-run");
}

export function applyRunCardTurnStartEffects(state, side) {
  if (side !== PLAYER_CARD_SIDE) {
    return [];
  }

  const notes = [];
  const fieldRepairId = getActiveTierCardId(state, ["field-repairs-3", "field-repairs-2", "field-repairs-1"]);

  for (const unit of state.player.units) {
    if (unit.current.hp <= 0) {
      continue;
    }

    if (fieldRepairId) {
      const requiresNoMove = Boolean(getValue(fieldRepairId, "requiresNoMove"));

      if (!requiresNoMove || !unit.lastTurnMoved) {
        const healed = healUnit(unit, getValue(fieldRepairId, "healRatio"));

        if (healed > 0) {
          notes.push(`${unit.name} restored ${healed} HP from Field Repairs.`);
        }
      }
    }

    if (unit.family === UNIT_TAGS.VEHICLE && hasCard(state, "glass-fuel-lines")) {
      const damage = applyDamage(unit, Math.ceil(unit.stats.maxHealth * getValue("glass-fuel-lines", "turnDamageRatio")));

      if (damage > 0) {
        notes.push(`${unit.name}'s glass fuel lines ruptured for ${damage} damage.`);
      }
    }
  }

  return notes;
}

export function describeRunCardsForState(state) {
  const activeCards = getBattleEffectiveRunUpgrades(state);
  const gearCards = getAllUnits(state)
    .filter((unit) => unit.owner === PLAYER_CARD_SIDE && unit.gear?.slot)
    .map((unit) => ({
      unitId: unit.id,
      unitName: unit.name,
      card: getRunUpgradeById(unit.gear.slot)
    }))
    .filter((entry) => entry.card);

  return {
    activeCards,
    gearCards
  };
}

export function getRunCardIdsForBattleState(runState, roster = []) {
  return getEffectiveRunUpgradeIds([
    ...(runState?.ownedRunCardIds ?? []),
    ...(runState?.selectedRewards ?? []).map((reward) => reward.id),
    ...roster.map((unit) => unit?.gear?.slot).filter(Boolean)
  ]);
}

export function canRunCardsAffectBattle(state) {
  return (state?.runCards?.ownedCardIds?.length ?? 0) > 0;
}
