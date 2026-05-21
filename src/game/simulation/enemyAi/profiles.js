import { ENEMY_AI_ARCHETYPES } from "../../core/constants.js";

export function getEnemyAiArchetype(state) {
  return state.enemy?.aiArchetype ?? ENEMY_AI_ARCHETYPES.BALANCED;
}

export function getEnemyAiProfile(state) {
  switch (getEnemyAiArchetype(state)) {
    case ENEMY_AI_ARCHETYPES.HYPER_AGGRESSIVE:
      return {
        repairHealthRatio: 0.42,
        objectiveWeight: 1.2,
        safetyWeight: 0.65,
        pressureWeight: 1.45,
        retreatDistanceWeight: 1.1
      };
    case ENEMY_AI_ARCHETYPES.TURTLE:
      return {
        repairHealthRatio: 0.72,
        objectiveWeight: 0.8,
        safetyWeight: 1.7,
        pressureWeight: 0.5,
        retreatDistanceWeight: 2.4
      };
    case ENEMY_AI_ARCHETYPES.CAPTURE:
      return {
        repairHealthRatio: 0.55,
        objectiveWeight: 1.55,
        safetyWeight: 0.95,
        pressureWeight: 0.9,
        retreatDistanceWeight: 1.6
      };
    case ENEMY_AI_ARCHETYPES.HQ_RUSH:
      return {
        repairHealthRatio: 0.5,
        objectiveWeight: 1.65,
        safetyWeight: 0.75,
        pressureWeight: 1.2,
        retreatDistanceWeight: 1.35
      };
    case ENEMY_AI_ARCHETYPES.BALANCED:
    default:
      return {
        repairHealthRatio: 0.55,
        objectiveWeight: 1,
        safetyWeight: 1,
        pressureWeight: 1,
        retreatDistanceWeight: 1.75
      };
  }
}
