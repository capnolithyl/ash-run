import Phaser from "phaser";

/**
 * This layer gives the title screen an animated tactical mood
 * without mixing the actual menu UI into Phaser.
 */
export class MenuBackdropLayer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.scanLine = scene.add.rectangle(0, 0, 0, 2, 0xff5fd6, 0.18).setOrigin(0, 0);
  }

  render(width, height, time) {
    this.graphics.clear();
    this.graphics.fillGradientStyle(0x090212, 0x090212, 0x180827, 0x180827, 1);
    this.graphics.fillRect(0, 0, width, height);

    this.graphics.lineStyle(1, 0x5f2bd8, 0.35);

    for (let x = 0; x < width; x += 48) {
      this.graphics.lineBetween(x, 0, x, height);
    }

    for (let y = 0; y < height; y += 48) {
      this.graphics.lineBetween(0, y, width, y);
    }

    const pulse = 0.5 + Math.sin(time / 800) * 0.15;
    this.graphics.fillStyle(0xff8a3d, pulse);
    this.graphics.fillCircle(width * 0.72, height * 0.26, 110);
    this.graphics.fillStyle(0xff4fd8, 0.24);
    this.graphics.fillCircle(width * 0.69, height * 0.24, 150);
    this.graphics.fillStyle(0x10071c, 0.9);
    this.graphics.fillCircle(width * 0.75, height * 0.28, 140);

    this.scanLine
      .setPosition(0, (time / 18) % height)
      .setSize(width, 2);
  }
}
