import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { generateAssetPreloadManifest } from "./generate-asset-preload-manifest.mjs";
import { generateBuildingSpriteManifest } from "./generate-building-sprite-manifest.mjs";
import { generateMapManifest } from "./generate-map-manifest.shared.mjs";
import { generateTerrainSpriteManifest } from "./generate-terrain-sprite-manifest.mjs";
import { generateUnitSpriteSheetManifest } from "./generate-sprite-sheet-manifest.mjs";
import {
  BUILD_PROFILES,
  getBuildProfileConfig
} from "../src/game/core/buildProfiles.js";

const root = process.cwd();
const packageMetadata = JSON.parse(
  await fs.readFile(path.resolve(root, "package.json"), "utf8")
);
const requestedProfile =
  process.argv.find((argument) => argument.startsWith("--profile="))?.split("=")[1] ??
  BUILD_PROFILES.PRODUCTION;

if (!Object.values(BUILD_PROFILES).includes(requestedProfile)) {
  throw new Error(
    `Unsupported build profile: ${requestedProfile}. Expected development or production.`
  );
}

const buildProfileConfig = getBuildProfileConfig(requestedProfile);
const distDirectoryName =
  requestedProfile === BUILD_PROFILES.DEVELOPMENT ? "dist-dev" : "dist";
const distRoot = path.resolve(root, distDirectoryName);
const assetsRoot = path.join(distRoot, "assets");
const releaseVersion = packageMetadata.version ?? "dev";
const sourceRevision = (process.env.GITHUB_SHA ?? "").slice(0, 12);
const assetCacheToken = encodeURIComponent(sourceRevision || releaseVersion);

/**
 * Production builds use esbuild directly because it handles the current
 * network-share environment more reliably than Vite's HTML pipeline here.
 */
await fs.rm(distRoot, { recursive: true, force: true });
await fs.mkdir(assetsRoot, { recursive: true });
await generateAssetPreloadManifest({ root });
await generateBuildingSpriteManifest({ root });
await generateMapManifest({ root });
await generateTerrainSpriteManifest({ root });
await generateUnitSpriteSheetManifest({ root });

await build({
  entryPoints: [path.resolve(root, "src/main.js")],
  outdir: assetsRoot,
  entryNames: "main",
  assetNames: "static/[name]-[hash]",
  bundle: true,
  format: "esm",
  minify: false,
  platform: "browser",
  sourcemap: true,
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "__ASH_RUN_BUILD_PROFILE__": JSON.stringify(requestedProfile)
  },
  loader: {
    ".ani": "file",
    ".css": "css",
    ".cur": "file",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".gif": "file",
    ".svg": "file",
    ".webp": "file",
    ".ttf": "file",
    ".woff": "file",
    ".woff2": "file"
  }
});

const indexTemplate = await fs.readFile(path.resolve(root, "index.html"), "utf8");
const productionHtml = indexTemplate
  .replace(
    "</head>",
    `    <link rel="stylesheet" href="./assets/main.css?v=${assetCacheToken}" />\n  </head>`
  )
  .replace('./src/main.js', `./assets/main.js?v=${assetCacheToken}`);

await fs.writeFile(path.join(distRoot, "index.html"), productionHtml, "utf8");
await fs.writeFile(
  path.join(distRoot, "build-profile.json"),
  `${JSON.stringify(buildProfileConfig, null, 2)}\n`,
  "utf8"
);

await fs.cp(path.resolve(root, "assets/sprites"), path.join(assetsRoot, "sprites"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/audio"), path.join(assetsRoot, "audio"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/img"), path.join(assetsRoot, "img"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/fonts"), path.join(assetsRoot, "fonts"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/cursor"), path.join(assetsRoot, "cursor"), {
  recursive: true
});

await fs.cp(
  path.resolve(root, "src/game/content/maps"),
  path.join(distRoot, "map-resources"),
  { recursive: true }
);

console.log(
  `Built ${buildProfileConfig.identity.productName} v${releaseVersion} (${requestedProfile}) in ${distDirectoryName}/ with cache token ${assetCacheToken}.`
);
