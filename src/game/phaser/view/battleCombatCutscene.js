import {
  BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
  BATTLE_COMBAT_CUTSCENE_IMPACT_DELAY_MS,
  BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_LOOP_MAX,
  BATTLE_COMBAT_CUTSCENE_LOOP_MIN,
  BATTLE_COMBAT_CUTSCENE_OPEN_MS,
  BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
  BATTLE_COMBAT_CUTSCENE_SHAKE_MS,
  BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  getBattleMoveDuration,
  TURN_SIDES
} from "../../core/constants.js";
import { getUnitSpriteDefinition } from "../assets.js";
import { deriveBattleAnimationEvents } from "./battleAnimationEvents.js";
import { getMovementModifier } from "../../simulation/commanderEffects.js";
import { getMovementPath } from "../../simulation/selectors.js";
import {
  getAnimationRangeFrameCount,
  getAttackAnimationPlayback
} from "./unitAnimationHelpers.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getUnitsById(snapshot) {
  return new Map(
    [...(snapshot?.player?.units ?? []), ...(snapshot?.enemy?.units ?? [])].map((unit) => [unit.id, unit])
  );
}

function getTerrainIdAt(snapshot, x, y) {
  return snapshot?.map?.tiles?.[y]?.[x] ?? null;
}

function getDisplayUnit(previousUnit, nextUnit, owner) {
  const source = previousUnit ?? nextUnit;

  if (!source) {
    return null;
  }

  return {
    id: source.id,
    owner,
    name: source.name,
    unitTypeId: source.unitTypeId,
    currentHp: previousUnit?.current?.hp ?? nextUnit?.current?.hp ?? 0,
    maxHealth: previousUnit?.stats?.maxHealth ?? nextUnit?.stats?.maxHealth ?? 1,
    weaponClass: previousUnit?.stats?.weaponClass ?? nextUnit?.stats?.weaponClass ?? null
  };
}

function getCutsceneLoopCount(unit, side, stepWindowMs) {
  const spriteDefinition = getUnitSpriteDefinition(unit.unitTypeId, side);
  const attackAnimation = spriteDefinition?.attack ?? null;
  const attackPlayback = getAttackAnimationPlayback(side, attackAnimation, 0);
  const attackRange = attackPlayback?.range ?? null;
  const attackFrameCount = getAnimationRangeFrameCount(attackRange);

  if (!attackAnimation || !attackRange || attackFrameCount <= 0) {
    return 1;
  }

  const baseLoopDurationMs = Math.max(
    1,
    Math.round((attackFrameCount / Math.max(1, attackAnimation.frameRate ?? 1)) * 1000)
  );

  return baseLoopDurationMs * BATTLE_COMBAT_CUTSCENE_LOOP_MIN < stepWindowMs * 0.6
    ? BATTLE_COMBAT_CUTSCENE_LOOP_MAX
    : BATTLE_COMBAT_CUTSCENE_LOOP_MIN;
}

function getCutsceneWindowMs(unit, side, loopCount) {
  void unit;
  void side;
  void loopCount;
  return BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS;
}

function getCutsceneRevealStartMsFromPendingMove(snapshot, attackerId) {
  const pendingAction = snapshot?.presentation?.pendingAction ?? snapshot?.pendingAction ?? null;

  if (
    pendingAction?.type !== "move" ||
    pendingAction.unitId !== attackerId ||
    (pendingAction.fromX === pendingAction.toX && pendingAction.fromY === pendingAction.toY)
  ) {
    return 0;
  }

  const snapshotForPath = structuredClone(snapshot);
  const units = [...(snapshotForPath?.player?.units ?? []), ...(snapshotForPath?.enemy?.units ?? [])];
  const unit = units.find((candidate) => candidate.id === attackerId);

  if (!unit) {
    return 0;
  }

  unit.x = pendingAction.fromX;
  unit.y = pendingAction.fromY;

  if (Number.isFinite(pendingAction.fromStamina)) {
    unit.current.stamina = pendingAction.fromStamina;
  }

  const movementBudget = unit.stats.movement + getMovementModifier(snapshotForPath, unit);
  const path = getMovementPath(
    snapshotForPath,
    unit,
    movementBudget,
    pendingAction.toX,
    pendingAction.toY
  );
  const moveSegments = Math.max(0, path.length - 1);

  if (moveSegments <= 0) {
    return 0;
  }

  return getBattleMoveDuration(moveSegments) + BATTLE_MOVE_SETTLE_MS;
}

