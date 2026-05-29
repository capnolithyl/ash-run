import fs from "node:fs/promises";
import path from "node:path";

async function collectJsonMapFiles(rootDirectory, currentDirectory = rootDirectory) {
  const directoryEntries = await fs.readdir(currentDirectory, { withFileTypes: true });
  const mapFiles = [];

  for (const entry of directoryEntries) {
    const entryPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      mapFiles.push(...(await collectJsonMapFiles(rootDirectory, entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      mapFiles.push(path.relative(rootDirectory, entryPath).replace(/\\/g, "/"));
    }
  }

  return mapFiles.sort((left, right) => left.localeCompare(right));
}

export async function generateMapManifest({ root = process.cwd() } = {}) {
  const mapsDir = path.resolve(root, "src/game/content/maps");
  const outputPath = path.resolve(root, "src/game/content/maps.generated.js");
  const mapFiles = await collectJsonMapFiles(mapsDir);

  const mapEntries = [];

  for (const relativePath of mapFiles) {
    const filePath = path.join(mapsDir, relativePath);
    const fileContents = await fs.readFile(filePath, "utf8");
    const mapData = JSON.parse(fileContents);
    mapEntries.push([`./maps/${relativePath}`, mapData]);
  }

  const output = `export const GENERATED_MAP_MODULES = ${JSON.stringify(
    Object.fromEntries(mapEntries),
    null,
    2
  )};\n`;

  await fs.writeFile(outputPath, output, "utf8");
}
