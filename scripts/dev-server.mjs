import { createServer } from "vite";
import { generateBuildingSpriteManifest } from "./generate-building-sprite-manifest.mjs";
import { generateMapManifest } from "./generate-map-manifest.shared.mjs";
import { generateTerrainSpriteManifest } from "./generate-terrain-sprite-manifest.mjs";
import { generateUnitSpriteSheetManifest } from "./generate-sprite-sheet-manifest.mjs";

const root = process.cwd();
const port = Number(process.env.ASH_RUN_84_DEV_PORT ?? 5173);

await generateBuildingSpriteManifest({ root });
await generateMapManifest({ root });
await generateTerrainSpriteManifest({ root });
await generateUnitSpriteSheetManifest({ root });

const server = await createServer({
  configFile: false,
  root,
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true
  }
});

await server.listen();
server.printUrls();

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