function getCutsceneRevealStartMs(snapshot, animationEvents, attackerId) {
  const pendingMoveRevealStartMs = getCutsceneRevealStartMsFromPendingMove(snapshot, attackerId);

  if (pendingMoveRevealStartMs > 0) {
    return pendingMoveRevealStartMs;
  }

  const movementEvent = animationEvents.find(
    (event) => event.type === "move" && event.unitId === attackerId
  );

  if (!movementEvent || movementEvent.teleport) {
    return 0;
  }

  const moveSegments = Math.max(0, (movementEvent.path?.length ?? 1) - 1);
  return getBattleMoveDuration(moveSegments) + BATTLE_MOVE_SETTLE_MS;
}

export function getBattleCombatCutsceneElapsedMs(cutscene, now = Date.now()) {
  return clamp(now - (cutscene?.startedAt ?? 0), 0, Math.max(0, (cutscene?.durationMs ?? 1) - 1));
}

export function getBattleCombatCutsceneState(cutscene, now = Date.now()) {
  if (!cutscene) {
    return {
      elapsedMs: 0,
      revealStartMs: 0,
      displayedHpBySide: {
        [TURN_SIDES.PLAYER]: 0,
        [TURN_SIDES.ENEMY]: 0
      },
      activeStepIndex: -1,
      impactStepIndex: -1,
      closeStartMs: 0,
      activeStep: null,
      impactStep: null,
      isWaitingForReveal: false,
      isOpening: false,
      isClosing: false
    };
  }

  const elapsedMs = getBattleCombatCutsceneElapsedMs(cutscene, now);
  const revealStartMs = Math.max(0, cutscene.revealStartMs ?? 0);
  const revealElapsedMs = Math.max(0, elapsedMs - revealStartMs);
  const displayedHpBySide = {
    [TURN_SIDES.PLAYER]: cutscene.playerUnit.currentHp,
    [TURN_SIDES.ENEMY]: cutscene.enemyUnit.currentHp
  };
  let activeStepIndex = -1;
  let impactStepIndex = -1;

  cutscene.steps.forEach((step, index) => {
    if (elapsedMs >= step.startMs && elapsedMs < step.endMs) {
      activeStepIndex = index;
    }

    if (elapsedMs >= step.impactMs && elapsedMs < step.impactMs + BATTLE_COMBAT_CUTSCENE_SHAKE_MS) {
      impactStepIndex = index;
    }

    if (elapsedMs >= step.impactMs) {
      displayedHpBySide[step.targetSide] = step.targetHpAfter;
    }
  });

  const closeStartMs = Math.max(0, cutscene.durationMs - (cutscene.closeMs ?? 0));

  return {
    elapsedMs,
    revealStartMs,
    displayedHpBySide,
    activeStepIndex,
    impactStepIndex,
    closeStartMs,
    activeStep: activeStepIndex >= 0 ? cutscene.steps[activeStepIndex] : null,
    impactStep: impactStepIndex >= 0 ? cutscene.steps[impactStepIndex] : null,
    isWaitingForReveal: elapsedMs < revealStartMs,
    isOpening: elapsedMs >= revealStartMs && revealElapsedMs < (cutscene.openMs ?? 0),
    isClosing: elapsedMs >= closeStartMs
  };
}

