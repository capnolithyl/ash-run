import Phaser from "phaser";
import {
  getSplashAssetKey,
  preloadMusicAssets,
  preloadSplashAssets,
  preloadSpriteAssets,
  SPLASH_ASSET_IDS
} from "../assets.js";

const SPLASH_SCREEN_MIN_MS = 4000;
const SPLASH_FADE_MS = 260;
const STAR_SEED = [
  { x: 0.1, y: 0.12, radius: 1.4, alpha: 0.75 },
  { x: 0.18, y: 0.2, radius: 1.1, alpha: 0.58 },
  { x: 0.26, y: 0.11, radius: 1.7, alpha: 0.68 },
  { x: 0.36, y: 0.18, radius: 1.2, alpha: 0.52 },
  { x: 0.49, y: 0.1, radius: 1.3, alpha: 0.72 },
  { x: 0.62, y: 0.15, radius: 1.6, alpha: 0.62 },
  { x: 0.74, y: 0.09, radius: 1.4, alpha: 0.77 },
  { x: 0.85, y: 0.17, radius: 1.2, alpha: 0.54 },
  { x: 0.92, y: 0.11, radius: 1.8, alpha: 0.71 },
  { x: 0.14, y: 0.3, radius: 1.1, alpha: 0.42 },
  { x: 0.31, y: 0.27, radius: 1.4, alpha: 0.46 },
  { x: 0.54, y: 0.24, radius: 1.2, alpha: 0.49 },
  { x: 0.69, y: 0.29, radius: 1.5, alpha: 0.43 },
  { x: 0.88, y: 0.26, radius: 1.1, alpha: 0.45 }
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    preloadSplashAssets(this);
  }

  async create() {
    this.controller = this.game.registry.get("controller");
    this.cameras.main.setBackgroundColor("#06020f");

    this.backdropGraphics = this.add.graphics();
    this.horizonGlow = this.add.ellipse(0, 0, 0, 0, 0xff8a3d, 0.2);
    this.orbOne = this.add.ellipse(0, 0, 0, 0, 0xb56cff, 0.16);
    this.orbTwo = this.add.ellipse(0, 0, 0, 0, 0x6ef3ff, 0.14);
    this.logoHalo = this.add.ellipse(0, 0, 0, 0, 0xffb66d, 0.18);
    this.logoImage = this.add.image(0, 0, getSplashAssetKey(SPLASH_ASSET_IDS.STUDIO_LOGO));
    this.logoContainer = this.add.container(0, 0, [this.logoHalo, this.logoImage]);
    this.logoContainer.setAlpha(0);
    this.statusText = this.add.text(0, 0, "Initializing command uplink", {
      fontFamily: "Verdana",
      fontSize: "14px",
      color: "#d9d6eb",
      align: "center",
      letterSpacing: 4
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setAlpha(0.72);
    this.statusRule = this.add.rectangle(0, 0, 0, 1, 0xffffff, 0.12);
    this.statusRule.setOrigin(0.5);

    this.scale.on("resize", this.handleResize, this);
    this.handleResize(this.scale.gameSize);
    this.startAmbientMotion();

    const loadingPromise = this.loadRemainingAssets();
    await this.showSplashScreen(SPLASH_ASSET_IDS.STUDIO_LOGO);
    await this.showSplashScreen(SPLASH_ASSET_IDS.GAME_LOGO, {
      waitForLoad: true,
      loadingPromise
    });

    this.scene.start("ShellScene");
    await this.controller?.initialize?.();
  }

  handleResize(gameSize) {
    const width = gameSize?.width ?? this.scale.width;
    const height = gameSize?.height ?? this.scale.height;

    this.drawBackdrop(width, height);
    this.horizonGlow.setPosition(width * 0.5, height * 0.78);
    this.horizonGlow.setSize(width * 0.84, height * 0.34);
    this.orbOne.setPosition(width * 0.2, height * 0.28);
    this.orbOne.setSize(width * 0.24, width * 0.24);
    this.orbTwo.setPosition(width * 0.82, height * 0.22);
    this.orbTwo.setSize(width * 0.18, width * 0.18);
    this.logoContainer.setPosition(width * 0.5, height * 0.45);
    this.statusText.setPosition(width * 0.5, height * 0.83);
    this.statusRule.setPosition(width * 0.5, height * 0.79);
    this.statusRule.width = Math.min(width * 0.32, 300);
    this.fitLogoToViewport();
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
    this.logoHalo.setSize(
      Math.max(260, textureFrame.width * scale + 110),
      Math.max(150, textureFrame.height * scale + 80)
    );
  }

  loadRemainingAssets() {
    preloadMusicAssets(this);
    preloadSpriteAssets(this);

    const queuedAssetCount = this.load.list?.size ?? 0;

    if (queuedAssetCount === 0) {
      this.setLoadingStatus("Systems online");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const handleProgress = (value) => {
        this.setLoadingStatus(this.getStatusCopy(value));
      };

      const handleComplete = () => {
        this.load.off("progress", handleProgress);
        this.load.off("loaderror", handleError);
        this.setLoadingStatus("Systems online");
        resolve();
      };

      const handleError = (file) => {
        this.load.off("progress", handleProgress);
        this.load.off("complete", handleComplete);
        reject(new Error(`Failed to load boot asset: ${file?.src ?? file?.key ?? "unknown asset"}`));
      };

      this.load.on("progress", handleProgress);
      this.load.once("complete", handleComplete);
      this.load.once("loaderror", handleError);
      this.load.start();
    });
  }

  getStatusCopy(progress) {
    const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);

    if (clampedProgress < 0.3) {
      return "Linking command uplink";
    }

    if (clampedProgress < 0.7) {
      return "Loading battlefield assets";
    }

    return "Stabilizing tactical feed";
  }

  setLoadingStatus(text) {
    this.statusText.setText(text.toUpperCase());
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
        onComplete: () => resolve()
      });
    });
  }

  drawBackdrop(width, height) {
    const graphics = this.backdropGraphics;
    const horizonY = height * 0.64;

    graphics.clear();
    graphics.fillGradientStyle(0x05020c, 0x11061e, 0x35163d, 0x120615, 1, 1, 1, 1);
    graphics.fillRect(0, 0, width, height);

    graphics.fillStyle(0xff7a4f, 0.11);
    graphics.fillEllipse(width * 0.5, horizonY, width * 0.96, height * 0.34);

    graphics.fillStyle(0x3f1f6a, 0.28);
    graphics.fillEllipse(width * 0.5, height * 0.22, width * 0.86, height * 0.36);

    graphics.fillStyle(0x05050a, 0.9);
    graphics.beginPath();
    graphics.moveTo(0, height);
    graphics.lineTo(0, horizonY);
    graphics.lineTo(width * 0.12, horizonY - height * 0.02);
    graphics.lineTo(width * 0.24, horizonY + height * 0.03);
    graphics.lineTo(width * 0.38, horizonY - height * 0.05);
    graphics.lineTo(width * 0.53, horizonY + height * 0.01);
    graphics.lineTo(width * 0.68, horizonY - height * 0.045);
    graphics.lineTo(width * 0.82, horizonY + height * 0.025);
    graphics.lineTo(width, horizonY - height * 0.01);
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(1, 0xffa658, 0.12);
    for (let i = 0; i < 9; i += 1) {
      const lineY = horizonY + i * (height * 0.032);
      graphics.lineBetween(width * 0.18, lineY, width * 0.82, lineY);
    }

    graphics.lineStyle(1, 0xb25cff, 0.08);
    for (let i = -6; i <= 6; i += 1) {
      const baseX = width * 0.5 + i * (width * 0.045);
      graphics.lineBetween(baseX, horizonY, width * 0.5 + i * (width * 0.11), height);
    }

    for (const star of STAR_SEED) {
      graphics.fillStyle(0xf4e9ff, star.alpha);
      graphics.fillCircle(width * star.x, height * star.y, star.radius);
    }

    graphics.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.28, 0.38);
    graphics.fillRect(0, 0, width, height);
  }

  startAmbientMotion() {
    this.tweens.add({
      targets: this.orbOne,
      x: this.orbOne.x + 18,
      y: this.orbOne.y - 10,
      alpha: 0.22,
      duration: 4200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });

    this.tweens.add({
      targets: this.orbTwo,
      x: this.orbTwo.x - 16,
      y: this.orbTwo.y + 8,
      alpha: 0.18,
      duration: 4800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });

    this.tweens.add({
      targets: this.logoHalo,
      alpha: 0.26,
      scaleX: 1.04,
      scaleY: 1.06,
      duration: 2100,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });

    this.tweens.add({
      targets: this.statusText,
      alpha: 0.9,
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
  }

  waitForDuration(durationMs) {
    return new Promise((resolve) => {
      this.time.delayedCall(durationMs, () => resolve());
    });
  }
}
