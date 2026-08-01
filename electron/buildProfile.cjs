const fs = require("node:fs");
const path = require("node:path");

const DEVELOPMENT_PROFILE = Object.freeze({
  id: "development",
  capabilities: Object.freeze({
    run: true,
    progression: true,
    skirmish: true,
    mapEditor: true,
    tutorial: true,
    sandbox: true,
    customMaps: true
  }),
  identity: Object.freeze({
    appId: "com.ashrun84.game.dev",
    productName: "Ash Run '84 Dev",
    storageNamespace: "ash-run-84:development",
    storageDirectoryName: "Ash Run '84 Dev"
  })
});

function getDistDirectoryName(environment = process.env) {
  return environment.ASH_RUN_84_DIST_DIR === "dist-dev" ? "dist-dev" : "dist";
}

function readBuildProfileMetadata({
  appRoot,
  environment = process.env,
  isDevServer = false,
  fsImpl = fs
}) {
  if (isDevServer) {
    return DEVELOPMENT_PROFILE;
  }

  const distDirectoryName = getDistDirectoryName(environment);
  const manifestPath = path.join(appRoot, distDirectoryName, "build-profile.json");
  const metadata = JSON.parse(fsImpl.readFileSync(manifestPath, "utf8"));
  const requestedProfile = environment.ASH_RUN_84_BUILD_PROFILE;

  if (requestedProfile && metadata.id !== requestedProfile) {
    throw new Error(
      `Build profile mismatch: requested ${requestedProfile}, but ${manifestPath} contains ${metadata.id}.`
    );
  }

  if (!metadata.identity?.productName || !metadata.identity?.storageDirectoryName) {
    throw new Error(`Invalid build profile metadata in ${manifestPath}.`);
  }

  return metadata;
}

function hasMapToolAccess(metadata) {
  return metadata?.capabilities?.mapEditor === true &&
    metadata?.capabilities?.customMaps === true;
}

module.exports = {
  DEVELOPMENT_PROFILE,
  getDistDirectoryName,
  hasMapToolAccess,
  readBuildProfileMetadata
};
