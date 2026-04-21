import { BUILDING_KEYS } from "../core/constants.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../content/terrain.js";

export const SPRITE_ASSET_ROOT = "./assets/sprites";
export const SPRITE_SOURCE_SIZE = 64;

function createSpriteAsset(group, id) {
  return {
    group,
    id,
    key: `sprite:${group}:${id}`,
    url: `${SPRITE_ASSET_ROOT}/${group}/${id}.svg`
  };
}

export const UNIT_SPRITES = Object.fromEntries(
  Object.keys(UNIT_CATALOG).map((unitTypeId) => [
    unitTypeId,
    createSpriteAsset("units", unitTypeId)
  ])
);

export const TERRAIN_SPRITES = Object.fromEntries(
  Object.keys(TERRAIN_LIBRARY).map((terrainId) => [
    terrainId,
    createSpriteAsset("terrain", terrainId)
  ])
);

export const BUILDING_SPRITES = Object.fromEntries(
  Object.values(BUILDING_KEYS).map((buildingTypeId) => [
    buildingTypeId,
    createSpriteAsset("buildings", buildingTypeId)
  ])
);

export const SPRITE_ASSETS = [
  ...Object.values(UNIT_SPRITES),
  ...Object.values(TERRAIN_SPRITES),
  ...Object.values(BUILDING_SPRITES)
];

export function preloadSpriteAssets(scene) {
  for (const asset of SPRITE_ASSETS) {
    if (!scene.textures.exists(asset.key)) {
      scene.load.svg(asset.key, asset.url, {
        width: SPRITE_SOURCE_SIZE,
        height: SPRITE_SOURCE_SIZE
      });
    }
  }
}

export function getUnitSpriteKey(unitTypeId) {
  return UNIT_SPRITES[unitTypeId]?.key ?? null;
}

export function getTerrainSpriteKey(terrainId) {
  return TERRAIN_SPRITES[terrainId]?.key ?? null;
}

export function getBuildingSpriteKey(buildingTypeId) {
  return BUILDING_SPRITES[buildingTypeId]?.key ?? null;
}
