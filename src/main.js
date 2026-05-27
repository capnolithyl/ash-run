import "./styles/main.css";
import { GameController } from "./game/app/GameController.js";
import { createGame } from "./game/phaser/createGame.js";
import { AppShell } from "./ui/AppShell.js";

const runtimeConfig = {
  ...(globalThis.__ASH_RUN_RUNTIME__ ?? {}),
  ...(window.ashRun84Api?.getRuntimeConfig?.() ?? {})
};

if (typeof __ASH_RUN_84_PHASER_RENDERER__ === "string" && __ASH_RUN_84_PHASER_RENDERER__) {
  runtimeConfig.phaserRenderer ??= __ASH_RUN_84_PHASER_RENDERER__;
}

globalThis.__ASH_RUN_RUNTIME__ = runtimeConfig;

const gameRoot = document.getElementById("game-root");
const uiRoot = document.getElementById("ui-root");

const controller = new GameController();
new AppShell(uiRoot, controller);
const game = createGame(gameRoot, controller);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__ASH_RUN_DEV__ = {
    controller,
    game,
    runtimeConfig
  };
}
