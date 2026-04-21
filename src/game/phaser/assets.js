import { BUILDING_KEYS } from "../core/constants.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../content/terrain.js";

export const SPRITE_ASSET_ROOT = "./assets/sprites";
export const SPRITE_SOURCE_SIZE = 64;
export const UNIT_OWNER_VARIANTS = ["player", "enemy"];
export const BUILDING_OWNER_VARIANTS = ["player", "enemy", "neutral"];

function createSpriteAsset(group, id, owner = null) {
  return {
    group,
    id,
    owner,
    key: owner ? `sprite:${group}:${owner}:${id}` : `sprite:${group}:${id}`,
    url: owner
      ? `${SPRITE_ASSET_ROOT}/${group}/${owner}/${id}.svg`
      : `${SPRITE_ASSET_ROOT}/${group}/${id}.svg`
  };
}

export const UNIT_SPRITES = Object.fromEntries(
  Object.keys(UNIT_CATALOG).map((unitTypeId) => [
    unitTypeId,
    Object.fromEntries(
      UNIT_OWNER_VARIANTS.map((owner) => [
        owner,
        createSpriteAsset("units", unitTypeId, owner)
      ])
    )
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
    Object.fromEntries(
      BUILDING_OWNER_VARIANTS.map((owner) => [
        owner,
        createSpriteAsset("buildings", buildingTypeId, owner)
      ])
    )
  ])
);

export const SPRITE_ASSETS = [
  ...Object.values(UNIT_SPRITES).flatMap((variants) => Object.values(variants)),
  ...Object.values(TERRAIN_SPRITES),
  ...Object.values(BUILDING_SPRITES).flatMap((variants) => Object.values(variants))
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

export function getUnitSpriteKey(unitTypeId, owner = "player") {
  return UNIT_SPRITES[unitTypeId]?.[owner]?.key ?? UNIT_SPRITES[unitTypeId]?.player?.key ?? null;
}

export function getTerrainSpriteKey(terrainId) {
  return TERRAIN_SPRITES[terrainId]?.key ?? null;
}

export function getBuildingSpriteKey(buildingTypeId, owner = "neutral") {
  return (
    BUILDING_SPRITES[buildingTypeId]?.[owner]?.key ??
    BUILDING_SPRITES[buildingTypeId]?.neutral?.key ??
    null
  );
}
