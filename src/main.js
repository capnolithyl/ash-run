import "./styles/main.css";
import packageMetadata from "../package.json";
import { GameController } from "./game/app/GameController.js";
import { createGame, refreshGameRenderer } from "./game/phaser/createGame.js";
import { AppShell } from "./ui/AppShell.js";

const gameRoot = document.getElementById("game-root");
const uiRoot = document.getElementById("ui-root");
const windowChromeRoot = document.getElementById("window-chrome-root");
const buildRevision =
  typeof __ASH_RUN_BUILD_REVISION__ === "string" ? __ASH_RUN_BUILD_REVISION__ : "";
const buildVersion =
  typeof __ASH_RUN_BUILD_VERSION__ === "string" && __ASH_RUN_BUILD_VERSION__
    ? __ASH_RUN_BUILD_VERSION__
    : packageMetadata.version;
const versionText = `v${buildVersion}${buildRevision ? ` · ${buildRevision}` : ""}`;

const versionLabel = document.createElement("span");
versionLabel.className = "app-version";
versionLabel.textContent = versionText;
versionLabel.setAttribute(
  "aria-label",
  `Ash Run version ${buildVersion}${buildRevision ? ` build ${buildRevision}` : ""}`
);
document.body.append(versionLabel);

const controller = new GameController();
new AppShell(uiRoot, controller, { windowChromeRoot });
const game = createGame(gameRoot, controller);

let rendererRecoveryScheduled = false;

function recoverRendererAfterFocus() {
  if (document.hidden || rendererRecoveryScheduled) {
    return;
  }

  rendererRecoveryScheduled = true;
  queueMicrotask(() => {
    rendererRecoveryScheduled = false;

    if (document.hidden) {
      return;
    }

    refreshGameRenderer(game, gameRoot, { clearHover: true });
    window.requestAnimationFrame(() => {
      if (!document.hidden) {
        refreshGameRenderer(game, gameRoot, { clearHover: true });
      }
    });
  });
}

document.addEventListener("visibilitychange", recoverRendererAfterFocus);
window.addEventListener("focus", recoverRendererAfterFocus);
window.addEventListener("pageshow", recoverRendererAfterFocus);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__ASH_RUN_DEV__ = {
    controller,
    game
  };
}
