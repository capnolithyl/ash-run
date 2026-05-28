import "./styles/main.css";
import { GameController } from "./game/app/GameController.js";
import { createGame } from "./game/phaser/createGame.js";
import { AppShell } from "./ui/AppShell.js";

const gameRoot = document.getElementById("game-root");
const uiRoot = document.getElementById("ui-root");
const windowChromeRoot = document.getElementById("window-chrome-root");

const controller = new GameController();
new AppShell(uiRoot, controller, { windowChromeRoot });
const game = createGame(gameRoot, controller);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__ASH_RUN_DEV__ = {
    controller,
    game
  };
}
