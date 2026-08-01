import path from "node:path";

const buildProfile = process.env.ASH_RUN_84_BUILD_PROFILE ?? "development";

/**
 * Vite only needs a thin config for this prototype.
 * The renderer stays framework-free and all game code ships as ES modules.
 */
export default {
  root: process.cwd(),
  define: {
    __ASH_RUN_BUILD_PROFILE__: JSON.stringify(buildProfile)
  },
  assetsInclude: ["**/*.cur", "**/*.ani"],
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
