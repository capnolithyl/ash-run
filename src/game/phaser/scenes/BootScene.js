import Phaser from "phaser";
import { preloadAssetManifest, waitForBootFonts } from "../../boot/assetPreloader.js";
import { ASSET_PRELOAD_MANIFEST } from "../generated/assetPreloadManifest.js";
import {
  getSplashAssetKey,
  preloadAudioAssets,
  preloadSplashAssets,
  preloadSpriteAssets,
  SPLASH_ASSET_IDS,
  warnSfxOnce,
} from "../assets.js";

const SPLASH_SCREEN_MIN_MS = 4000;
const SPLASH_FADE_MS = 260;
const BOOT_PROGRESS_WEIGHTS = {
  phaser: 0.35,
  folder: 0.55,
  fonts: 0.1,
};
const BOOT_ASSET_LOGGER = {
  warn(message, error) {
    if (String(message).includes("/audio/sfx/")) {
      return;
    }

    console.warn(message, error);
  },
};

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
    this.bootProgress = {
      phaser: 0,
      folder: 0,
      fonts: 0,
    };
    this.displayedBootProgress = 0;
    this.bootProgressComplete = false;
    this.createProgressBar();

    this.scale.on("resize", this.handleResize, this);
    this.handleResize(this.scale.gameSize);

    const loadingPromise = this.startBootPreloading();
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
    this.layoutProgressBar();
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
    this.layoutProgressBar();
  }

  createProgressBar() {
    this.progressTrack = this.add
      .rectangle(0, 0, 1, 1, 0x10051f, 0.72)
      .setOrigin(0, 0.5);
    this.progressFill = this.add
      .rectangle(0, 0, 1, 1, 0xff8a3d, 0.95)
      .setOrigin(0, 0.5);
    this.progressGlow = this.add
      .rectangle(0, 0, 1, 1, 0xff4fd8, 0.34)
      .setOrigin(0, 0.5);
    this.progressBorder = this.add
      .rectangle(0, 0, 1, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x7fd8ff, 0.72);
    this.progressContainer = this.add.container(0, 0, [
      this.progressTrack,
      this.progressGlow,
      this.progressFill,
      this.progressBorder,
    ]);
    this.logoContainer.add(this.progressContainer);
  }

  layoutProgressBar() {
    if (!this.progressContainer || !this.logoImage) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const textureFrame = this.logoImage.texture?.getSourceImage?.();
    const logoHeight = textureFrame?.height
      ? textureFrame.height * this.logoImage.scaleY
      : height * 0.22;
    const barWidth = Phaser.Math.Clamp(width * 0.34, 220, 440);
    const barHeight = Phaser.Math.Clamp(height * 0.009, 6, 9);
    const y = logoHeight * 0.5 + Phaser.Math.Clamp(height * 0.034, 22, 36);

    this.progressBarWidth = barWidth;
    this.progressBarHeight = barHeight;
    this.progressTrack.setPosition(-barWidth * 0.5, y);
    this.progressTrack.setSize(barWidth, barHeight);
    this.progressGlow.setPosition(-barWidth * 0.5, y);
    this.progressGlow.setSize(barWidth, barHeight * 2.2);
    this.progressBorder.setPosition(-barWidth * 0.5, y);
    this.progressBorder.setSize(barWidth, barHeight);
    this.updateProgressBarFill();
  }

  startBootPreloading() {
    const phaserLoadPromise = this.loadRemainingAssets((progress) => {
      this.updateBootProgress("phaser", progress);
    });
    const folderLoadPromise = preloadAssetManifest(ASSET_PRELOAD_MANIFEST, {
      onProgress: ({ progress }) => this.updateBootProgress("folder", progress),
      logger: BOOT_ASSET_LOGGER,
    });
    const fontLoadPromise = waitForBootFonts()
      .then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            console.warn("[boot] Optional font preload failed", result.reason);
          }
        }
      })
      .catch((error) => {
        console.warn("[boot] Optional font preload failed", error);
      })
      .finally(() => {
        this.updateBootProgress("fonts", 1);
      });

    return Promise.all([
      phaserLoadPromise,
      folderLoadPromise,
      fontLoadPromise,
    ]).then(() => {
      this.bootProgressComplete = true;
      this.updateDisplayedBootProgress(1);
    });
  }

  updateBootProgress(part, progress) {
    const currentProgress = this.bootProgress[part] ?? 0;
    this.bootProgress[part] = Math.max(
      currentProgress,
      Phaser.Math.Clamp(progress, 0, 1),
    );

    const weightedProgress = Object.entries(BOOT_PROGRESS_WEIGHTS)
      .reduce(
        (sum, [progressPart, weight]) =>
          sum + (this.bootProgress[progressPart] ?? 0) * weight,
        0,
      );
    this.updateDisplayedBootProgress(
      this.bootProgressComplete ? 1 : Math.min(weightedProgress, 0.985),
    );
  }

  updateDisplayedBootProgress(progress) {
    this.displayedBootProgress = Math.max(
      this.displayedBootProgress ?? 0,
      Phaser.Math.Clamp(progress, 0, 1),
    );
    this.updateProgressBarFill();
  }

  updateProgressBarFill() {
    if (!this.progressFill || !this.progressGlow) {
      return;
    }

    const barWidth = this.progressBarWidth ?? 1;
    const barHeight = this.progressBarHeight ?? 8;
    const fillWidth = Math.max(1, barWidth * (this.displayedBootProgress ?? 0));

    this.progressFill.setPosition(-barWidth * 0.5, this.progressTrack.y);
    this.progressFill.setSize(fillWidth, barHeight);
    this.progressGlow.setPosition(-barWidth * 0.5, this.progressTrack.y);
    this.progressGlow.setSize(fillWidth, barHeight * 2.2);
  }

  loadRemainingAssets(onProgress = null) {
    preloadAudioAssets(this);
    preloadSpriteAssets(this);

    const queuedAssetCount = this.load.list?.size ?? 0;

    if (queuedAssetCount === 0) {
      onProgress?.(1);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.load.off("progress", handleProgress);
        this.load.off("complete", handleComplete);
        this.load.off("loaderror", handleError);
      };
      const handleProgress = (progress) => {
        onProgress?.(progress);
      };
      const handleComplete = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        onProgress?.(1);
        resolve();
      };

      const handleError = (file) => {
        const key = String(file?.key ?? "");
        if (key.startsWith("sfx:")) {
          warnSfxOnce(key, `Optional sound asset failed to load: ${file?.src ?? key}`);
          return;
        }

        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(`Failed to load boot asset: ${file?.src ?? file?.key ?? "unknown asset"}`));
      };

      this.load.on("progress", handleProgress);
      this.load.once("complete", handleComplete);
      this.load.on("loaderror", handleError);
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
