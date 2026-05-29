import { getTerrainTransitionOverlayDefinition } from "../assets.js";

const CARDINAL_DIRECTIONS = [
  { id: "north", dx: 0, dy: -1 },
  { id: "east", dx: 1, dy: 0 },
  { id: "south", dx: 0, dy: 1 },
  { id: "west", dx: -1, dy: 0 },
];
const CARDINAL_DIRECTION_INDEX = Object.fromEntries(
  CARDINAL_DIRECTIONS.map((direction, index) => [direction.id, index])
);

function getTransitionRotationDegrees(baseDirection, targetDirection) {
  const baseIndex = CARDINAL_DIRECTION_INDEX[baseDirection];
  const targetIndex = CARDINAL_DIRECTION_INDEX[targetDirection];

  if (!Number.isInteger(baseIndex) || !Number.isInteger(targetIndex)) {
    return 0;
  }

  let rotationDegrees = (targetIndex - baseIndex) * 90;

  if (rotationDegrees > 180) {
    rotationDegrees -= 360;
  }

  return rotationDegrees;
}

export function getTerrainTransitionPlacements(tiles, x, y) {
  const sourceTerrainId = tiles?.[y]?.[x];

  if (!sourceTerrainId) {
    return [];
  }

  return CARDINAL_DIRECTIONS.flatMap(({ id, dx, dy }) => {
    const adjacentTerrainId = tiles?.[y + dy]?.[x + dx];
    const overlay = getTerrainTransitionOverlayDefinition(sourceTerrainId, adjacentTerrainId);

    if (!overlay) {
      return [];
    }

    return [{
      ...overlay,
      direction: id,
      rotationDegrees: getTransitionRotationDegrees(overlay.baseDirection, id)
    }];
  });
}
