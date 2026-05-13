function clampViewportValue(minValue, preferredValue, maxValue) {
  return Math.max(minValue, Math.min(preferredValue, maxValue));
}

function getViewportReserve(viewportWidth, viewportHeight) {
  const isCompact = viewportWidth <= 1024;
  const isNarrowCompact = viewportWidth <= 760;
  const isPhoneCompact = viewportWidth <= 560;
  const isShort = viewportHeight <= 520;
  const reservedTop = isCompact ? (isShort ? 74 : isNarrowCompact ? 120 : 108) : 198;
  const reservedBottom = isCompact
    ? (isShort ? 82 : isPhoneCompact ? 122 : isNarrowCompact ? 112 : 96)
    : 112;

  return {
    isCompact,
    reservedTop,
    availableHeight: Math.max(180, viewportHeight - reservedTop - reservedBottom)
  };
}

function getDesktopLaneBounds(viewportWidth) {
  const desktopLeftPanelWidth = clampViewportValue(17 * 16, viewportWidth * 0.18, 18.75 * 16);
  const desktopRightPanelWidth = clampViewportValue(15 * 16, viewportWidth * 0.16, 16.5 * 16);
  const desktopPanelInset = clampViewportValue(1 * 16, viewportWidth * 0.0125, 1.45 * 16);
  const desktopCenterLaneGap = clampViewportValue(1 * 16, viewportWidth * 0.0115, 1.35 * 16);

  return {
    laneLeft: desktopPanelInset + desktopLeftPanelWidth + desktopCenterLaneGap,
    laneRight: viewportWidth - desktopPanelInset - desktopRightPanelWidth - desktopCenterLaneGap
  };
}

export function getBattlefieldLayout({
  viewportWidth,
  viewportHeight,
  mapWidth,
  mapHeight
}) {
  const { isCompact, reservedTop, availableHeight } = getViewportReserve(
    viewportWidth,
    viewportHeight
  );
  const { laneLeft, laneRight } = getDesktopLaneBounds(viewportWidth);
  const desktopLaneWidth = Math.max(240, laneRight - laneLeft);
  const maxBoardWidth = isCompact ? viewportWidth * 0.94 : desktopLaneWidth;
  const maxBoardHeight = isCompact ? availableHeight : viewportHeight * 0.72;
  const cellSize = Math.max(1, Math.floor(Math.min(maxBoardWidth / mapWidth, maxBoardHeight / mapHeight)));
  const boardWidth = mapWidth * cellSize;
  const boardHeight = mapHeight * cellSize;
  const centeredOriginY = reservedTop + Math.max(0, (availableHeight - boardHeight) / 2);
  const centeredOriginX = Math.round((viewportWidth - boardWidth) / 2);
  const desktopOriginX = Math.round(
    laneLeft + Math.max(0, (desktopLaneWidth - boardWidth) / 2)
  );

  return {
    cellSize,
    originX: isCompact ? centeredOriginX : desktopOriginX,
    originY: Math.max(0, Math.round(centeredOriginY))
  };
}
