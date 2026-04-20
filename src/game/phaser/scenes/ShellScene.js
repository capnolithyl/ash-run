import Phaser from "phaser";
import { MenuBackdropLayer } from "../view/MenuBackdropLayer.js";

export class ShellScene extends Phaser.Scene {
  constructor() {
    super("ShellScene");
    this.latestState = null;
    this.showBackdrop = true;
  }

  create() {
    this.backdropLayer = new MenuBackdropLayer(this);
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
    this.unsubscribe = this.controller.subscribe((state) => {
      this.latestState = state;
      this.updateBackdropVisibility();
    });
  }

  updateBackdropVisibility() {
    this.showBackdrop = this.latestState?.screen !== "battle";
    this.backdropLayer.graphics.setVisible(this.showBackdrop);
    this.backdropLayer.scanLine.setVisible(this.showBackdrop);
  }

  update(time) {
    if (!this.showBackdrop) {
      return;
    }

    this.backdropLayer.render(this.scale.width, this.scale.height, time);
  }
}
