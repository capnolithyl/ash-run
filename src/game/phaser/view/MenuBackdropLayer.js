import { getSplashAssetKey, SPLASH_ASSET_IDS } from "../assets.js";

export class MenuBackdropLayer {
  constructor(scene) {
    this.scene = scene;
    this.image = scene.add
      .image(0, 0, getSplashAssetKey(SPLASH_ASSET_IDS.BACKGROUND))
      .setOrigin(0.5)
      .setScrollFactor(0);
  }

  setVisible(isVisible) {
    this.image.setVisible(isVisible);
  }

  render(width, height) {
    const textureFrame = this.image.texture?.getSourceImage?.();

    this.image.setPosition(width * 0.5, height * 0.5);

    if (!textureFrame?.width || !textureFrame?.height) {
      return;
    }

    const scale = Math.max(width / textureFrame.width, height / textureFrame.height);
    this.image.setScale(scale);
  }
}
