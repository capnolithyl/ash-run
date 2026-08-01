import { BUILDING_KEYS } from "../core/constants.js";
import {
  DEFAULT_ENEMY_COLOR,
  DEFAULT_PLAYER_COLOR,
  UNIT_COLOR_IDS,
  getUnitColorIdForOwner,
} from "../core/unitColors.js";
import { UNIT_CATALOG } from "../content/unitCatalog.js";
import { TERRAIN_LIBRARY } from "../content/terrain.js";
import { GENERATED_BUILDING_SPRITE_PNG_OWNERS } from "./generated/buildingSpritePngOwners.js";
import {
  GENERATED_TERRAIN_ANIMATED_IDS,
  GENERATED_TERRAIN_SPRITE_PNG_IDS,
} from "./generated/terrainSpritePngIds.js";
import * as generatedUnitSpriteAnimationsModule from "./generated/unitSpriteAnimations.js";
import { getUnitSpritePresentation } from "./unitSpritePresentation.js";
import {
  ATTACK_PROFILE_SFX_CUE_BY_TYPE,
  COMMANDER_SFX_CUE_BY_ID,
  MOVEMENT_SFX_CUE_BY_FAMILY,
  SERVICE_SFX_CUE_BY_SOURCE,
  SFX_ASSETS,
  SFX_CUE_IDS,
  UNIT_MOVEMENT_SFX_CUE,
  WEAPON_SFX_CUE_BY_CLASS,
  getCommanderSfxCueId,
  getMovementSfxCueId,
  getServiceSfxCueId,
  getSfxAssetKey,
  getSfxCueDefinition,
  getWeaponSfxCueId,
  warnSfxOnce,
} from "./audio/SfxCatalog.js";

export {
  ATTACK_PROFILE_SFX_CUE_BY_TYPE,
  COMMANDER_SFX_CUE_BY_ID,
  MOVEMENT_SFX_CUE_BY_FAMILY,
  SERVICE_SFX_CUE_BY_SOURCE,
  SFX_ASSETS,
  SFX_CUE_IDS,
  UNIT_MOVEMENT_SFX_CUE,
  WEAPON_SFX_CUE_BY_CLASS,
  getCommanderSfxCueId,
  getMovementSfxCueId,
  getServiceSfxCueId,
  getSfxAssetKey,
  getSfxCueDefinition,
  getWeaponSfxCueId,
  warnSfxOnce,
};

const generatedUnitSpriteAnimationsFallback = Reflect.get(
  generatedUnitSpriteAnimationsModule,
  "default",
);
const GENERATED_UNIT_SPRITE_ANIMATIONS =
  generatedUnitSpriteAnimationsModule.GENERATED_UNIT_SPRITE_ANIMATIONS ??
  generatedUnitSpriteAnimationsFallback?.GENERATED_UNIT_SPRITE_ANIMATIONS ??
  {};
const GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY =
  generatedUnitSpriteAnimationsModule.GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY ??
  generatedUnitSpriteAnimationsFallback?.GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY ??
  {};
const GENERATED_UNIT_SPRITE_STATIC_COLORS =
  generatedUnitSpriteAnimationsModule.GENERATED_UNIT_SPRITE_STATIC_COLORS ??
  generatedUnitSpriteAnimationsFallback?.GENERATED_UNIT_SPRITE_STATIC_COLORS ??
  {};

