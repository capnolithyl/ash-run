import Phaser from "phaser";
import { MAP_THEME_PALETTES, TERRAIN_LIBRARY } from "../../content/terrain.js";
import { BATTLEFIELD_ASSET_IDS, getBattlefieldAssetKey, getTerrainSpriteDefinition } from "../assets.js";

function getTerrainFrameIndices(scene, animationSpec) {
  const texture = scene.textures.get(animationSpec?.key);

  if (!texture) {
    return [];
  }

  return texture
    .getFrameNames()
    .filter((frameName) => frameName !== "__BASE")
    .map((frameName) => Number(frameName))
    .filter((frameName) => Number.isInteger(frameName))
    .sort((left, right) => left - right);
}

function frameHasVisiblePixels(scene, animationSpec, frameName) {
  for (let y = 0; y < animationSpec.frameHeight; y += 1) {
    for (let x = 0; x < animationSpec.frameWidth; x += 1) {
      const alpha = typeof scene.textures.getPixelAlpha === "function"
        ? scene.textures.getPixelAlpha(x, y, animationSpec.key, frameName)
        : scene.textures.getPixel(x, y, animationSpec.key, frameName)?.alpha ?? 0;

      if (alpha > 0) {
        return true;
      }
    }
  }

  return false;
}

function getTerrainPlayableFrames(scene, animationSpec) {
  const frameIndices = getTerrainFrameIndices(scene, animationSpec);
  let lastVisibleFrameIndex = -1;

  for (const frameName of frameIndices) {
    if (frameHasVisiblePixels(scene, animationSpec, frameName)) {
      lastVisibleFrameIndex = frameName;
    }
  }

  return lastVisibleFrameIndex >= 0
    ? frameIndices.filter((frameName) => frameName <= lastVisibleFrameIndex)
    : [];
}

function ensureTerrainAnimation(scene, animationSpec) {
  if (!animationSpec?.key || !scene.textures.exists(animationSpec.key)) {
    return null;
  }

  const animationKey = `${animationSpec.animationKey}:loop`;

  if (!scene.anims.exists(animationKey)) {
    const frames = getTerrainPlayableFrames(scene, animationSpec);

    if (frames.length <= 1) {
      return null;
    }

    scene.anims.create({
      key: animationKey,
      frames: frames.map((frame) => ({
        key: animationSpec.key,
        frame
      })),
      frameRate: animationSpec.frameRate,
      yoyo: true,
      repeat: -1
    });
  }

  return animationKey;
}

export class GridLayer {
  constructor(scene) {
    this.scene = scene;
    this.backgroundImage = null;
    this.glowGraphics = scene.add.graphics();
    this.glowGraphics.setBlendMode(Phaser.BlendModes.ADD);
    this.glowGraphics.setDepth(0);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(1);
    this.overlayGraphics = scene.add.graphics();
    this.overlayGraphics.setDepth(6);
    this.terrainSprites = [];
    this.terrainRenderKey = null;
  }

  clear() {
    if (this.backgroundImage) {
      this.backgroundImage.setVisible(false);
    }
    this.glowGraphics.clear();
    this.graphics.clear();
    this.overlayGraphics.clear();
    this.clearTerrainSprites();
  }

  ensureBackgroundImage() {
    if (this.backgroundImage) {
      return this.backgroundImage;
    }

    const textureKey = getBattlefieldAssetKey(BATTLEFIELD_ASSET_IDS.BACKGROUND);

    if (!textureKey || !this.scene.textures.exists(textureKey)) {
      return null;
    }

    this.backgroundImage = this.scene.add
      .image(this.scene.scale.width / 2, this.scene.scale.height / 2, textureKey)
      .setDepth(-2)
      .setScrollFactor(0)
      .setVisible(false);

    return this.backgroundImage;
  }

  clearTerrainSprites() {
    this.terrainSprites.forEach((sprite) => sprite.destroy());
    this.terrainSprites = [];
    this.terrainRenderKey = null;
  }

  getTerrainRenderKey(snapshot, layout) {
    const tileSignature = snapshot.map.tiles.map((row) => row.join(",")).join("|");
    return [
      snapshot.map.id,
      layout.cellSize,
      layout.originX,
      layout.originY,
      tileSignature
    ].join(":");
  }

  renderTerrainSprites(snapshot, layout) {
    const renderKey = this.getTerrainRenderKey(snapshot, layout);

    if (renderKey === this.terrainRenderKey) {
      return;
    }

    this.clearTerrainSprites();

    for (let row = 0; row < snapshot.map.height; row += 1) {
      for (let column = 0; column < snapshot.map.width; column += 1) {
        const terrainId = snapshot.map.tiles[row][column];
        const terrainSprite = getTerrainSpriteDefinition(terrainId);
        const animatedTextureKey = terrainSprite?.animated?.key ?? null;
        const fallbackTextureKey = terrainSprite?.fallbackKey ?? null;
        const textureKey =
          (animatedTextureKey && this.scene.textures.exists(animatedTextureKey) && animatedTextureKey) ||
          (fallbackTextureKey && this.scene.textures.exists(fallbackTextureKey) && fallbackTextureKey) ||
          null;
        const x = layout.originX + column * layout.cellSize;
        const y = layout.originY + row * layout.cellSize;

        if (!textureKey) {
          const terrain = TERRAIN_LIBRARY[terrainId];
          this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(terrain.color).color, 0.96);
          this.graphics.fillRect(x, y, layout.cellSize, layout.cellSize);
          continue;
        }

        const sprite = this.scene.add
          .sprite(x + layout.cellSize / 2, y + layout.cellSize / 2, textureKey)
          .setDepth(4)
          .setDisplaySize(layout.cellSize, layout.cellSize);

        if (terrainSprite?.animated?.key === textureKey) {
          const animationKey = ensureTerrainAnimation(this.scene, terrainSprite.animated);

          if (animationKey) {
            sprite.play(animationKey);
          } else {
            sprite.setFrame(0);
          }
        }

        this.terrainSprites.push(sprite);
      }
    }

