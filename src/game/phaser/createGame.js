import Phaser from "phaser";
import { BattleScene } from "./scenes/BattleScene.js";
import { ShellScene } from "./scenes/ShellScene.js";

/**
 * Phaser renders the animated backdrop and the tactical battlefield.
 * Dense controls and menus stay in the DOM for clarity.
 */
export function createGame(parent, controller) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
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
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight
    },
    scene: [ShellScene, BattleScene]
  });

  return game;
}
