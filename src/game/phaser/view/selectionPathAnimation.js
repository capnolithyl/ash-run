export const HOVERED_MOVEMENT_PATH_TRANSITION_MS = 190;
const MOVEMENT_PATH_COMPLETE_EPSILON = 0.001;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function isFiniteTile(tile) {
  return Number.isFinite(tile?.x) && Number.isFinite(tile?.y);
}

export function normalizeMovementPath(path) {
  if (!Array.isArray(path) || path.length < 2 || !path.every(isFiniteTile)) {
    return [];
  }

  return path.map((tile) => ({
    x: tile.x,
    y: tile.y,
  }));
}

export function getMovementPathKey(path) {
  return normalizeMovementPath(path)
    .map((tile) => `${tile.x},${tile.y}`)
    .join("|");
}

export function getMovementPathSourceKey(path) {
  const normalizedPath = normalizeMovementPath(path);
  const source = normalizedPath[0];

  return source ? `${source.x},${source.y}` : "";
}

export function getMovementPathAnimationDurationMs(reducedMotion = false) {
  return reducedMotion ? 0 : HOVERED_MOVEMENT_PATH_TRANSITION_MS;
}

export function canAnimateMovementPathChange({
  fromPath,
  toPath,
  fromContextKey,
  toContextKey,
}) {
  const normalizedFromPath = normalizeMovementPath(fromPath);
  const normalizedToPath = normalizeMovementPath(toPath);

  return (
    normalizedFromPath.length >= 2 &&
    normalizedToPath.length >= 2 &&
    fromContextKey === toContextKey &&
    getMovementPathSourceKey(normalizedFromPath) ===
      getMovementPathSourceKey(normalizedToPath)
  );
}

export function interpolateMovementPath(fromPath, toPath, progress) {
  const normalizedFromPath = normalizeMovementPath(fromPath);
  const normalizedToPath = normalizeMovementPath(toPath);

  if (normalizedToPath.length < 2) {
    return [];
  }

  if (normalizedFromPath.length < 2 || progress >= 1) {
    return normalizedToPath;
  }

  if (progress <= 0) {
    return normalizedFromPath;
  }

  const easedProgress = clamp(progress);
  const pointCount = Math.max(
    normalizedFromPath.length,
    normalizedToPath.length,
  );

  return Array.from({ length: pointCount }, (_, index) => {
    const from =
      normalizedFromPath[Math.min(index, normalizedFromPath.length - 1)];
    const to = normalizedToPath[Math.min(index, normalizedToPath.length - 1)];

    return {
      x: from.x + (to.x - from.x) * easedProgress,
      y: from.y + (to.y - from.y) * easedProgress,
    };
  });
}

export function createMovementPathTransitionState(
  previousState,
  {
    targetPath,
    contextKey,
    nowMs = 0,
    durationMs = HOVERED_MOVEMENT_PATH_TRANSITION_MS,
  },
) {
  const normalizedTargetPath = normalizeMovementPath(targetPath);
  const targetKey = getMovementPathKey(normalizedTargetPath);
  const startPath = normalizeMovementPath(
    previousState?.displayPath ?? previousState?.targetPath,
  );
  const shouldAnimate =
    durationMs > 0 &&
    canAnimateMovementPathChange({
      fromPath: startPath,
      toPath: normalizedTargetPath,
      fromContextKey: previousState?.contextKey,
      toContextKey: contextKey,
    });

  if (!targetKey) {
    return {
      contextKey,
      targetKey: "",
      startTimeMs: nowMs,
      durationMs: 0,
      startPath: [],
      targetPath: [],
      displayPath: [],
      isAnimating: false,
    };
  }

  if (!shouldAnimate) {
    return {
      contextKey,
      targetKey,
      startTimeMs: nowMs,
      durationMs: 0,
      startPath: normalizedTargetPath,
      targetPath: normalizedTargetPath,
      displayPath: normalizedTargetPath,
      isAnimating: false,
    };
  }

  return {
    contextKey,
    targetKey,
    startTimeMs: nowMs,
    durationMs,
    startPath,
    targetPath: normalizedTargetPath,
    displayPath: startPath,
    isAnimating: true,
  };
}

export function resolveMovementPathFrame(
  state,
  nowMs,
  easing = (progress) => progress,
) {
  if (!state || !state.isAnimating || state.durationMs <= 0) {
    return state;
  }

  const progress = clamp((nowMs - state.startTimeMs) / state.durationMs);
  const isComplete = progress >= 1 - MOVEMENT_PATH_COMPLETE_EPSILON;
  const displayPath = interpolateMovementPath(
    state.startPath,
    state.targetPath,
    isComplete ? 1 : easing(progress),
  );

  return {
    ...state,
    displayPath,
    isAnimating: !isComplete,
    startPath: isComplete ? state.targetPath : state.startPath,
  };
}
