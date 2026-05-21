import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { BattleScene } from "./scenes/BattleScene.js";
import { ShellScene } from "./scenes/ShellScene.js";

function shouldUseCanvasRenderer() {
  if (typeof navigator === "undefined") {
    return false;
  }

  // Electron's Chromium WebGL path is currently dropping the renderer during
  // Phaser texture boot on Windows, while the Canvas renderer remains stable.
  return /Electron/i.test(navigator.userAgent);
}

/**
 * Phaser renders the animated backdrop and the tactical battlefield.
 * Dense controls and menus stay in the DOM for clarity.
 */
export function createGame(parent, controller) {
  const game = new Phaser.Game({
    type: shouldUseCanvasRenderer() ? Phaser.CANVAS : Phaser.AUTO,
    parent,
    backgroundColor: "#091210",
    render: {
      pixelArt: true,
      roundPixels: true
    },
    callbacks: {
      /**
       * Scenes need the controller during their own `create()` lifecycle.
       * Registering it here avoids a timing race during game boot.
       */
      preBoot(bootedGame) {
        bootedGame.registry.set("controller", controller);
      }
    },
    input: {
      gamepad: true
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight
    },
    scene: [BootScene, ShellScene, BattleScene]
  });

  return game;
}
