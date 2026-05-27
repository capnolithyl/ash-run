import path from "node:path";

/**
 * Vite only needs a thin config for this prototype.
 * The renderer stays framework-free and all game code ships as ES modules.
 */
export default {
  root: process.cwd(),
  assetsInclude: ["**/*.cur", "**/*.ani"],
  define: {
    __ASH_RUN_84_PHASER_RENDERER__: JSON.stringify(process.env.ASH_RUN_84_PHASER_RENDERER ?? "")
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(process.cwd(), "dist"),
    emptyOutDir: true,
    sourcemap: true
  }
};
