import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Arch, Platform, build as buildElectron } from "electron-builder";
import {
  BUILD_PROFILES,
  getBuildProfileConfig
} from "../src/game/core/buildProfiles.js";

const root = process.cwd();
const requestedProfile = process.argv[2] ?? BUILD_PROFILES.PRODUCTION;

if (!Object.values(BUILD_PROFILES).includes(requestedProfile)) {
  throw new Error(
    `Unsupported package profile: ${requestedProfile}. Expected development or production.`
  );
}

const profileConfig = getBuildProfileConfig(requestedProfile);
const sourceDirectory =
  requestedProfile === BUILD_PROFILES.DEVELOPMENT ? "dist-dev" : "dist";
const releaseChannel =
  requestedProfile === BUILD_PROFILES.DEVELOPMENT ? "dev" : "prod";

await runNodeScript("scripts/build.mjs", `--profile=${requestedProfile}`);
await fs.rm(path.resolve(root, "release", releaseChannel), {
  recursive: true,
  force: true
});

await buildElectron({
  targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
  config: {
    appId: profileConfig.identity.appId,
    productName: profileConfig.identity.productName,
    artifactName: "${productName}-${version}-${arch}-setup.${ext}",
    files: [
      {
        from: sourceDirectory,
        to: "dist",
        filter: ["**/*"]
      },
      {
        from: "electron",
        to: "electron",
        filter: ["**/*"]
      },
      "package.json"
    ],
    asarUnpack: [`${sourceDirectory}/map-resources/**`],
    extraResources: [],
    directories: {
      buildResources: "build",
      output: path.join("release", releaseChannel)
    },
    icon: "build/icon.png",
    win: {
      icon: "build/icon.png",
      target: "nsis",
      signAndEditExecutable: false
    }
  }
});

console.log(`Packaged ${profileConfig.identity.productName} in release/${releaseChannel}/.`);

function runNodeScript(scriptPath, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(root, scriptPath), ...args], {
      cwd: root,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptPath} exited with code ${code ?? "unknown"}.`));
    });
  });
}
