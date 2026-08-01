export const BUILD_PROFILES = Object.freeze({
  DEVELOPMENT: "development",
  PRODUCTION: "production"
});

export const BUILD_FEATURES = Object.freeze({
  RUN: "run",
  PROGRESSION: "progression",
  SKIRMISH: "skirmish",
  MAP_EDITOR: "mapEditor",
  TUTORIAL: "tutorial",
  SANDBOX: "sandbox",
  CUSTOM_MAPS: "customMaps"
});

const DEVELOPMENT_CAPABILITIES = Object.freeze({
  [BUILD_FEATURES.RUN]: true,
  [BUILD_FEATURES.PROGRESSION]: true,
  [BUILD_FEATURES.SKIRMISH]: true,
  [BUILD_FEATURES.MAP_EDITOR]: true,
  [BUILD_FEATURES.TUTORIAL]: true,
  [BUILD_FEATURES.SANDBOX]: true,
  [BUILD_FEATURES.CUSTOM_MAPS]: true
});

const PRODUCTION_CAPABILITIES = Object.freeze({
  [BUILD_FEATURES.RUN]: true,
  [BUILD_FEATURES.PROGRESSION]: true,
  [BUILD_FEATURES.SKIRMISH]: false,
  [BUILD_FEATURES.MAP_EDITOR]: false,
  [BUILD_FEATURES.TUTORIAL]: false,
  [BUILD_FEATURES.SANDBOX]: false,
  [BUILD_FEATURES.CUSTOM_MAPS]: false
});

const BUILD_PROFILE_CONFIGS = Object.freeze({
  [BUILD_PROFILES.DEVELOPMENT]: Object.freeze({
    id: BUILD_PROFILES.DEVELOPMENT,
    capabilities: DEVELOPMENT_CAPABILITIES,
    identity: Object.freeze({
      appId: "com.ashrun84.game.dev",
      productName: "Ash Run '84 Dev",
      storageNamespace: "ash-run-84:development",
      storageDirectoryName: "Ash Run '84 Dev"
    })
  }),
  [BUILD_PROFILES.PRODUCTION]: Object.freeze({
    id: BUILD_PROFILES.PRODUCTION,
    capabilities: PRODUCTION_CAPABILITIES,
    identity: Object.freeze({
      appId: "com.ashrun84.game.alpha",
      productName: "Ash Run '84 Alpha",
      storageNamespace: "ash-run-84:alpha",
      storageDirectoryName: "Ash Run '84 Alpha"
    })
  })
});

const COMPILED_BUILD_PROFILE =
  typeof __ASH_RUN_BUILD_PROFILE__ === "string"
    ? __ASH_RUN_BUILD_PROFILE__
    : BUILD_PROFILES.DEVELOPMENT;

export function normalizeBuildProfile(profile) {
  return profile === BUILD_PROFILES.PRODUCTION
    ? BUILD_PROFILES.PRODUCTION
    : BUILD_PROFILES.DEVELOPMENT;
}

export function getBuildProfileConfig(profile = COMPILED_BUILD_PROFILE) {
  return BUILD_PROFILE_CONFIGS[normalizeBuildProfile(profile)];
}

export function isBuildFeatureEnabled(profileOrConfig, featureId) {
  const config =
    typeof profileOrConfig === "string"
      ? getBuildProfileConfig(profileOrConfig)
      : profileOrConfig ?? getBuildProfileConfig();

  return config.capabilities?.[featureId] === true;
}

export const CURRENT_BUILD_PROFILE = normalizeBuildProfile(COMPILED_BUILD_PROFILE);
export const CURRENT_BUILD_CONFIG = getBuildProfileConfig(CURRENT_BUILD_PROFILE);
