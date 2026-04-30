import {
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  getBattleMoveDuration
} from "../../core/constants.js";
import { getXpThreshold } from "../../simulation/progression.js";
import { getMovementPath } from "../../simulation/selectors.js";
import { getMovementModifier } from "../../simulation/commanderEffects.js";

function getUnits(snapshot) {
  return [...snapshot.player.units, ...snapshot.enemy.units];
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function manhattanDistance(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function isWithinRange(unit, target) {
  const distance = manhattanDistance(unit, target);
  return distance >= unit.stats.minRange && distance <= unit.stats.maxRange;
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
  return previousUnit.current.ammo > nextUnit.current.ammo;
}

function didUnitStartAttack(previousUnit, nextUnit) {
  return !previousUnit.hasAttacked && nextUnit.hasAttacked;
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

  segments.push({
    level: nextUnit.level,
    threshold: getXpThreshold(nextUnit.level),
    fromExperience: 0,
    toExperience: nextUnit.experience
  });

  return segments;
}

function getExperienceEventDuration(event) {
  const segments = event.segments ?? [];

  if (segments.length === 0) {
    return 0;
  }

  let duration = 0;

  segments.forEach((segment, index) => {
    duration += segment.toExperience >= segment.threshold ? 440 : 620;

    if (segment.toExperience >= segment.threshold && index < segments.length - 1) {
      duration += 120;
    }
  });

  return duration + 120 + 280;
}

function getBattleAnimationDurationMs(events) {
  if (!events?.length) {
    return 0;
  }

  const attackEvents = events.filter((event) => event.type === "attack");
  const combatDelay = attackEvents.length
    ? Math.max(...attackEvents.map((event) => event.delay ?? 0)) + BATTLE_ATTACK_WINDOW_MS
    : 0;

  return events.reduce((maxDuration, event) => {
    switch (event.type) {
      case "move": {
        if (event.teleport) {
          return maxDuration;
        }

        const moveSegments = Math.max(0, (event.path?.length ?? 1) - 1);
        return Math.max(
          maxDuration,
          getBattleMoveDuration(moveSegments) + BATTLE_MOVE_SETTLE_MS
        );
      }
      case "attack":
        return Math.max(maxDuration, (event.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS);
      case "heal":
      case "resupply":
        return Math.max(maxDuration, 560);
      case "experience":
        return Math.max(maxDuration, combatDelay + getExperienceEventDuration(event));
      case "capture":
        return Math.max(maxDuration, 520);
      case "deploy":
        return Math.max(maxDuration, 420);
      case "destroy":
        return Math.max(maxDuration, (event.delay ?? 0) + 340);
      default:
        return maxDuration;
    }
  }, 0);
}

export function getBattleSnapshotTransitionDurationMs(previousSnapshot, nextSnapshot) {
  return getBattleAnimationDurationMs(deriveBattleAnimationEvents(previousSnapshot, nextSnapshot));
}

export function deriveBattleAnimationEvents(previousSnapshot, nextSnapshot) {
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
      (nextUnit.x !== previousUnit.x || nextUnit.y !== previousUnit.y)
    ) {
      if (isPendingMoveRollback(previousSnapshot, unitId, previousUnit, nextUnit)) {
        movements.push({
          type: "move",
          unitId,
          owner: nextUnit.owner,
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
          path
        });
      }
    }

    const hpRecovered = nextUnit.current.hp > previousUnit.current.hp;
    const ammoRecovered = nextUnit.current.ammo > previousUnit.current.ammo;
    const staminaRecovered = nextUnit.current.stamina > previousUnit.current.stamina;

    if (hpRecovered || ammoRecovered || staminaRecovered) {
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

    if (!didUnitAttack(previousUnit, nextUnit)) {
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

  const existingAttackPairs = new Set(attacks.map((event) => `${event.attackerId}->${event.targetId}`));

  for (const event of [...attacks]) {
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
      isInitiator: false
    });
    existingAttackPairs.add(counterKey);
  }

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
    .sort((left, right) => Number(right.isInitiator) - Number(left.isInitiator))
    .map((event, index) => ({
      ...event,
      delay: index * BATTLE_ATTACK_WINDOW_MS
    }));

  const destroyDelaysByUnitId = new Map(
    orderedAttacks.map((event) => [
      event.targetId,
      (event.delay ?? 0) + BATTLE_ATTACK_WINDOW_MS
    ])
  );
  const orderedDestroys = destroys.map((event) => ({
    ...event,
    delay: destroyDelaysByUnitId.get(event.unitId) ?? 0
  }));

  return [
    ...movements,
    ...orderedAttacks,
    ...restores,
    ...experience,
    ...captures,
    ...deployments,
    ...orderedDestroys
  ];
}
