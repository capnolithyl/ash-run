import {
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_POWER_OVERLAY_DISPLAY_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  getBattleMoveDuration
} from "../../core/constants.js";
import { getXpThreshold } from "../../simulation/progression.js";
import { getMovementPath } from "../../simulation/selectors.js";
import {
  getMovementModifier,
  shouldDefenderPreemptCombat
} from "../../simulation/commanderEffects.js";
import { getUnitSpriteDefinition } from "../assets.js";
import { getUnitMovementPlayback } from "./unitAnimationHelpers.js";

function getUnits(snapshot) {
  return [...snapshot.player.units, ...snapshot.enemy.units];
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function getNewPresentationEvents(previousSnapshot, nextSnapshot) {
  const previousIds = new Set(
    (previousSnapshot?.presentation?.events ?? []).map((event) => event.id)
  );

  return (nextSnapshot?.presentation?.events ?? []).filter(
    (event) => Number.isInteger(event.id) && !previousIds.has(event.id)
  );
}

function manhattanDistance(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function isWithinRange(unit, target) {
  const distance = manhattanDistance(unit, target);
  return distance >= unit.stats.minRange && distance <= unit.stats.maxRange;
}

function getAttackPairKey(leftId, rightId) {
  return [leftId, rightId].sort().join("::");
}

function isPendingMoveRollback(previousSnapshot, unitId, previousUnit, nextUnit) {
  const pendingAction = previousSnapshot.presentation?.pendingAction ?? previousSnapshot.pendingAction;

  return Boolean(
    pendingAction?.type === "move" &&
    pendingAction.unitId === unitId &&
    previousUnit.x === pendingAction.toX &&
    previousUnit.y === pendingAction.toY &&
    nextUnit.x === pendingAction.fromX &&
    nextUnit.y === pendingAction.fromY
  );
}

function didUnitSpendAmmo(previousUnit, nextUnit) {
  return Boolean(previousUnit && nextUnit && previousUnit.current.ammo > nextUnit.current.ammo);
}

function didUnitStartAttack(previousUnit, nextUnit) {
  return Boolean(previousUnit && nextUnit && !previousUnit.hasAttacked && nextUnit.hasAttacked);
}

function didUnitAttack(previousUnit, nextUnit) {
  return didUnitSpendAmmo(previousUnit, nextUnit) || didUnitStartAttack(previousUnit, nextUnit);
}

function getGainedExperience(previousUnit, nextUnit) {
  if (nextUnit.level === previousUnit.level) {
    return Math.max(0, nextUnit.experience - previousUnit.experience);
  }

  let gained = Math.max(0, getXpThreshold(previousUnit.level) - previousUnit.experience);

  for (let level = previousUnit.level + 1; level < nextUnit.level; level += 1) {
    gained += getXpThreshold(level);
  }

  gained += nextUnit.experience;
  return gained;
}

export const EXPERIENCE_SEGMENT_COMPLETE_MS = 440;
export const EXPERIENCE_SEGMENT_GAIN_MS = 620;
export const EXPERIENCE_LEVEL_CHAIN_DELAY_MS = 120;
export const EXPERIENCE_REVEAL_DELAY_MS = 180;
export const EXPERIENCE_EXIT_DELAY_MS = 120;
export const EXPERIENCE_EXIT_DURATION_MS = 280;
export const COMMANDER_POWER_TARGET_STAGGER_MS = 85;
export const COMMANDER_POWER_PULSE_DURATION_MS = 620;
export const AIR_STRIKE_FLYOVER_DURATION_MS = 1100;
export const AIR_STRIKE_IMPACT_DELAY_MS = 520;

function getTurnTransitionDelayMs(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || previousSnapshot.turn.activeSide === nextSnapshot.turn.activeSide) {
    return 0;
  }

  return BATTLE_TURN_BANNER_SETTLE_MS;
}

function getMovementEventDurationMs(event, colorOptions = {}) {
  if (event.teleport) {
    return 0;
  }

  const moveSegments = Math.max(0, (event.path?.length ?? 1) - 1);
  const spriteDefinition = getUnitSpriteDefinition(
    event.unitTypeId,
    event.owner,
    colorOptions
  );
  return getUnitMovementPlayback(spriteDefinition, moveSegments).totalDurationMs;
}

function buildExperienceSegments(previousUnit, nextUnit) {
  const segments = [];

  if (nextUnit.level === previousUnit.level) {
    segments.push({
      level: previousUnit.level,
      threshold: getXpThreshold(previousUnit.level),
      fromExperience: previousUnit.experience,
      toExperience: nextUnit.experience
    });
    return segments;
  }

  segments.push({
    level: previousUnit.level,
    threshold: getXpThreshold(previousUnit.level),
    fromExperience: previousUnit.experience,
    toExperience: getXpThreshold(previousUnit.level)
  });

  for (let level = previousUnit.level + 1; level < nextUnit.level; level += 1) {
    segments.push({
      level,
      threshold: getXpThreshold(level),
      fromExperience: 0,
      toExperience: getXpThreshold(level)
    });
  }

  if (nextUnit.experience > 0) {
    segments.push({
      level: nextUnit.level,
      threshold: getXpThreshold(nextUnit.level),
      fromExperience: 0,
      toExperience: nextUnit.experience
    });
  }

  return segments;
}

function buildExperienceTimingMetadata(event, startDelayMs) {
  const segments = event.segments ?? [];
  let cursor = startDelayMs;
  const thresholdHitDelaysMs = [];
  const segmentTimings = segments.map((segment, index) => {
    const durationMs =
      segment.toExperience >= segment.threshold
        ? EXPERIENCE_SEGMENT_COMPLETE_MS
        : EXPERIENCE_SEGMENT_GAIN_MS;
    const thresholdHitDelayMs =
      segment.toExperience >= segment.threshold ? cursor + durationMs : null;
    const timing = {
      ...segment,
      startDelayMs: cursor,
      durationMs,
      endDelayMs: cursor + durationMs,
      thresholdHitDelayMs
    };

    if (thresholdHitDelayMs !== null) {
      thresholdHitDelaysMs.push(thresholdHitDelayMs);
    }

    cursor = timing.endDelayMs;

    if (thresholdHitDelayMs !== null && index < segments.length - 1) {
      cursor += EXPERIENCE_LEVEL_CHAIN_DELAY_MS;
    }

    return timing;
  });

  const endDelayMs =
    cursor + EXPERIENCE_EXIT_DELAY_MS + (segments.length > 0 ? EXPERIENCE_EXIT_DURATION_MS : 0);

  return {
    startDelayMs,
    segmentTimings,
    thresholdHitDelaysMs,
    durationMs: Math.max(0, endDelayMs - startDelayMs),
    endDelayMs
  };
}

function getExperienceEventDuration(event) {
  if (Number.isFinite(event.durationMs)) {
    return event.durationMs;
  }

  const segments = event.segments ?? [];

  if (segments.length === 0) {
    return 0;
  }

  let duration = 0;

  segments.forEach((segment, index) => {
    duration += segment.toExperience >= segment.threshold
      ? EXPERIENCE_SEGMENT_COMPLETE_MS
      : EXPERIENCE_SEGMENT_GAIN_MS;

    if (segment.toExperience >= segment.threshold && index < segments.length - 1) {
      duration += EXPERIENCE_LEVEL_CHAIN_DELAY_MS;
    }
  });

  return duration + EXPERIENCE_EXIT_DELAY_MS + EXPERIENCE_EXIT_DURATION_MS;
}

function getBattleAnimationEventDurationMs(event) {
  if (Number.isFinite(event.durationMs)) {
    return event.durationMs;
  }

  switch (event.type) {
    case "move": {
      if (event.teleport) {
        return 0;
      }

      const moveSegments = Math.max(0, (event.path?.length ?? 1) - 1);
      return getBattleMoveDuration(moveSegments) + BATTLE_MOVE_SETTLE_MS;
    }
    case "attack":
      return BATTLE_ATTACK_WINDOW_MS;
    case "heal":
    case "resupply":
      return 560;
    case "experience":
      return getExperienceEventDuration(event);
    case "power":
      return event.powerType === "falcon-air-strike"
        ? event.durationMs
        : COMMANDER_POWER_PULSE_DURATION_MS;
    case "capture":
      return 520;
    case "deploy":
      return 420;
    case "destroy":
      return 340;
    default:
      return 0;
  }
}

function getBattleAnimationEventStartDelayMs(event) {
  if (Number.isFinite(event.startDelayMs)) {
    return event.startDelayMs;
  }

  if (event.type === "attack" || event.type === "destroy") {
    return event.delay ?? 0;
  }

  return 0;
}

function getBattleAnimationDurationMs(
  events,
  { combatCutsceneDurationMs = 0, postCombatDelayMs = 0 } = {}
) {
  if (!events?.length) {
    return 0;
  }

  return events.reduce((maxDuration, event) => {
    const durationMs = getBattleAnimationEventDurationMs(event);
    const startDelayMs = getBattleAnimationEventStartDelayMs(event);
    const effectiveStartDelayMs =
      combatCutsceneDurationMs > 0 && (event.type === "experience" || event.type === "destroy")
        ? Math.max(startDelayMs, combatCutsceneDurationMs + postCombatDelayMs)
        : startDelayMs;
    const endDelayMs = Number.isFinite(event.endDelayMs)
      ? effectiveStartDelayMs + durationMs
      : effectiveStartDelayMs + durationMs;

    return Math.max(maxDuration, endDelayMs);
  }, 0);
}

function sortPowerTargets(targets, side) {
  const horizontalDirection = side === "enemy" ? -1 : 1;

  return [...targets].sort(
    (left, right) =>
      left.y - right.y ||
      horizontalDirection * (left.x - right.x) ||
      left.unitId.localeCompare(right.unitId)
  );
}

function buildCommanderPowerEvent(previousSnapshot, nextSnapshot, previousUnits, nextUnits) {
  const previousActivationId = previousSnapshot?.lastPowerResult?.activationId ?? null;
  const powerResult = nextSnapshot?.lastPowerResult ?? null;

  if (!powerResult?.activationId || powerResult.activationId === previousActivationId) {
    return null;
  }

  const targets = sortPowerTargets(
    (powerResult.targets ?? [])
      .map((target) => {
        const nextUnit = nextUnits.get(target.unitId) ?? null;
        const previousUnit = previousUnits.get(target.unitId) ?? null;
        const unit = nextUnit ?? previousUnit;

        return unit &&
          Number.isInteger(target.x ?? unit.x) &&
          Number.isInteger(target.y ?? unit.y)
          ? {
              ...target,
              owner: target.owner ?? unit.owner,
              x: target.x ?? unit.x,
              y: target.y ?? unit.y,
              unitTypeId: target.unitTypeId ?? unit.unitTypeId
            }
          : null;
      })
      .filter(Boolean),
    powerResult.side
  );
  const isAirStrike = powerResult.powerType === "falcon-air-strike";

  if (targets.length === 0 && !isAirStrike) {
    return null;
  }

  const startDelayMs = BATTLE_POWER_OVERLAY_DISPLAY_MS;
  const targetStaggerMs = isAirStrike ? 0 : COMMANDER_POWER_TARGET_STAGGER_MS;
  const impactDelayMs = isAirStrike ? AIR_STRIKE_IMPACT_DELAY_MS : 0;
  const flightDurationMs = isAirStrike ? AIR_STRIKE_FLYOVER_DURATION_MS : 0;
  const effectDurationMs = isAirStrike
    ? Math.max(flightDurationMs, impactDelayMs + COMMANDER_POWER_PULSE_DURATION_MS)
    : Math.max(0, targets.length - 1) * targetStaggerMs + COMMANDER_POWER_PULSE_DURATION_MS;
  const endDelayMs =
    startDelayMs +
    effectDurationMs;

  return {
    type: "power",
    activationId: powerResult.activationId,
    side: powerResult.side,
    commanderId: powerResult.commanderId,
    commanderName: powerResult.commanderName,
    commanderTitle: powerResult.commanderTitle,
    powerName: powerResult.powerName,
    powerType: powerResult.powerType,
    accent: powerResult.accent,
    center: powerResult.center ?? null,
    areaTiles: powerResult.areaTiles ?? [],
    mapWidth: nextSnapshot.map.width,
    mapHeight: nextSnapshot.map.height,
    flyoverDirection: powerResult.side === "enemy" ? -1 : 1,
    targets,
    targetStaggerMs,
    pulseDurationMs: COMMANDER_POWER_PULSE_DURATION_MS,
    impactDelayMs,
    flightDurationMs,
    startDelayMs,
    durationMs: effectDurationMs,
    endDelayMs
  };
}

export function getBattleSnapshotTransitionDurationMs(
  previousSnapshot,
  nextSnapshot,
  {
    combatCutsceneDurationMs = 0,
    postCombatDelayMs = 0,
    colorOptions = {}
  } = {}
) {
  return getBattleAnimationDurationMs(
    deriveBattleAnimationEvents(previousSnapshot, nextSnapshot, colorOptions),
    { combatCutsceneDurationMs, postCombatDelayMs }
  );
}

export function deriveBattleAnimationEvents(
  previousSnapshot,
  nextSnapshot,
  colorOptions = {}
) {
  if (
    !previousSnapshot ||
    !nextSnapshot ||
    previousSnapshot.id !== nextSnapshot.id ||
    previousSnapshot.map.id !== nextSnapshot.map.id
  ) {
    return [];
  }

  const previousUnits = indexById(getUnits(previousSnapshot));
  const nextUnits = indexById(getUnits(nextSnapshot));
  const previousBuildings = indexById(previousSnapshot.map.buildings);
  const nextBuildings = indexById(nextSnapshot.map.buildings);
  const presentationEvents = getNewPresentationEvents(previousSnapshot, nextSnapshot);
  const authoritativeStrikes = presentationEvents.filter((event) => event.type === "strike");
  const authoritativeTransportEvents = presentationEvents.filter(
    (event) => event.type === "transport"
  );
  const transportedPassengerIds = new Set(
    authoritativeTransportEvents.map((event) => event.passengerId)
  );
  const authoritativeServicesByTarget = new Map();
  presentationEvents
    .filter((event) => event.type === "service" && event.targetId)
    .forEach((event) => {
      const services = authoritativeServicesByTarget.get(event.targetId) ?? [];
      services.push(event);
      authoritativeServicesByTarget.set(event.targetId, services);
    });

  const damagedTargets = [];
  const movements = [];
  const attacks = [];
  const restores = [];
  const experience = [];
  const deployments = [];
  const captures = [];
  const destroys = [];

  for (const [unitId, previousUnit] of previousUnits.entries()) {
    const nextUnit = nextUnits.get(unitId);

    if (!nextUnit) {
      damagedTargets.push({
        id: unitId,
        owner: previousUnit.owner,
        x: previousUnit.x,
        y: previousUnit.y,
        amount: previousUnit.current.hp
      });
      destroys.push({
        type: "destroy",
        unitId,
        owner: previousUnit.owner,
        x: previousUnit.x,
        y: previousUnit.y
      });
      continue;
    }

    if (nextUnit.current.hp < previousUnit.current.hp) {
      damagedTargets.push({
        id: unitId,
        owner: nextUnit.owner,
        x: nextUnit.x,
        y: nextUnit.y,
        amount: previousUnit.current.hp - nextUnit.current.hp
      });
    }

    if (previousUnit.transport?.carriedByUnitId && !nextUnit.transport?.carriedByUnitId) {
      deployments.push({
        type: "deploy",
        unitId,
        owner: nextUnit.owner,
        x: nextUnit.x,
        y: nextUnit.y,
        fromUnload: true,
        carrierId: previousUnit.transport.carriedByUnitId
      });
    }

    if (
      !previousUnit.transport?.carriedByUnitId &&
      !nextUnit.transport?.carriedByUnitId &&
      !transportedPassengerIds.has(unitId) &&
      (nextUnit.x !== previousUnit.x || nextUnit.y !== previousUnit.y)
    ) {
      if (isPendingMoveRollback(previousSnapshot, unitId, previousUnit, nextUnit)) {
        movements.push({
          type: "move",
          unitId,
          owner: nextUnit.owner,
          unitTypeId: nextUnit.unitTypeId,
          teleport: true
        });
        continue;
      }

      const movementBudget =
        previousUnit.stats.movement + getMovementModifier(previousSnapshot, previousUnit);
      const path = getMovementPath(
        previousSnapshot,
        previousUnit,
        movementBudget,
        nextUnit.x,
        nextUnit.y
      );

      if (path.length > 1) {
        movements.push({
          type: "move",
          unitId,
          owner: nextUnit.owner,
          unitTypeId: nextUnit.unitTypeId,
          path
        });
      }
    }

    const hpRecovered = nextUnit.current.hp > previousUnit.current.hp;
    const ammoRecovered = nextUnit.current.ammo > previousUnit.current.ammo;
    const staminaRecovered = nextUnit.current.stamina > previousUnit.current.stamina;
    const authoritativeServices = authoritativeServicesByTarget.get(unitId) ?? [];

    if (authoritativeServices.length > 0) {
      authoritativeServices.forEach((service) => {
        restores.push({
          type: (service.hpRecovered ?? 0) > 0 ? "heal" : "resupply",
          eventId: service.id,
          actorId: service.actorId ?? null,
          unitId,
          owner: nextUnit.owner,
          x: service.x ?? nextUnit.x,
          y: service.y ?? nextUnit.y,
          amount: service.hpRecovered ?? 0,
          ammoAmount: service.ammoRecovered ?? 0,
          staminaAmount: service.staminaRecovered ?? 0,
          sourceKind: service.sourceKind,
          sourceId: service.sourceId,
          buildingType: service.buildingType ?? null
        });
      });
    } else if (
      nextUnit.level === previousUnit.level &&
      (hpRecovered || ammoRecovered || staminaRecovered)
    ) {
      restores.push({
        type: hpRecovered ? "heal" : "resupply",
        unitId,
        owner: nextUnit.owner,
        x: nextUnit.x,
        y: nextUnit.y,
        amount: hpRecovered ? nextUnit.current.hp - previousUnit.current.hp : 0,
        ammoAmount: ammoRecovered ? nextUnit.current.ammo - previousUnit.current.ammo : 0,
        staminaAmount: staminaRecovered ? nextUnit.current.stamina - previousUnit.current.stamina : 0
      });
    }

    if (nextUnit.level > previousUnit.level || nextUnit.experience !== previousUnit.experience) {
      experience.push({
        type: "experience",
        unitId,
        owner: nextUnit.owner,
        x: nextUnit.x,
        y: nextUnit.y,
        gained: getGainedExperience(previousUnit, nextUnit),
        previousLevel: previousUnit.level,
        nextLevel: nextUnit.level,
        previousExperience: previousUnit.experience,
        nextExperience: nextUnit.experience,
        previousThreshold: getXpThreshold(previousUnit.level),
        nextThreshold: getXpThreshold(nextUnit.level),
        segments: buildExperienceSegments(previousUnit, nextUnit)
      });
    }
  }

  authoritativeTransportEvents
    .filter((event) => event.action === "unload")
    .forEach((event) => {
      if (deployments.some((deployment) => deployment.unitId === event.passengerId)) {
        return;
      }

      deployments.push({
        type: "deploy",
        eventId: event.id,
        unitId: event.passengerId,
        owner: event.owner,
        x: event.x,
        y: event.y,
        fromUnload: true,
        carrierId: event.carrierId
      });
    });

  for (const [unitId, nextUnit] of nextUnits.entries()) {
    const previousUnit = previousUnits.get(unitId);

    if (!previousUnit) {
      deployments.push({
        type: "deploy",
        unitId,
        owner: nextUnit.owner,
        x: nextUnit.x,
        y: nextUnit.y
      });
      continue;
    }

    if (authoritativeStrikes.length > 0 || !didUnitAttack(previousUnit, nextUnit)) {
      continue;
    }

    const target = damagedTargets
      .filter((candidate) => candidate.owner !== nextUnit.owner && isWithinRange(nextUnit, candidate))
      .sort((left, right) => manhattanDistance(nextUnit, left) - manhattanDistance(nextUnit, right))[0];

    if (!target) {
      continue;
    }

    attacks.push({
      type: "attack",
      attackerId: unitId,
      owner: nextUnit.owner,
      fromX: nextUnit.x,
      fromY: nextUnit.y,
      toX: target.x,
      toY: target.y,
      targetId: target.id,
      damage: target.amount ?? 0,
      isInitiator: !previousUnit.hasAttacked && nextUnit.hasAttacked
    });
  }

  authoritativeStrikes.forEach((event) => {
    attacks.push({
      type: "attack",
      eventId: event.id,
      combatId: event.combatId,
      strikeOrder: event.order ?? 0,
      phase: event.phase,
      profile: event.profile,
      weaponType: event.weaponType,
      weaponClass: event.weaponClass,
      isCrit: Boolean(event.isCrit),
      isGlance: Boolean(event.isGlance),
      isEffective: Boolean(event.isEffective),
      killed: Boolean(event.killed),
      attackerId: event.attackerId,
      owner: event.attackerOwner,
      fromX: event.fromX,
      fromY: event.fromY,
      toX: event.toX,
      toY: event.toY,
      targetId: event.targetId,
      damage: event.damage ?? 0,
      isInitiator: event.phase === "primary" || event.phase === "final-transmission"
    });
  });

  const existingAttackPairs = new Set(attacks.map((event) => `${event.attackerId}->${event.targetId}`));

  for (const event of authoritativeStrikes.length > 0 ? [] : [...attacks]) {
    const previousAttacker = previousUnits.get(event.attackerId);
    const nextAttacker = nextUnits.get(event.attackerId);
    const previousDefender = previousUnits.get(event.targetId);
    const nextDefender = nextUnits.get(event.targetId);

    if (!previousAttacker || !nextAttacker || !previousDefender) {
      continue;
    }

    const counterDamage = previousAttacker.current.hp - nextAttacker.current.hp;

    if (counterDamage <= 0) {
      continue;
    }

    const counterUnit = nextDefender ?? previousDefender;
    const counterKey = `${event.targetId}->${event.attackerId}`;

    if (existingAttackPairs.has(counterKey) || !isWithinRange(counterUnit, nextAttacker)) {
      continue;
    }

    const missingDefenderInitiatedCombat = !event.isInitiator && !nextDefender;

    attacks.push({
      type: "attack",
      attackerId: event.targetId,
      owner: counterUnit.owner,
      fromX: counterUnit.x,
      fromY: counterUnit.y,
      toX: nextAttacker.x,
      toY: nextAttacker.y,
      targetId: event.attackerId,
      damage: counterDamage,
      isInitiator: missingDefenderInitiatedCombat
    });
    existingAttackPairs.add(counterKey);
  }

  const attackPairs = new Map();

  attacks.forEach((event) => {
    const pairKey = getAttackPairKey(event.attackerId, event.targetId);
    const pair = attackPairs.get(pairKey) ?? [];
    pair.push(event);
    attackPairs.set(pairKey, pair);
  });

  attackPairs.forEach((pair) => {
    if (pair.length !== 2) {
      return;
    }

    const initiatingEvent = pair.find((event) =>
      didUnitStartAttack(previousUnits.get(event.attackerId), nextUnits.get(event.attackerId))
    );

    if (!initiatingEvent) {
      return;
    }

    const counterEvent = pair.find((event) => event !== initiatingEvent);
    const previousInitiator = previousUnits.get(initiatingEvent.attackerId);
    const previousCounter = previousUnits.get(counterEvent?.attackerId);

    if (!counterEvent || !previousInitiator || !previousCounter) {
      return;
    }

    const defenderPreempts = shouldDefenderPreemptCombat(
      previousSnapshot,
      previousInitiator,
      previousCounter,
      { canCounter: true }
    );

    initiatingEvent.isInitiator = !defenderPreempts;
    counterEvent.isInitiator = defenderPreempts;
  });

  for (const [buildingId, nextBuilding] of nextBuildings.entries()) {
    const previousBuilding = previousBuildings.get(buildingId);

    if (previousBuilding && previousBuilding.owner !== nextBuilding.owner) {
      captures.push({
        type: "capture",
        buildingId,
        owner: nextBuilding.owner,
        x: nextBuilding.x,
        y: nextBuilding.y
      });
    }
  }

  const orderedAttacks = attacks
    .sort((left, right) =>
      authoritativeStrikes.length > 0
        ? (left.strikeOrder ?? 0) - (right.strikeOrder ?? 0)
        : Number(right.isInitiator) - Number(left.isInitiator)
    )
    .map((event, index) => ({
      ...event,
      delay: index * BATTLE_ATTACK_WINDOW_MS
    }));

  const turnTransitionDelayMs = getTurnTransitionDelayMs(previousSnapshot, nextSnapshot);
  const moveDurationsByUnitId = new Map(
    movements.map((event) => [
      event.unitId,
      getMovementEventDurationMs(event, colorOptions)
    ])
  );
  const maxMoveDurationMs = Math.max(0, ...moveDurationsByUnitId.values());
  const firstAttack = orderedAttacks[0] ?? null;
  const firstAttackMoveDurationMs = firstAttack
    ? moveDurationsByUnitId.get(firstAttack.attackerId) ?? 0
    : 0;
  const attackBaseDelayMs =
    turnTransitionDelayMs +
    (firstAttackMoveDurationMs > 0 ? firstAttackMoveDurationMs + BATTLE_MOVE_SETTLE_MS : 0);
  const experienceStartDelayMs = orderedAttacks.length
    ? attackBaseDelayMs +
      Math.max(...orderedAttacks.map((event) => event.delay ?? 0)) +
      BATTLE_ATTACK_WINDOW_MS +
      EXPERIENCE_REVEAL_DELAY_MS
    : turnTransitionDelayMs + maxMoveDurationMs + BATTLE_MOVE_SETTLE_MS;

  const timedMovements = movements.map((event) => ({
    ...event,
    startDelayMs: turnTransitionDelayMs,
    durationMs: getMovementEventDurationMs(event, colorOptions),
    endDelayMs:
      turnTransitionDelayMs +
      getMovementEventDurationMs(event, colorOptions) +
      BATTLE_MOVE_SETTLE_MS
  }));
  const timedAttacks = orderedAttacks.map((event) => ({
    ...event,
    startDelayMs: attackBaseDelayMs + (event.delay ?? 0),
    durationMs: BATTLE_ATTACK_WINDOW_MS,
    endDelayMs: attackBaseDelayMs + (event.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS
  }));
  const timedRestores = restores.map((event) => {
    const serviceMoveDurationMs = moveDurationsByUnitId.get(
      event.actorId ?? event.unitId
    ) ?? 0;
    const startDelayMs =
      turnTransitionDelayMs +
      (serviceMoveDurationMs > 0
        ? serviceMoveDurationMs + BATTLE_MOVE_SETTLE_MS
        : 0);

    return {
      ...event,
      startDelayMs,
      durationMs: 560,
      endDelayMs: startDelayMs + 560
    };
  });
  const timedExperience = experience.map((event) => ({
    ...event,
    ...buildExperienceTimingMetadata(event, experienceStartDelayMs)
  }));
  const timedCaptures = captures.map((event) => ({
    ...event,
    startDelayMs: turnTransitionDelayMs + maxMoveDurationMs + BATTLE_MOVE_SETTLE_MS,
    durationMs: 520,
    endDelayMs: turnTransitionDelayMs + maxMoveDurationMs + BATTLE_MOVE_SETTLE_MS + 520
  }));
  const timedDeployments = deployments.map((event) => {
    const carrierMoveDurationMs = event.fromUnload
      ? moveDurationsByUnitId.get(event.carrierId) ?? 0
      : maxMoveDurationMs;
    const startDelayMs =
      turnTransitionDelayMs +
      (carrierMoveDurationMs > 0 || !event.fromUnload
        ? carrierMoveDurationMs + BATTLE_MOVE_SETTLE_MS
        : 0);

    return {
      ...event,
      startDelayMs,
      durationMs: 420,
      endDelayMs: startDelayMs + 420
    };
  });

  const destroyDelaysByUnitId = new Map();
  const recordDestroyDelay = (unitId, delay) => {
    if (!unitId) {
      return;
    }
    destroyDelaysByUnitId.set(
      unitId,
      Math.max(destroyDelaysByUnitId.get(unitId) ?? 0, delay)
    );
  };
  timedAttacks.forEach((event) => {
    recordDestroyDelay(
      event.targetId,
      (event.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS
    );
  });
  presentationEvents
    .filter((event) => event.type === "status" && event.killed && event.combatId)
    .forEach((statusEvent) => {
      const attack = timedAttacks.find(
        (event) =>
          event.combatId === statusEvent.combatId &&
          (event.strikeOrder ?? 0) === (statusEvent.order ?? 0)
      );
      if (attack) {
        recordDestroyDelay(
          statusEvent.targetId,
          (attack.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS
        );
      }
    });
  const orderedDestroys = destroys.map((event) => ({
    ...event,
    delay: destroyDelaysByUnitId.get(event.unitId) ?? 0
  }));
  const timedDestroys = orderedDestroys.map((event) => ({
    ...event,
    startDelayMs: attackBaseDelayMs + (event.delay ?? 0),
    durationMs: 340,
    endDelayMs: attackBaseDelayMs + (event.delay ?? 0) + 340
  }));
  const commanderPowerEvent = buildCommanderPowerEvent(
    previousSnapshot,
    nextSnapshot,
    previousUnits,
    nextUnits
  );

  return [
    ...(commanderPowerEvent ? [commanderPowerEvent] : []),
    ...timedMovements,
    ...timedAttacks,
    ...timedRestores,
    ...timedExperience,
    ...timedCaptures,
    ...timedDeployments,
    ...timedDestroys
  ];
}
