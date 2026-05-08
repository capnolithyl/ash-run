import Phaser from "phaser";
import { SCREEN_IDS } from "../../core/constants.js";
import { MusicDirector } from "../audio/MusicDirector.js";
import { preloadMusicAssets } from "../assets.js";
import { MenuBackdropLayer } from "../view/MenuBackdropLayer.js";

export class ShellScene extends Phaser.Scene {
  constructor() {
    super("ShellScene");
    this.latestState = null;
    this.showBackdrop = true;
  }

  preload() {
    preloadMusicAssets(this);
  }

  create() {
    this.backdropLayer = new MenuBackdropLayer(this);
    this.backdropLayer.render(this.scale.width, this.scale.height);
    this.musicDirector = new MusicDirector(this);
    this.controller = this.game.registry.get("controller");

    if (!this.scene.isActive("BattleScene")) {
      this.scene.launch("BattleScene");
      this.scene.bringToTop("BattleScene");
    }

    if (!this.controller) {
      return;
    }

    this.latestState = this.controller.getState();
    this.updateBackdropVisibility();
    this.musicDirector.sync(this.latestState);
    this.unsubscribe = this.controller.subscribe((state) => {
      this.latestState = state;
      this.updateBackdropVisibility();
      this.musicDirector.sync(state);
    });
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
