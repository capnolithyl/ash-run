import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const spriteRoot = path.resolve(root, "assets/sprites");

const PALETTES = {
  player: ["#12071d", "#34204c", "#7040a6", "#b65cff", "#efd8ff"],
  enemy: ["#1d0d07", "#4d2110", "#9a431f", "#ff8a3d", "#ffd1a8"],
  neutral: ["#15121b", "#4a4153", "#84704f", "#d8b65d", "#fff0b0"]
};

const GROUPS = [
  {
    name: "units",
    variants: ["player", "enemy"]
  },
  {
    name: "buildings",
    variants: ["player", "enemy", "neutral"]
  }
];

function hexToRgb(hex) {
  const value = hex.replace("#", "");

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mapFillToPalette(hex, palette) {
  const luminance = getLuminance(hex);

  if (luminance < 35) {
    return palette[0];
  }

  if (luminance < 80) {
    return palette[1];
  }

  if (luminance < 130) {
    return palette[2];
  }

  if (luminance < 190) {
    return palette[3];
  }

  return palette[4];
}

function colorizeSvg(svg, variant) {
  const palette = PALETTES[variant];

  return svg.replace(/fill="#([0-9a-fA-F]{6})"/g, (_match, rawHex) => {
    const hex = `#${rawHex}`;
    return `fill="${mapFillToPalette(hex, palette)}"`;
  });
}

async function getSourceSvgFiles(groupRoot) {
  const entries = await fs.readdir(groupRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => entry.name)
    .sort();
}

for (const group of GROUPS) {
  const groupRoot = path.join(spriteRoot, group.name);
  const sourceFiles = await getSourceSvgFiles(groupRoot);

  for (const variant of group.variants) {
    const variantRoot = path.join(groupRoot, variant);
    await fs.mkdir(variantRoot, { recursive: true });

    for (const fileName of sourceFiles) {
      const sourcePath = path.join(groupRoot, fileName);
      const targetPath = path.join(variantRoot, fileName);
      const source = await fs.readFile(sourcePath, "utf8");
      await fs.writeFile(targetPath, colorizeSvg(source, variant), "utf8");
    }
  }
}