const SPRITE_ASSET_ROOT = "./assets/sprites";
const AUDIO_ASSET_ROOT = "./assets/audio";
const IMAGE_ASSET_ROOT = "./assets/img";
const SPRITE_SOURCE_SIZE = 64;
const TERRAIN_SOURCE_SIZE = 128;
const TERRAIN_ANIMATION_FRAME_RATE = 10;
const TERRAIN_TRANSITION_BASE_DIRECTION = "north";
const TERRAIN_ANIMATION_CONFIG = {
  road: {
    frameCount: 16,
    sheetColumns: 4,
    sheetRows: 4,
  },
  water: {
    frameWidth: 627,
    frameHeight: 627,
    frameRate: 4,
    frameCount: 4,
    sheetColumns: 4,
    sheetRows: 1,
  },
};
const TERRAIN_CLUSTER_VARIANT_ASSETS = {
  forest_1x2: {
    group: "terrain-cluster",
    id: "forest_1x2",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:forest:1x2",
    url: `${SPRITE_ASSET_ROOT}/terrain/forest_1x2.png`,
  },
  forest_2x1: {
    group: "terrain-cluster",
    id: "forest_2x1",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:forest:2x1",
    url: `${SPRITE_ASSET_ROOT}/terrain/forest_2x1.png`,
  },
  forest_2x2: {
    group: "terrain-cluster",
    id: "forest_2x2",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:forest:2x2",
    url: `${SPRITE_ASSET_ROOT}/terrain/forest_2x2.png`,
  },
  mountain_1x2: {
    group: "terrain-cluster",
    id: "mountain_1x2",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:mountain:1x2",
    url: `${SPRITE_ASSET_ROOT}/terrain/mountain_1x2.png`,
  },
  mountain_2x1: {
    group: "terrain-cluster",
    id: "mountain_2x1",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:mountain:2x1",
    url: `${SPRITE_ASSET_ROOT}/terrain/mountain_2x1.png`,
  },
  mountain_2x2: {
    group: "terrain-cluster",
    id: "mountain_2x2",
    owner: null,
    type: "image",
    key: "sprite:terrain-cluster:mountain:2x2",
    url: `${SPRITE_ASSET_ROOT}/terrain/mountain_2x2.png`,
  },
};
const TERRAIN_CLUSTER_VARIANT_REGISTRY = {
  forest: {
    // The forest pair filenames are author-named opposite their actual footprint,
    // so map the registry by the visual shape we need to render.
    "1x2": {
      assetId: "forest_2x1",
      widthTiles: 1,
      heightTiles: 2,
    },
    "2x1": {
      assetId: "forest_1x2",
      widthTiles: 2,
      heightTiles: 1,
    },
    "2x2": {
      assetId: "forest_2x2",
      widthTiles: 2,
      heightTiles: 2,
    },
  },
  mountain: {
    "1x2": {
      assetId: "mountain_1x2",
      widthTiles: 1,
      heightTiles: 2,
    },
    "2x1": {
      assetId: "mountain_2x1",
      widthTiles: 2,
      heightTiles: 1,
    },
    "2x2": {
      assetId: "mountain_2x2",
      widthTiles: 2,
      heightTiles: 2,
    },
  },
};
const TERRAIN_TRANSITION_OVERLAY_ASSETS = {
  edge: {
    group: "terrain-transition",
    id: "edge",
    owner: null,
    type: "image",
    key: "sprite:terrain-transition:edge",
    url: `${SPRITE_ASSET_ROOT}/terrain/edge.png`,
  },
  roadside: {
    group: "terrain-transition",
    id: "roadside",
    owner: null,
    type: "image",
    key: "sprite:terrain-transition:roadside",
    url: `${SPRITE_ASSET_ROOT}/terrain/roadside.png`,
  },
  shoal: {
    group: "terrain-transition",
    id: "shoal",
    owner: null,
    type: "image",
    key: "sprite:terrain-transition:shoal",
    url: `${SPRITE_ASSET_ROOT}/terrain/shoal.png`,
  },
};
const TERRAIN_TRANSITION_REGISTRY = {
  road: {
    forest: {
      assetId: "roadside",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
    mountain: {
      assetId: "roadside",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
    plain: {
      assetId: "roadside",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
  },
  water: {
    plain: {
      assetId: "shoal",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
    forest: {
      assetId: "shoal",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
    mountain: {
      assetId: "shoal",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
    road: {
      assetId: "edge",
      baseDirection: TERRAIN_TRANSITION_BASE_DIRECTION,
    },
  },
};
export const UNIT_OWNER_VARIANTS = ["player", "enemy"];
export const UNIT_COLOR_VARIANTS = [...UNIT_COLOR_IDS];
export const BUILDING_OWNER_VARIANTS = ["player", "enemy", "neutral"];
export const SPLASH_ASSET_IDS = {
  BACKGROUND: "background",
  STUDIO_LOGO: "studio-logo",
  GAME_LOGO: "game-logo",
};
export const BATTLEFIELD_ASSET_IDS = {
  BACKGROUND: "background",
};
export const MUSIC_TRACK_IDS = {
  MENU: "menu",
  COMMANDER_ROOK: "commander-rook",
  COMMANDER_NOVA: "commander-nova",
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
      (GENERATED_UNIT_SPRITE_STATIC_COLORS[unitTypeId] ?? []).map((colorId) => [
        colorId,
        createSpriteAsset("units", unitTypeId, colorId),
      ]),
    ),
  ]),
);

const TERRAIN_PNG_OVERRIDES = new Set(GENERATED_TERRAIN_SPRITE_PNG_IDS);
const TERRAIN_ANIMATED_OVERRIDES = new Set(GENERATED_TERRAIN_ANIMATED_IDS);

function createTerrainAnimationAsset(terrainId) {
  const config = TERRAIN_ANIMATION_CONFIG[terrainId] ?? {};

  return {
    group: "terrain",
    id: terrainId,
    owner: null,
    type: "spritesheet",
    key: `spritesheet:terrain:${terrainId}`,
    url: `${SPRITE_ASSET_ROOT}/terrain/${terrainId}/${terrainId}.png`,
    frameWidth: config.frameWidth ?? TERRAIN_SOURCE_SIZE,
    frameHeight: config.frameHeight ?? TERRAIN_SOURCE_SIZE,
    frameRate: config.frameRate ?? TERRAIN_ANIMATION_FRAME_RATE,
    frameCount: config.frameCount ?? null,
    sheetColumns: config.sheetColumns ?? null,
    sheetRows: config.sheetRows ?? null,
    animationKey: `animation:terrain:${terrainId}:default`,
  };
}

const TERRAIN_SPRITES = Object.fromEntries(
  Object.keys(TERRAIN_LIBRARY).map((terrainId) => [
    terrainId,
    {
      fallback: createSpriteAsset(
        "terrain",
        terrainId,
        null,
        TERRAIN_PNG_OVERRIDES.has(terrainId) ? "png" : "svg",
      ),
      animated: TERRAIN_ANIMATED_OVERRIDES.has(terrainId)
        ? createTerrainAnimationAsset(terrainId)
        : null,
    },
  ]),
);

const BUILDING_PNG_OVERRIDES = Object.fromEntries(
  Object.entries(GENERATED_BUILDING_SPRITE_PNG_OWNERS).map(
    ([buildingTypeId, owners]) => [buildingTypeId, new Set(owners)],
  ),
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
    url: `${AUDIO_ASSET_ROOT}/music/Ashes To Ashes - Main Theme.mp3`,
  },
  [MUSIC_TRACK_IDS.COMMANDER_ROOK]: {
    id: MUSIC_TRACK_IDS.COMMANDER_ROOK,
    commanderId: "rook",
    key: "music:commander:rook",
    url: `${AUDIO_ASSET_ROOT}/music/The House Always Wins - Rook's Theme.mp3`,
  },
  [MUSIC_TRACK_IDS.COMMANDER_NOVA]: {
    id: MUSIC_TRACK_IDS.COMMANDER_NOVA,
    commanderId: "nova",
    key: "music:commander:nova",
    url: `${AUDIO_ASSET_ROOT}/music/Super Nova - Nova's Theme.mp3`,
  },
};

const COMMANDER_MUSIC_TRACK_IDS = Object.fromEntries(
  Object.values(MUSIC_TRACKS)
    .filter((track) => track.commanderId)
    .map((track) => [track.commanderId, track.id]),
);

const SPLASH_ASSETS = {
  [SPLASH_ASSET_IDS.BACKGROUND]: {
    key: "image:splash:background",
    url: `${IMAGE_ASSET_ROOT}/splash/splash-background.png`,
  },
  [SPLASH_ASSET_IDS.STUDIO_LOGO]: {
    key: "image:splash:studio-logo",
    url: `${IMAGE_ASSET_ROOT}/logos/articus.png`,
  },
  [SPLASH_ASSET_IDS.GAME_LOGO]: {
    key: "image:splash:game-logo",
    url: `${IMAGE_ASSET_ROOT}/logos/logo.png`,
  },
};

const BATTLEFIELD_ASSETS = {
  [BATTLEFIELD_ASSET_IDS.BACKGROUND]: {
    key: "image:battlefield:background",
    url: `${IMAGE_ASSET_ROOT}/ui/background/battlefield-bg.png`,
  },
};

function flattenUnitAnimationAssets() {
  const assetsByKey = new Map();

  for (const ownerVariants of Object.values(GENERATED_UNIT_SPRITE_ANIMATIONS)) {
    for (const ownerSpec of Object.values(ownerVariants)) {
      for (const animationId of UNIT_ANIMATION_IDS) {
        const animationSpec = ownerSpec?.animations?.[animationId];

        if (!animationSpec) {
          continue;
        }

        if (!assetsByKey.has(animationSpec.key)) {
          assetsByKey.set(animationSpec.key, {
            ...animationSpec,
            type: "spritesheet",
            frameWidth: animationSpec.frameWidth ?? ownerSpec.frameWidth,
            frameHeight: animationSpec.frameHeight ?? ownerSpec.frameHeight,
          });
        }
      }
    }
  }

  return [...assetsByKey.values()];
}

export const SPRITE_ASSETS = [
  ...Object.values(UNIT_SPRITES).flatMap((variants) => Object.values(variants)),
  ...flattenUnitAnimationAssets(),
  ...Object.values(TERRAIN_SPRITES).flatMap(({ fallback, animated }) =>
    animated ? [fallback, animated] : [fallback],
  ),
  ...Object.values(TERRAIN_CLUSTER_VARIANT_ASSETS),
  ...Object.values(TERRAIN_TRANSITION_OVERLAY_ASSETS),
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

  for (const asset of Object.values(BATTLEFIELD_ASSETS)) {
    if (!scene.textures.exists(asset.key)) {
      scene.load.image(asset.key, asset.url);
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

export function preloadSfxAssets(scene) {
  for (const asset of SFX_ASSETS) {
    if (!scene.cache.audio.exists(asset.key)) {
      scene.load.audio(asset.key, asset.url);
    }
  }
}

export function preloadAudioAssets(scene) {
  preloadMusicAssets(scene);
  preloadSfxAssets(scene);
}

export function preloadSplashAssets(scene) {
  for (const asset of Object.values(SPLASH_ASSETS)) {
    if (!scene.textures.exists(asset.key)) {
      scene.load.image(asset.key, asset.url);
    }
  }
}

export function getSplashAssetKey(assetId) {
  return SPLASH_ASSETS[assetId]?.key ?? null;
}

export function getBattlefieldAssetKey(assetId) {
  return BATTLEFIELD_ASSETS[assetId]?.key ?? null;
}

export function getMusicTrackKey(trackId) {
  return MUSIC_TRACKS[trackId]?.key ?? null;
}

export function getCommanderMusicTrackId(commanderId) {
  return COMMANDER_MUSIC_TRACK_IDS[commanderId] ?? null;
}

export function getUnitSpriteColorAvailability() {
  return Object.fromEntries(
    UNIT_COLOR_IDS.filter(
      (colorId) => GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY[colorId] === true,
    ).map((colorId) => [colorId, true]),
  );
}

export function isUnitSpriteColorAvailable(colorId) {
  return GENERATED_UNIT_SPRITE_COLOR_AVAILABILITY[colorId] === true;
}

export function resolveUnitSpriteColor(owner = "player", colorOptions = {}) {
  const requestedColorId = getUnitColorIdForOwner(owner, colorOptions);

  if (isUnitSpriteColorAvailable(requestedColorId)) {
    return requestedColorId;
  }

  const ownerFallback =
    owner === "enemy" ? DEFAULT_ENEMY_COLOR : DEFAULT_PLAYER_COLOR;

  if (isUnitSpriteColorAvailable(ownerFallback)) {
    return ownerFallback;
  }

  return (
    UNIT_COLOR_IDS.find((colorId) => isUnitSpriteColorAvailable(colorId)) ??
    requestedColorId
  );
}

function hasUnitSpriteColor(unitTypeId, colorId) {
  return Boolean(
    UNIT_SPRITES[unitTypeId]?.[colorId] ||
    GENERATED_UNIT_SPRITE_ANIMATIONS[unitTypeId]?.[colorId],
  );
}

function resolveUnitSpriteColorForUnit(unitTypeId, owner, colorOptions) {
  const requestedColorId = resolveUnitSpriteColor(owner, colorOptions);

  if (hasUnitSpriteColor(unitTypeId, requestedColorId)) {
    return requestedColorId;
  }

  const ownerFallback =
    owner === "enemy" ? DEFAULT_ENEMY_COLOR : DEFAULT_PLAYER_COLOR;

  if (hasUnitSpriteColor(unitTypeId, ownerFallback)) {
    return ownerFallback;
  }

  return (
    UNIT_COLOR_IDS.find((colorId) => hasUnitSpriteColor(unitTypeId, colorId)) ??
    requestedColorId
  );
}

export function getUnitSpriteKey(
  unitTypeId,
  owner = "player",
  colorOptions = {},
) {
  const colorId = resolveUnitSpriteColorForUnit(
    unitTypeId,
    owner,
    colorOptions,
  );
  return UNIT_SPRITES[unitTypeId]?.[colorId]?.key ?? null;
}

export function getUnitSpriteDefinition(
  unitTypeId,
  owner = "player",
  colorOptions = {},
) {
  const requestedColorId = getUnitColorIdForOwner(owner, colorOptions);
  const colorId = resolveUnitSpriteColorForUnit(
    unitTypeId,
    owner,
    colorOptions,
  );
  const fallbackAsset = UNIT_SPRITES[unitTypeId]?.[colorId] ?? null;
  const fallbackKey = fallbackAsset?.key ?? null;
  const animationBundle =
    GENERATED_UNIT_SPRITE_ANIMATIONS[unitTypeId]?.[colorId] ?? null;
  const idleAnimation = animationBundle?.animations?.idle ?? null;

  if (!fallbackKey && !animationBundle) {
    return null;
  }

  return {
    owner,
    requestedColorId,
    colorId,
    type: idleAnimation ? "spritesheet" : "image",
    key: idleAnimation?.key ?? fallbackKey,
    url: idleAnimation?.url ?? fallbackAsset?.url ?? null,
    frameWidth: animationBundle?.frameWidth ?? null,
    frameHeight: animationBundle?.frameHeight ?? null,
    frameCount: idleAnimation?.ranges?.default
      ? idleAnimation.ranges.default.end -
        idleAnimation.ranges.default.start +
        1
      : 1,
    frameRate: idleAnimation?.frameRate ?? null,
    fallbackKey,
    fallbackUrl: fallbackAsset?.url ?? null,
    idle: idleAnimation,
    walk: animationBundle?.animations?.walk ?? null,
    attack: animationBundle?.animations?.attack ?? null,
    presentation: getUnitSpritePresentation(unitTypeId),
  };
}

export function getTerrainSpriteKey(terrainId) {
  return (
    TERRAIN_SPRITES[terrainId]?.animated?.key ??
    TERRAIN_SPRITES[terrainId]?.fallback?.key ??
    null
  );
}

export function getTerrainSpriteDefinition(terrainId) {
  const spriteBundle = TERRAIN_SPRITES[terrainId];

  if (!spriteBundle) {
    return null;
  }

  return {
    type: spriteBundle.animated ? "spritesheet" : spriteBundle.fallback.type,
    key: spriteBundle.animated?.key ?? spriteBundle.fallback.key,
    url: spriteBundle.animated?.url ?? spriteBundle.fallback.url,
    fallbackKey: spriteBundle.fallback.key,
    fallbackUrl: spriteBundle.fallback.url,
    animated: spriteBundle.animated,
  };
}

export function getBuildingSpriteDefinition(buildingTypeId, owner = "neutral") {
  const asset =
    BUILDING_SPRITES[buildingTypeId]?.[owner] ??
    BUILDING_SPRITES[buildingTypeId]?.neutral ??
    null;

  if (!asset) {
    return null;
  }

  return {
    type: asset.type,
    key: asset.key,
    url: asset.url,
  };
}

export function getTerrainTransitionOverlayDefinition(
  sourceTerrainId,
  adjacentTerrainId,
) {
  const transitionSpec =
    TERRAIN_TRANSITION_REGISTRY[sourceTerrainId]?.[adjacentTerrainId] ?? null;

  if (!transitionSpec) {
    return null;
  }

  const asset =
    TERRAIN_TRANSITION_OVERLAY_ASSETS[transitionSpec.assetId] ?? null;

  if (!asset) {
    return null;
  }

  return {
    ...transitionSpec,
    key: asset.key,
    url: asset.url,
    type: asset.type,
  };
}

export function getTerrainClusterVariantTerrainIds() {
  return Object.keys(TERRAIN_CLUSTER_VARIANT_REGISTRY);
}

export function getTerrainClusterVariantDefinition(terrainId, shape) {
  const variantSpec =
    TERRAIN_CLUSTER_VARIANT_REGISTRY[terrainId]?.[shape] ?? null;

  if (!variantSpec) {
    return null;
  }

  const asset = TERRAIN_CLUSTER_VARIANT_ASSETS[variantSpec.assetId] ?? null;

  if (!asset) {
    return null;
  }

  return {
    ...variantSpec,
    terrainId,
    shape,
    key: asset.key,
    url: asset.url,
    type: asset.type,
  };
}

export function getBuildingSpriteKey(buildingTypeId, owner = "neutral") {
  return (
    BUILDING_SPRITES[buildingTypeId]?.[owner]?.key ??
    BUILDING_SPRITES[buildingTypeId]?.neutral?.key ??
    null
  );
}
