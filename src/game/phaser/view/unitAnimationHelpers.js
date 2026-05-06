export function getAnimationRangeFrameCount(range = null) {
  if (!range) {
    return 0;
  }

  return Math.max(0, range.end - range.start + 1);
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
      flipX: false,
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
  const rangeName = getUnitAttackRangeName(owner, directionX);
  const range = getAnimationRange(attackAnimation, rangeName);

  if (!attackAnimation?.key || !range) {
    return null;
  }

  return {
    rangeName,
    range,
    startFrame: range.start,
    durationMs: Math.max(
      1,
      Math.round((getAnimationRangeFrameCount(range) / Math.max(1, attackAnimation.frameRate)) * 1000),
    ),
  };
}
