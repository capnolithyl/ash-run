import fs from "node:fs/promises";
import path from "node:path";

export async function generateMapManifest({ root = process.cwd() } = {}) {
  const mapsDir = path.resolve(root, "src/game/content/maps");
  const outputPath = path.resolve(root, "src/game/content/maps.generated.js");

  const directoryEntries = await fs.readdir(mapsDir, { withFileTypes: true });
  const mapFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const mapEntries = [];

  for (const fileName of mapFiles) {
    const filePath = path.join(mapsDir, fileName);
    const fileContents = await fs.readFile(filePath, "utf8");
    const mapData = JSON.parse(fileContents);
    mapEntries.push([`./maps/${fileName}`, mapData]);
  }

  const output = `export const GENERATED_MAP_MODULES = ${JSON.stringify(
    Object.fromEntries(mapEntries),
    null,
    2
  )};\n`;

  await fs.writeFile(outputPath, output, "utf8");
}
