import { BATTLE_ATTACK_STAGGER_MS } from "../../core/constants.js";
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
        y: previousUnit.y
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

    if (nextUnit.x !== previousUnit.x || nextUnit.y !== previousUnit.y) {
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

    if (previousUnit.current.ammo <= nextUnit.current.ammo) {
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
      delay: index * BATTLE_ATTACK_STAGGER_MS
    }));

  return [
    ...movements,
    ...orderedAttacks,
    ...restores,
    ...experience,
    ...captures,
    ...deployments,
    ...destroys
  ];
}
