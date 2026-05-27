import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { BattleScene } from "./scenes/BattleScene.js";
import { ShellScene } from "./scenes/ShellScene.js";
import {
  canUseBuiltinPhaserFx,
  getActualPhaserRendererMode,
  getRequestedPhaserRendererMode,
  resolvePhaserRendererPreference
} from "./rendererConfig.js";

/**
 * Phaser renders the animated backdrop and the tactical battlefield.
 * Dense controls and menus stay in the DOM for clarity.
 */
export function createGame(parent, controller) {
  const rendererPreference = resolvePhaserRendererPreference({
    requestedMode: getRequestedPhaserRendererMode()
  });
  const game = new Phaser.Game({
    type: rendererPreference.phaserType,
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
        bootedGame.registry.set("phaserRendererPreference", rendererPreference);
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

  const actualRendererMode = getActualPhaserRendererMode(game);
  const builtinFxEnabled = canUseBuiltinPhaserFx(game);
  game.registry.set("phaserRendererInfo", {
    ...rendererPreference,
    actualMode: actualRendererMode,
    builtinFxEnabled
  });
  console.info(
    `[Ash Run] Phaser renderer requested=${rendererPreference.requestedMode} ` +
      `source=${rendererPreference.source} actual=${actualRendererMode} ` +
      `builtinFx=${builtinFxEnabled ? "enabled" : "disabled"}`
  );

  return game;
}