export function deriveBattleCombatCutscene(previousSnapshot, nextSnapshot) {
  const animationEvents = deriveBattleAnimationEvents(previousSnapshot, nextSnapshot);
  const attackEvents = animationEvents
    .filter((event) => event.type === "attack")
    .sort((left, right) => (left.delay ?? 0) - (right.delay ?? 0));

  if (!attackEvents.length) {
    return null;
  }

  const firstAttack = attackEvents[0];
  const previousUnitsById = getUnitsById(previousSnapshot);
  const nextUnitsById = getUnitsById(nextSnapshot);
  const playerUnitId =
    firstAttack.owner === TURN_SIDES.PLAYER ? firstAttack.attackerId : firstAttack.targetId;
  const enemyUnitId =
    firstAttack.owner === TURN_SIDES.ENEMY ? firstAttack.attackerId : firstAttack.targetId;
  const playerPrevious = previousUnitsById.get(playerUnitId) ?? null;
  const playerNext = nextUnitsById.get(playerUnitId) ?? null;
  const enemyPrevious = previousUnitsById.get(enemyUnitId) ?? null;
  const enemyNext = nextUnitsById.get(enemyUnitId) ?? null;
  const playerUnit = getDisplayUnit(playerPrevious, playerNext, TURN_SIDES.PLAYER);
  const enemyUnit = getDisplayUnit(enemyPrevious, enemyNext, TURN_SIDES.ENEMY);

  if (!playerUnit || !enemyUnit) {
    return null;
  }

  const hpBySide = {
    [TURN_SIDES.PLAYER]: playerUnit.currentHp,
    [TURN_SIDES.ENEMY]: enemyUnit.currentHp
  };
  const revealStartMs = getCutsceneRevealStartMs(
    previousSnapshot,
    animationEvents,
    firstAttack.attackerId
  );
  let cursorMs =
    revealStartMs + BATTLE_COMBAT_CUTSCENE_OPEN_MS + BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS;
  const steps = attackEvents.map((event) => {
    const attackerSide = event.owner;
    const targetSide = attackerSide === TURN_SIDES.PLAYER ? TURN_SIDES.ENEMY : TURN_SIDES.PLAYER;
    const attackerUnit = attackerSide === TURN_SIDES.PLAYER ? playerUnit : enemyUnit;
    const targetHpBefore = hpBySide[targetSide];
    const targetHpAfter = Math.max(0, targetHpBefore - Math.max(0, event.damage ?? 0));
    const loopCount = getCutsceneLoopCount(attackerUnit, attackerSide, BATTLE_COMBAT_CUTSCENE_STEP_WINDOW_MS);
    const windowMs = getCutsceneWindowMs(attackerUnit, attackerSide, loopCount);
    const impactDelayMs = Math.min(
      windowMs - 220,
      BATTLE_COMBAT_CUTSCENE_IMPACT_DELAY_MS
    );
    const startMs = cursorMs;
    const impactMs = startMs + impactDelayMs;
    const endMs = startMs + windowMs;
    hpBySide[targetSide] = targetHpAfter;
    cursorMs = endMs;

    return {
      attackerSide,
      targetSide,
      damage: Math.max(0, event.damage ?? 0),
      startMs,
      impactMs,
      endMs,
      impactDelayMs,
      windowMs,
      loopCount,
      targetHpBefore,
      targetHpAfter,
      destroysTarget: targetHpAfter <= 0
    };
  });
  const playerTerrainId = getTerrainIdAt(
    nextSnapshot,
    playerNext?.x ??
      playerPrevious?.x ??
      (firstAttack.owner === TURN_SIDES.PLAYER ? firstAttack.fromX : firstAttack.toX),
    playerNext?.y ??
      playerPrevious?.y ??
      (firstAttack.owner === TURN_SIDES.PLAYER ? firstAttack.fromY : firstAttack.toY)
  );
  const enemyTerrainId = getTerrainIdAt(
    nextSnapshot,
    enemyNext?.x ??
      enemyPrevious?.x ??
      (firstAttack.owner === TURN_SIDES.ENEMY ? firstAttack.fromX : firstAttack.toX),
    enemyNext?.y ??
      enemyPrevious?.y ??
      (firstAttack.owner === TURN_SIDES.ENEMY ? firstAttack.fromY : firstAttack.toY)
  );

  return {
    openMs: BATTLE_COMBAT_CUTSCENE_OPEN_MS,
    closeMs: BATTLE_COMBAT_CUTSCENE_CLOSE_MS,
    introHoldMs: BATTLE_COMBAT_CUTSCENE_INTRO_HOLD_MS,
    outroHoldMs: BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS,
    revealStartMs,
    playerUnit,
    enemyUnit,
    playerTerrainId,
    enemyTerrainId,
    steps,
    durationMs: cursorMs + BATTLE_COMBAT_CUTSCENE_OUTRO_HOLD_MS + BATTLE_COMBAT_CUTSCENE_CLOSE_MS
  };
}
