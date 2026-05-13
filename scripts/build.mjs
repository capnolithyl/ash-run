import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { generateBuildingSpriteManifest } from "./generate-building-sprite-manifest.mjs";
import { generateMapManifest } from "./generate-map-manifest.shared.mjs";
import { generateTerrainSpriteManifest } from "./generate-terrain-sprite-manifest.mjs";
import { generateUnitSpriteSheetManifest } from "./generate-sprite-sheet-manifest.mjs";

const root = process.cwd();
const distRoot = path.resolve(root, "dist");
const assetsRoot = path.join(distRoot, "assets");

/**
 * Production builds use esbuild directly because it handles the current
 * network-share environment more reliably than Vite's HTML pipeline here.
 */
await fs.rm(distRoot, { recursive: true, force: true });
await fs.mkdir(assetsRoot, { recursive: true });
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
  .replace("</head>", '    <link rel="stylesheet" href="./assets/main.css" />\n  </head>')
  .replace('./src/main.js', "./assets/main.js");

await fs.writeFile(path.join(distRoot, "index.html"), productionHtml, "utf8");

await fs.cp(path.resolve(root, "assets/sprites"), path.join(assetsRoot, "sprites"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/audio"), path.join(assetsRoot, "audio"), {
  recursive: true
});

await fs.cp(path.resolve(root, "assets/img"), path.join(assetsRoot, "img"), {
  recursive: true
});
