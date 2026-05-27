import { getBattleMoveDuration } from "../../core/constants.js";

export function getAnimationRangeFrameCount(range = null) {
  if (!range) {
    return 0;
  }

  return Math.max(0, range.end - range.start + 1);
}

export function getAnimationRangeFrameIndices(range = null, { reverse = false } = {}) {
  const frameCount = getAnimationRangeFrameCount(range);

  if (frameCount <= 0) {
    return [];
  }

  const frames = Array.from({ length: frameCount }, (_, index) => range.start + index);
  return reverse ? frames.reverse() : frames;
}

export function getAnimationPlaybackDurationMs(frameCount = 0, frameRate = 1) {
  if (frameCount <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((frameCount / Math.max(1, frameRate)) * 1000));
}

export function getAnimationRange(animationSpec, rangeName = "default") {
  return animationSpec?.ranges?.[rangeName] ?? animationSpec?.ranges?.default ?? null;
}

export function getOwnerIdleFlipX(owner = "player") {
  return owner === "enemy";
}

export function getUnitAttackRangeName(owner = "player", directionX = 0) {
  if (directionX > 0) {
    return "right";
  }

  if (directionX < 0) {
    return "left";
  }

  return owner === "enemy" ? "left" : "right";
}

export function getUnitDefaultTexture(visualSpec, owner = "player") {
  const idleRange = getAnimationRange(visualSpec?.idle, "default");

  if (visualSpec?.idle?.key && idleRange) {
    return {
      key: visualSpec.idle.key,
      frame: idleRange.start,
      flipX: getOwnerIdleFlipX(owner),
    };
  }

  if (visualSpec?.fallbackKey) {
    return {
      key: visualSpec.fallbackKey,
      frame: undefined,
      flipX: getOwnerIdleFlipX(owner),
    };
  }

  return null;
}

export function getAttackAnimationPlayback(owner, attackAnimation, directionX = 0) {
  const requestedRangeName = getUnitAttackRangeName(owner, directionX);
  const oppositeRangeName = requestedRangeName === "left" ? "right" : "left";
  let rangeName = requestedRangeName;
  let range = getAnimationRange(attackAnimation, rangeName);
  let flipX = false;

  if (!range) {
    const oppositeRange = getAnimationRange(attackAnimation, oppositeRangeName);

    if (oppositeRange) {
      rangeName = oppositeRangeName;
      range = oppositeRange;
      flipX = true;
    } else {
      rangeName = "default";
      range = getAnimationRange(attackAnimation, "default");
    }
  }

  if (!attackAnimation?.key || !range) {
    return null;
  }

  return {
    rangeName,
    range,
    startFrame: range.start,
    flipX,
    durationMs: getAnimationPlaybackDurationMs(
      getAnimationRangeFrameCount(range),
      attackAnimation.frameRate,
    ),
  };
}

export function getUnitMovementPlayback(visualSpec, moveSegments = 0) {
  const walkAnimation = visualSpec?.walk ?? null;
  const forwardFrameIndices = getAnimationRangeFrameIndices(
    getAnimationRange(walkAnimation, "default"),
  );
  const canTeleport =
    walkAnimation?.movementStyle === "teleport" &&
    Boolean(walkAnimation?.key) &&
    forwardFrameIndices.length > 1;

  if (!canTeleport) {
    return {
      style: "path",
      animation: walkAnimation,
      forwardFrameIndices,
      reverseFrameIndices: [],
      splitProgress: 1,
      totalDurationMs: getBattleMoveDuration(moveSegments),
    };
  }

  const reverseFrameIndices = [...forwardFrameIndices].reverse();

  return {
    style: "teleport",
    animation: walkAnimation,
    forwardFrameIndices,
    reverseFrameIndices,
    splitProgress: forwardFrameIndices.length / (forwardFrameIndices.length + reverseFrameIndices.length),
    totalDurationMs: getAnimationPlaybackDurationMs(
      forwardFrameIndices.length + reverseFrameIndices.length,
      walkAnimation.frameRate,
    ),
  };
}
