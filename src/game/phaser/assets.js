import { BUILDING_KEYS } from "../core/constants.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { GENERATED_BUILDING_SPRITE_PNG_OWNERS } from "./generated/buildingSpritePngOwners.js";
import { GENERATED_TERRAIN_SPRITE_PNG_IDS } from "./generated/terrainSpritePngIds.js";
import * as generatedUnitSpriteAnimationsModule from "./generated/unitSpriteAnimations.js";

const generatedUnitSpriteAnimationsFallback = Reflect.get(
  generatedUnitSpriteAnimationsModule,
  "default",
);
const GENERATED_UNIT_SPRITE_ANIMATIONS =
  generatedUnitSpriteAnimationsModule.GENERATED_UNIT_SPRITE_ANIMATIONS ??
  generatedUnitSpriteAnimationsFallback?.GENERATED_UNIT_SPRITE_ANIMATIONS ??
  {};

const SPRITE_ASSET_ROOT = "./assets/sprites";
const AUDIO_ASSET_ROOT = "./assets/audio";
const SPRITE_SOURCE_SIZE = 64;
export const UNIT_OWNER_VARIANTS = ["player", "enemy"];
export const BUILDING_OWNER_VARIANTS = ["player", "enemy", "neutral"];
export const MUSIC_TRACK_IDS = {
  MENU: "menu",
  ALLY_TURN: "ally-turn",
  ENEMY_TURN: "enemy-turn",
};

const UNIT_ANIMATION_IDS = ["idle", "walk", "attack"];

function createSpriteAsset(group, id, owner = null, extension = "svg") {
  return {
    group,
    id,
    owner,
    type: extension === "png" ? "image" : "svg",
    key: owner ? `sprite:${group}:${owner}:${id}` : `sprite:${group}:${id}`,
    url: owner
      ? `${SPRITE_ASSET_ROOT}/${group}/${owner}/${id}.${extension}`
      : `${SPRITE_ASSET_ROOT}/${group}/${id}.${extension}`,
  };
}

const UNIT_SPRITES = Object.fromEntries(
  Object.keys(UNIT_CATALOG).map((unitTypeId) => [
    unitTypeId,
    Object.fromEntries(
      UNIT_OWNER_VARIANTS.map((owner) => [
        owner,
        createSpriteAsset("units", unitTypeId, owner),
      ]),
    ),
  ]),
);

const TERRAIN_PNG_OVERRIDES = new Set(GENERATED_TERRAIN_SPRITE_PNG_IDS);

const TERRAIN_SPRITES = Object.fromEntries(
  Object.keys(TERRAIN_LIBRARY).map((terrainId) => [
    terrainId,
    createSpriteAsset(
      "terrain",
      terrainId,
      null,
      TERRAIN_PNG_OVERRIDES.has(terrainId) ? "png" : "svg",
    ),
  ]),
);

const BUILDING_PNG_OVERRIDES = Object.fromEntries(
  Object.entries(GENERATED_BUILDING_SPRITE_PNG_OWNERS).map(([buildingTypeId, owners]) => [
    buildingTypeId,
    new Set(owners),
  ]),
);

const BUILDING_SPRITES = Object.fromEntries(
  Object.values(BUILDING_KEYS).map((buildingTypeId) => [
    buildingTypeId,
    Object.fromEntries(
      BUILDING_OWNER_VARIANTS.map((owner) => [
        owner,
        createSpriteAsset(
          "buildings",
          buildingTypeId,
          owner,
          BUILDING_PNG_OVERRIDES[buildingTypeId]?.has(owner) ? "png" : "svg",
        ),
      ]),
    ),
  ]),
);

