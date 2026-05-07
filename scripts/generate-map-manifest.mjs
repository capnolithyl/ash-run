import path from "node:path";
import { generateMapManifest } from "./generate-map-manifest.shared.mjs";

const root = process.cwd();

await generateMapManifest({ root });
console.log(`generated ${path.relative(root, path.resolve(root, "src/game/content/maps.generated.js"))}`);
