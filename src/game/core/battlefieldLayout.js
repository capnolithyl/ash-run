export function getBattlefieldLayout({
  viewportWidth,
  viewportHeight,
  mapWidth,
  mapHeight
}) {
  const isCompact = viewportWidth <= 1024;
  const isShort = viewportHeight <= 520;
  const reservedTop = isCompact ? (isShort ? 76 : 118) : 158;
  const reservedBottom = isCompact ? (isShort ? 94 : viewportWidth <= 560 ? 152 : 128) : 112;
  const availableHeight = Math.max(180, viewportHeight - reservedTop - reservedBottom);
  // Desktop rails are fixed-width, so fit the board to the center lane instead of
  // leaving a large generic viewport percentage on each side.
  const desktopRailWidth = 16.5 * 16;
  const desktopRailInset = 1.25 * 16;
  const desktopCenterLaneGap = 0.75 * 16;
  const desktopLaneWidth = Math.max(
    240,
    viewportWidth - (desktopRailWidth * 2 + desktopRailInset * 2 + desktopCenterLaneGap * 2)
  );
  const maxBoardWidth = isCompact ? viewportWidth * 0.94 : desktopLaneWidth;
  const maxBoardHeight = isCompact ? availableHeight : viewportHeight * 0.72;
  const cellSize = Math.max(1, Math.floor(Math.min(maxBoardWidth / mapWidth, maxBoardHeight / mapHeight)));
  const boardWidth = mapWidth * cellSize;
  const boardHeight = mapHeight * cellSize;
  const centeredOriginY = isCompact
    ? reservedTop + Math.max(0, (availableHeight - boardHeight) / 2)
    : reservedTop + Math.max(0, (availableHeight - boardHeight) / 2);
  const desktopLift = 0;

  return {
    cellSize,
    originX: Math.round((viewportWidth - boardWidth) / 2),
    originY: Math.max(0, Math.round(centeredOriginY - desktopLift))
  };
}
