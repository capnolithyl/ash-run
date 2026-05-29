import {
  getTerrainClusterVariantDefinition,
  getTerrainClusterVariantTerrainIds
} from "../assets.js";

const TERRAIN_CLUSTER_MATCH_ORDER = [
  { shape: "2x2", widthTiles: 2, heightTiles: 2 },
  { shape: "2x1", widthTiles: 2, heightTiles: 1 },
  { shape: "1x2", widthTiles: 1, heightTiles: 2 },
];

function getTileKey(x, y) {
  return `${x},${y}`;
}

function canClaimTerrainCluster(tiles, terrainId, startX, startY, widthTiles, heightTiles, coveredTiles) {
  for (let y = startY; y < startY + heightTiles; y += 1) {
    for (let x = startX; x < startX + widthTiles; x += 1) {
      if (tiles?.[y]?.[x] !== terrainId || coveredTiles.has(getTileKey(x, y))) {
        return false;
      }
    }
  }

  return true;
}

function claimTerrainCluster(startX, startY, widthTiles, heightTiles, coveredTiles) {
  for (let y = startY; y < startY + heightTiles; y += 1) {
    for (let x = startX; x < startX + widthTiles; x += 1) {
      coveredTiles.add(getTileKey(x, y));
    }
  }
}

export function getTerrainClusterPlacements(tiles = []) {
  const placements = [];
  const coveredTiles = new Set();
  const mapHeight = tiles.length;
  const mapWidth = tiles[0]?.length ?? 0;

  for (const terrainId of getTerrainClusterVariantTerrainIds()) {
    for (const { shape, widthTiles, heightTiles } of TERRAIN_CLUSTER_MATCH_ORDER) {
      const variant = getTerrainClusterVariantDefinition(terrainId, shape);

      if (!variant) {
        continue;
      }

      for (let y = 0; y <= mapHeight - heightTiles; y += 1) {
        for (let x = 0; x <= mapWidth - widthTiles; x += 1) {
          if (!canClaimTerrainCluster(tiles, terrainId, x, y, widthTiles, heightTiles, coveredTiles)) {
            continue;
          }

          claimTerrainCluster(x, y, widthTiles, heightTiles, coveredTiles);
          placements.push({
            ...variant,
            x,
            y,
          });
        }
      }
    }
  }

  return {
    placements,
    coveredTiles,
  };
}
