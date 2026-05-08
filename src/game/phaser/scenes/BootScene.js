import Phaser from "phaser";
import {
  getSplashAssetKey,
  preloadMusicAssets,
  preloadSplashAssets,
  preloadSpriteAssets,
  SPLASH_ASSET_IDS,
} from "../assets.js";

const SPLASH_SCREEN_MIN_MS = 4000;
const SPLASH_FADE_MS = 260;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    preloadSplashAssets(this);
  }

  async create() {
    this.controller = this.game.registry.get("controller");
    this.cameras.main.setBackgroundColor("#000000");

    this.splashBackground = this.add.image(
      0,
      0,
      getSplashAssetKey(SPLASH_ASSET_IDS.BACKGROUND),
    );
    this.splashBackground.setOrigin(0.5);

    this.logoImage = this.add.image(
      0,
      0,
      getSplashAssetKey(SPLASH_ASSET_IDS.STUDIO_LOGO),
    );
    this.logoContainer = this.add.container(0, 0, [this.logoImage]);
    this.logoContainer.setAlpha(0);

    this.scale.on("resize", this.handleResize, this);
    this.handleResize(this.scale.gameSize);

    const loadingPromise = this.loadRemainingAssets();
    await this.showSplashScreen(SPLASH_ASSET_IDS.STUDIO_LOGO);
    await this.showSplashScreen(SPLASH_ASSET_IDS.GAME_LOGO, {
      waitForLoad: true,
      loadingPromise,
    });

    this.scene.start("ShellScene");
    await this.controller?.initialize?.();
  }

  handleResize(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;

    this.splashBackground.setPosition(width * 0.5, height * 0.5);
    this.logoContainer.setPosition(width * 0.5, height * 0.45);
    this.fitBackgroundToViewport();
    this.fitLogoToViewport();
  }

  fitBackgroundToViewport() {
    const width = this.scale.width;
    const height = this.scale.height;
    const textureFrame = this.splashBackground.texture?.getSourceImage?.();

    if (!textureFrame?.width || !textureFrame?.height) {
      return;
    }

    const scale = Math.max(width / textureFrame.width, height / textureFrame.height);
    this.splashBackground.setScale(scale);
  }

  fitLogoToViewport() {
    const width = this.scale.width;
    const height = this.scale.height;
    const textureFrame = this.logoImage.texture?.getSourceImage?.();

    if (!textureFrame?.width || !textureFrame?.height) {
      return;
    }

    const maxWidth = width * 0.58;
    const maxHeight = height * 0.36;
    const scale = Math.min(maxWidth / textureFrame.width, maxHeight / textureFrame.height, 1);

    this.logoImage.setScale(scale);
  }

  loadRemainingAssets() {
    preloadMusicAssets(this);
    preloadSpriteAssets(this);

    const queuedAssetCount = this.load.list?.size ?? 0;

    if (queuedAssetCount === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const handleComplete = () => {
        this.load.off("loaderror", handleError);
        resolve();
      };

      const handleError = (file) => {
        this.load.off("complete", handleComplete);
        reject(new Error(`Failed to load boot asset: ${file?.src ?? file?.key ?? "unknown asset"}`));
      };

      this.load.once("complete", handleComplete);
      this.load.once("loaderror", handleError);
      this.load.start();
    });
  }

  async showSplashScreen(assetId, options = {}) {
    const { waitForLoad = false, loadingPromise = null } = options;
    const startedAt = performance.now();
    const textureKey = getSplashAssetKey(assetId);

    this.logoImage.setTexture(textureKey);
    this.fitLogoToViewport();

    await this.fadeLogoTo(1);
    await this.waitForDuration(SPLASH_SCREEN_MIN_MS);

    if (waitForLoad && loadingPromise) {
      await loadingPromise;
    } else {
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs < SPLASH_SCREEN_MIN_MS) {
        await this.waitForDuration(SPLASH_SCREEN_MIN_MS - elapsedMs);
      }
    }

    await this.fadeLogoTo(0);
  }

  fadeLogoTo(alpha) {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: this.logoContainer,
        alpha,
        duration: SPLASH_FADE_MS,
        ease: "Sine.easeInOut",
        onComplete: () => resolve(),
      });
    });
  }

  waitForDuration(durationMs) {
    return new Promise((resolve) => {
      this.time.delayedCall(durationMs, () => resolve());
    });
  }
}