    this.terrainRenderKey = renderKey;
  }

  render(snapshot, layout, options = {}) {
    const theme = MAP_THEME_PALETTES[snapshot.map.theme];
    const useBattlefieldBackdrop = options.useBattlefieldBackdrop === true;
    const backgroundImage = this.ensureBackgroundImage();
    const boardLeft = layout.originX;
    const boardTop = layout.originY;
    const boardWidth = snapshot.map.width * layout.cellSize;
    const boardHeight = snapshot.map.height * layout.cellSize;
    const borderInset = useBattlefieldBackdrop ? 12 : 10;
    const frameLeft = boardLeft - borderInset;
    const frameTop = boardTop - borderInset;
    const frameWidth = boardWidth + borderInset * 2;
    const frameHeight = boardHeight + borderInset * 2;
    const frameRadius = 18;
    const accentColor = useBattlefieldBackdrop ? 0xff4fd8 : 0x9f61ff;
    const secondaryAccentColor = 0xffa65b;
    this.glowGraphics.clear();
    this.graphics.clear();
    this.overlayGraphics.clear();

    if (backgroundImage) {
      backgroundImage
        .setVisible(useBattlefieldBackdrop)
        .setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2)
        .setDisplaySize(this.scene.scale.width, this.scene.scale.height);
    }

    this.graphics.fillStyle(
      Phaser.Display.Color.HexStringToColor(theme.background).color,
      useBattlefieldBackdrop ? 0.38 : 0.92
    );
    this.graphics.fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    this.graphics.fillStyle(0x12061f, 0.66);
    this.graphics.fillRect(0, this.scene.scale.height * 0.82, this.scene.scale.width, this.scene.scale.height * 0.18);
    this.glowGraphics.fillStyle(0xff4fd8, 0.035);
    this.glowGraphics.fillRoundedRect(
      boardLeft - 18,
      boardTop - 18,
      boardWidth + 36,
      boardHeight + 36,
      24
    );
    this.glowGraphics.lineStyle(4, accentColor, useBattlefieldBackdrop ? 0.08 : 0.06);
    this.glowGraphics.strokeRoundedRect(
      frameLeft - 6,
      frameTop - 6,
      frameWidth + 12,
      frameHeight + 12,
      frameRadius + 4
    );

    this.renderTerrainSprites(snapshot, layout);

    this.overlayGraphics.lineStyle(3, accentColor, useBattlefieldBackdrop ? 0.26 : 0.2);
    this.overlayGraphics.strokeRoundedRect(
      frameLeft,
      frameTop,
      frameWidth,
      frameHeight,
      frameRadius
    );
    this.overlayGraphics.lineStyle(1.5, secondaryAccentColor, useBattlefieldBackdrop ? 0.34 : 0.24);
    this.overlayGraphics.strokeRoundedRect(
      frameLeft + 4,
      frameTop + 4,
      frameWidth - 8,
      frameHeight - 8,
      frameRadius - 4
    );
    this.overlayGraphics.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(theme.gridGlow).color, 0.28);
    this.overlayGraphics.strokeRoundedRect(frameLeft + 8, frameTop + 8, frameWidth - 16, frameHeight - 16, 12);

    const cornerLength = Math.max(18, Math.round(layout.cellSize * 0.75));
    const outerLeft = frameLeft + 6;
    const outerRight = frameLeft + frameWidth - 6;
    const outerTop = frameTop + 6;
    const outerBottom = frameTop + frameHeight - 6;

    this.overlayGraphics.lineStyle(4, secondaryAccentColor, useBattlefieldBackdrop ? 0.32 : 0.24);
    this.overlayGraphics.beginPath();
    this.overlayGraphics.moveTo(outerLeft, outerTop + cornerLength);
    this.overlayGraphics.lineTo(outerLeft, outerTop);
    this.overlayGraphics.lineTo(outerLeft + cornerLength, outerTop);

    this.overlayGraphics.moveTo(outerRight - cornerLength, outerTop);
    this.overlayGraphics.lineTo(outerRight, outerTop);
    this.overlayGraphics.lineTo(outerRight, outerTop + cornerLength);

    this.overlayGraphics.moveTo(outerLeft, outerBottom - cornerLength);
    this.overlayGraphics.lineTo(outerLeft, outerBottom);
    this.overlayGraphics.lineTo(outerLeft + cornerLength, outerBottom);

    this.overlayGraphics.moveTo(outerRight - cornerLength, outerBottom);
    this.overlayGraphics.lineTo(outerRight, outerBottom);
    this.overlayGraphics.lineTo(outerRight, outerBottom - cornerLength);
    this.overlayGraphics.strokePath();

    for (let row = 0; row < snapshot.map.height; row += 1) {
      for (let column = 0; column < snapshot.map.width; column += 1) {
        const terrain = TERRAIN_LIBRARY[snapshot.map.tiles[row][column]];
        const x = layout.originX + column * layout.cellSize;
        const y = layout.originY + row * layout.cellSize;

        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(terrain.color).color, 0.96);
        this.graphics.fillRect(x, y, layout.cellSize, layout.cellSize);
      }
    }
  }
}
