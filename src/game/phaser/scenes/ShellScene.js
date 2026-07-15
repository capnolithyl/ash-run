import Phaser from "phaser";
import { SCREEN_IDS } from "../../core/constants.js";
import { GameAudioDirector } from "../audio/GameAudioDirector.js";
import { MenuBackdropLayer } from "../view/MenuBackdropLayer.js";

export class ShellScene extends Phaser.Scene {
  constructor() {
    super("ShellScene");
    this.latestState = null;
    this.showBackdrop = true;
  }

  create() {
    this.backdropLayer = new MenuBackdropLayer(this);
    this.backdropLayer.render(this.scale.width, this.scale.height);
    this.controller = this.game.registry.get("controller");
    this.audioDirector = new GameAudioDirector(this, this.controller);
    this.musicDirector = this.audioDirector.musicDirector;
    this.game.registry.set("audioDirector", this.audioDirector);
    this.events.once("shutdown", this.handleShutdown, this);
    this.events.once("destroy", this.handleShutdown, this);

    if (!this.scene.isActive("BattleScene")) {
      this.scene.launch("BattleScene");
      this.scene.bringToTop("BattleScene");
    }

    if (!this.controller) {
      return;
    }

    this.latestState = this.controller.getState();
    this.updateBackdropVisibility();
    this.audioDirector.sync(this.latestState);
    this.unsubscribe = this.controller.subscribe((state) => {
      this.latestState = state;
      this.updateBackdropVisibility();
      this.audioDirector.sync(state);
    });
  }

  handleShutdown() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.audioDirector?.destroy();

    if (this.game.registry.get("audioDirector") === this.audioDirector) {
      this.game.registry.remove("audioDirector");
    }

    this.audioDirector = null;
    this.musicDirector = null;
  }

  updateBackdropVisibility() {
    this.showBackdrop = this.latestState?.screen !== SCREEN_IDS.BATTLE;
    this.backdropLayer.setVisible(this.showBackdrop);
  }

  update(time) {
    if (!this.showBackdrop) {
      return;
    }

    this.backdropLayer.render(this.scale.width, this.scale.height, time);
  }
}
