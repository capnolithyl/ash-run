import { randomInt } from "../core/random.js";
import { TURN_SIDES } from "../core/constants.js";

const AIR_STRIKE_OFFSETS = Object.freeze([
  Object.freeze({ dx: 0, dy: 0, zone: "center" }),
  Object.freeze({ dx: 0, dy: -1, zone: "adjacent" }),
  Object.freeze({ dx: 1, dy: 0, zone: "adjacent" }),
  Object.freeze({ dx: 0, dy: 1, zone: "adjacent" }),
  Object.freeze({ dx: -1, dy: 0, zone: "adjacent" })
]);
const SCORE_EPSILON = 1e-9;

function getOpposingSide(side) {
  return side === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
}

export function isAirStrikeCenterInBounds(state, center) {
  return Boolean(
    center &&
      Number.isInteger(center.x) &&
      Number.isInteger(center.y) &&
      center.x >= 0 &&
      center.y >= 0 &&
      center.x < state.map.width &&
      center.y < state.map.height
  );
}

export function getAirStrikeTiles(state, center, active = {}) {
  if (!isAirStrikeCenterInBounds(state, center)) {
    return [];
  }

  const centerDamage = Math.max(0, Number(active.centerDamage) || 0);
  const adjacentDamage = Math.max(0, Number(active.adjacentDamage) || 0);

  return AIR_STRIKE_OFFSETS.map((offset) => ({
    x: center.x + offset.dx,
    y: center.y + offset.dy,
    zone: offset.zone,
    damage: offset.zone === "center" ? centerDamage : adjacentDamage
  })).filter(
    (tile) =>
      tile.x >= 0 &&
      tile.y >= 0 &&
      tile.x < state.map.width &&
      tile.y < state.map.height
  );
}

function getVisibleOpposingUnitAt(state, side, x, y) {
  return (state[getOpposingSide(side)]?.units ?? []).find(
    (unit) =>
      unit.current.hp > 0 &&
      !unit.transport?.carriedByUnitId &&
      unit.x === x &&
      unit.y === y
  ) ?? null;
}

export function getAirStrikeTargets(state, side, center, active = {}) {
  return getAirStrikeTiles(state, center, active)
    .map((tile) => {
      const unit = getVisibleOpposingUnitAt(state, side, tile.x, tile.y);

      if (!unit) {
        return null;
      }

      const actualDamage = Math.min(unit.current.hp, tile.damage);
      const maxHealth = Math.max(1, Number(unit.stats.maxHealth) || 1);
      const fundsDamage = (Math.max(0, Number(unit.cost) || 0) * actualDamage) / maxHealth;

      return {
        unit,
        x: tile.x,
        y: tile.y,
        zone: tile.zone,
        damage: tile.damage,
        actualDamage,
        fundsDamage,
        killsUnit: actualDamage >= unit.current.hp
      };
    })
    .filter(Boolean);
}

export function evaluateAirStrikeCenter(state, side, center, active = {}) {
  const targets = getAirStrikeTargets(state, side, center, active);

  return {
    center: { x: center.x, y: center.y },
    targets,
    fundsDamage: targets.reduce((sum, target) => sum + target.fundsDamage, 0),
    killCount: targets.filter((target) => target.killsUnit).length,
    strongestAffectedUnitCost: targets.reduce(
      (highest, target) => Math.max(highest, Math.max(0, Number(target.unit.cost) || 0)),
      0
    )
  };
}

function compareAirStrikeEvaluations(left, right) {
  const fundsDifference = right.fundsDamage - left.fundsDamage;

  if (Math.abs(fundsDifference) > SCORE_EPSILON) {
    return fundsDifference;
  }

  return (
    right.killCount - left.killCount ||
    right.strongestAffectedUnitCost - left.strongestAffectedUnitCost
  );
}

export function chooseEnemyAirStrikeCenter(state, side, active = {}, seed = state.seed) {
  const evaluations = [];

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      evaluations.push(evaluateAirStrikeCenter(state, side, { x, y }, active));
    }
  }

  if (evaluations.length === 0) {
    return { center: null, evaluation: null, seed };
  }

  evaluations.sort(compareAirStrikeEvaluations);
  const best = evaluations[0];
  const tied = evaluations.filter(
    (evaluation) => compareAirStrikeEvaluations(best, evaluation) === 0
  );

  if (tied.length === 1) {
    return { center: best.center, evaluation: best, seed };
  }

  const roll = randomInt(seed, 0, tied.length - 1);
  const selected = tied[roll.value];

  return {
    center: selected.center,
    evaluation: selected,
    seed: roll.seed
  };
}
