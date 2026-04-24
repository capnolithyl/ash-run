export function getBattlefieldLayout({
  viewportWidth,
  viewportHeight,
  mapWidth,
  mapHeight
}) {
  const isCompact = viewportWidth <= 1024;
  const isShort = viewportHeight <= 520;
  const reservedTop = isCompact ? (isShort ? 76 : 118) : 0;
  const reservedBottom = isCompact ? (isShort ? 94 : viewportWidth <= 560 ? 152 : 128) : 0;
  const availableHeight = Math.max(180, viewportHeight - reservedTop - reservedBottom);
  const maxBoardWidth = viewportWidth * (isCompact ? 0.94 : 0.56);
  const maxBoardHeight = isCompact ? availableHeight : viewportHeight * 0.72;
  const cellSize = Math.max(1, Math.floor(Math.min(maxBoardWidth / mapWidth, maxBoardHeight / mapHeight)));
  const boardWidth = mapWidth * cellSize;
  const boardHeight = mapHeight * cellSize;
  const centeredOriginY = isCompact
    ? reservedTop + Math.max(0, (availableHeight - boardHeight) / 2)
    : (viewportHeight - boardHeight) / 2;
  const desktopLift = isCompact ? 0 : Math.round(Math.min(34, viewportHeight * 0.034));

  return {
    cellSize,
    originX: Math.round((viewportWidth - boardWidth) / 2),
    originY: Math.max(0, Math.round(centeredOriginY - desktopLift))
  };
}
