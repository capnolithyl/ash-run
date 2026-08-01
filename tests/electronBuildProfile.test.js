import test from "node:test";
import assert from "node:assert/strict";
import buildProfileModule from "../electron/buildProfile.cjs";
import {
  BUILD_PROFILES,
  getBuildProfileConfig
} from "../src/game/core/buildProfiles.js";

const {
  DEVELOPMENT_PROFILE,
  getDistDirectoryName,
  hasMapToolAccess,
  readBuildProfileMetadata
} = buildProfileModule;

test("Electron development metadata matches the renderer policy", () => {
  assert.deepEqual(
    DEVELOPMENT_PROFILE,
    getBuildProfileConfig(BUILD_PROFILES.DEVELOPMENT)
  );
  assert.equal(hasMapToolAccess(DEVELOPMENT_PROFILE), true);
  assert.equal(
    hasMapToolAccess(getBuildProfileConfig(BUILD_PROFILES.PRODUCTION)),
    false
  );
});

test("Electron resolves profile output directories and validates their manifests", () => {
  assert.equal(getDistDirectoryName({}), "dist");
  assert.equal(getDistDirectoryName({ ASH_RUN_84_DIST_DIR: "dist-dev" }), "dist-dev");

  const production = getBuildProfileConfig(BUILD_PROFILES.PRODUCTION);
  let requestedPath = null;
  const metadata = readBuildProfileMetadata({
    appRoot: "D:/ash-run/ash-run",
    environment: {
      ASH_RUN_84_BUILD_PROFILE: BUILD_PROFILES.PRODUCTION,
      ASH_RUN_84_DIST_DIR: "dist"
    },
    fsImpl: {
      readFileSync(filePath) {
        requestedPath = filePath;
        return JSON.stringify(production);
      }
    }
  });

  assert.match(requestedPath.replaceAll("\\", "/"), /\/dist\/build-profile\.json$/);
  assert.deepEqual(metadata, production);
});
