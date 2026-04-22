import { createServer } from "vite";
import { generateUnitSpriteSheetManifest } from "./generate-sprite-sheet-manifest.mjs";

const root = process.cwd();
const port = Number(process.env.ASH_RUN_84_DEV_PORT ?? 5173);

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