const MUSIC_TRACKS = {
  [MUSIC_TRACK_IDS.MENU]: {
    id: MUSIC_TRACK_IDS.MENU,
    key: "music:menu",
    url: `${AUDIO_ASSET_ROOT}/music/Theme.mp3`,
  },
  [MUSIC_TRACK_IDS.ALLY_TURN]: {
    id: MUSIC_TRACK_IDS.ALLY_TURN,
    key: "music:ally-turn",
    url: `${AUDIO_ASSET_ROOT}/music/Ally Theme.mp3`,
  },
  [MUSIC_TRACK_IDS.ENEMY_TURN]: {
    id: MUSIC_TRACK_IDS.ENEMY_TURN,
    key: "music:enemy-turn",
    url: `${AUDIO_ASSET_ROOT}/music/Enemy Theme.mp3`,
  },
};

function flattenUnitAnimationAssets() {
  return Object.values(GENERATED_UNIT_SPRITE_ANIMATIONS).flatMap((ownerVariants) =>
    Object.values(ownerVariants).flatMap((ownerSpec) =>
      UNIT_ANIMATION_IDS.flatMap((animationId) => {
        const animationSpec = ownerSpec?.animations?.[animationId];

        if (!animationSpec) {
          return [];
        }

        return [{
          ...animationSpec,
          type: "spritesheet",
          frameWidth: ownerSpec.frameWidth,
          frameHeight: ownerSpec.frameHeight,
        }];
      }),
    ),
  );
}

export const SPRITE_ASSETS = [
  ...Object.values(UNIT_SPRITES).flatMap((variants) => Object.values(variants)),
  ...flattenUnitAnimationAssets(),
  ...Object.values(TERRAIN_SPRITES),
  ...Object.values(BUILDING_SPRITES).flatMap((variants) =>
    Object.values(variants),
  ),
];

export const MUSIC_ASSETS = Object.values(MUSIC_TRACKS);

export function preloadSpriteAssets(scene) {
  for (const asset of SPRITE_ASSETS) {
    if (!scene.textures.exists(asset.key)) {
      if (asset.type === "spritesheet") {
        scene.load.spritesheet(asset.key, asset.url, {
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight,
        });
      } else if (asset.type === "image") {
        scene.load.image(asset.key, asset.url);
      } else {
        scene.load.svg(asset.key, asset.url, {
          width: SPRITE_SOURCE_SIZE,
          height: SPRITE_SOURCE_SIZE,
        });
      }
    }
  }
}

export function preloadMusicAssets(scene) {
  for (const asset of MUSIC_ASSETS) {
    if (!scene.cache.audio.exists(asset.key)) {
      scene.load.audio(asset.key, asset.url);
    }
  }
}

export function getMusicTrackKey(trackId) {
  return MUSIC_TRACKS[trackId]?.key ?? null;
}

export function getUnitSpriteKey(unitTypeId, owner = "player") {
  return (
    UNIT_SPRITES[unitTypeId]?.[owner]?.key ??
    UNIT_SPRITES[unitTypeId]?.player?.key ??
    null
  );
}

export function getUnitSpriteDefinition(unitTypeId, owner = "player") {
  const fallbackAsset =
    UNIT_SPRITES[unitTypeId]?.[owner] ??
    UNIT_SPRITES[unitTypeId]?.player ??
    null;
  const fallbackKey = fallbackAsset?.key ?? null;
  const animationBundle = GENERATED_UNIT_SPRITE_ANIMATIONS[unitTypeId]?.[owner] ?? null;
  const idleAnimation = animationBundle?.animations?.idle ?? null;

  if (!fallbackKey && !animationBundle) {
    return null;
  }

  return {
    type: idleAnimation ? "spritesheet" : "image",
    key: idleAnimation?.key ?? fallbackKey,
    url: idleAnimation?.url ?? fallbackAsset?.url ?? null,
    frameCount: idleAnimation?.ranges?.default
      ? idleAnimation.ranges.default.end - idleAnimation.ranges.default.start + 1
      : 1,
    frameRate: idleAnimation?.frameRate ?? null,
    fallbackKey,
    fallbackUrl: fallbackAsset?.url ?? null,
    idle: idleAnimation,
    walk: animationBundle?.animations?.walk ?? null,
    attack: animationBundle?.animations?.attack ?? null,
  };
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
