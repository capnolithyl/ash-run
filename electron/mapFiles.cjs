const fs = require("node:fs/promises");
const path = require("node:path");

function normalizeMapFileName(fileName) {
  const baseName = path.basename(String(fileName ?? "").trim() || "custom-map.json");

  return baseName.toLowerCase().endsWith(".json") ? baseName : `${baseName}.json`;
}

function normalizeMapRelativePath(filePath) {
  const rawPath = String(filePath ?? "").trim().replace(/\\/g, "/");
  const rawSegments = rawPath.split("/").filter(Boolean);
  const safeSegments = rawSegments
    .slice(0, -1)
    .map((segment) => path.basename(segment).trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const fileName = normalizeMapFileName(rawSegments.at(-1) ?? "custom-map.json");

  return path.join(...safeSegments, fileName);
}

function toPortableRelativePath(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

function getBundledMapsRoot(baseDirectory = __dirname) {
  return path.resolve(baseDirectory, "../src/game/content/maps");
}

function resolvePreferredMapRoot({
  isPackaged = false,
  customMapsRoot,
  bundledMapsRoot = getBundledMapsRoot()
}) {
  return isPackaged ? customMapsRoot : bundledMapsRoot;
}

async function collectJsonFiles(rootDirectory, fsImpl = fs) {
  const directoryEntries = await fsImpl.readdir(rootDirectory, { withFileTypes: true });
  const filePaths = [];

  for (const entry of directoryEntries) {
    const entryPath = path.join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await collectJsonFiles(entryPath, fsImpl)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function buildMapFileMetadata(filePath, parsedMap, stats = null, rootDirectory = null) {
  const relativePath = rootDirectory
    ? toPortableRelativePath(path.relative(rootDirectory, filePath))
    : path.basename(filePath);

  return {
    relativePath,
    fileName: path.basename(filePath),
    id: typeof parsedMap?.id === "string" ? parsedMap.id : "",
    name: typeof parsedMap?.name === "string" ? parsedMap.name : path.basename(filePath, ".json"),
    variantStage: Number.isInteger(parsedMap?.variantStage) ? parsedMap.variantStage : null,
    runStages: Array.isArray(parsedMap?.runStages) ? parsedMap.runStages : [],
    width: Number.isInteger(parsedMap?.width) ? parsedMap.width : null,
    height: Number.isInteger(parsedMap?.height) ? parsedMap.height : null,
    goal: parsedMap?.goal ?? null,
    previewMap: {
      width: Number.isInteger(parsedMap?.width) ? parsedMap.width : 0,
      height: Number.isInteger(parsedMap?.height) ? parsedMap.height : 0,
      tiles: Array.isArray(parsedMap?.tiles) ? parsedMap.tiles : [],
      buildings: Array.isArray(parsedMap?.buildings) ? parsedMap.buildings : [],
      goal: parsedMap?.goal ?? null
    },
    modifiedAt: stats?.mtime?.toISOString?.() ?? null
  };
}

async function listLoadableMapFiles(rootDirectory, fsImpl = fs, logger = console) {
  await fsImpl.mkdir(rootDirectory, { recursive: true });
  const filePaths = await collectJsonFiles(rootDirectory, fsImpl);
  const entries = [];

  for (const filePath of filePaths) {
    try {
      const [text, stats] = await Promise.all([
        fsImpl.readFile(filePath, "utf8"),
        fsImpl.stat(filePath)
      ]);
      const parsedMap = JSON.parse(text);

      if (!parsedMap || typeof parsedMap !== "object") {
        throw new Error("Map file must contain a JSON object.");
      }

      entries.push(buildMapFileMetadata(filePath, parsedMap, stats, rootDirectory));
    } catch (error) {
      logger?.warn?.(`Skipping invalid map file: ${filePath}`, error);
    }
  }

  entries.sort((left, right) => {
    const leftName = String(left.name ?? "");
    const rightName = String(right.name ?? "");
    const byName = leftName.localeCompare(rightName);

    return byName !== 0
      ? byName
      : String(left.relativePath ?? "").localeCompare(String(right.relativePath ?? ""));
  });

  return {
    rootPath: rootDirectory,
    entries
  };
}

async function loadMapFileFromRoot(rootDirectory, relativePath, fsImpl = fs) {
  await fsImpl.mkdir(rootDirectory, { recursive: true });
  const normalizedRelativePath = normalizeMapRelativePath(relativePath);
  const targetPath = path.resolve(rootDirectory, normalizedRelativePath);
  const relativeFromRoot = path.relative(rootDirectory, targetPath);

  if (
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    throw new Error("Map path is outside the game map folder.");
  }

  const [text, stats] = await Promise.all([
    fsImpl.readFile(targetPath, "utf8"),
    fsImpl.stat(targetPath)
  ]);
  const parsedMap = JSON.parse(text);

  if (!parsedMap || typeof parsedMap !== "object") {
    throw new Error("Map file must contain a JSON object.");
  }

  return {
    filePath: targetPath,
    text,
    metadata: buildMapFileMetadata(targetPath, parsedMap, stats, rootDirectory)
  };
}

module.exports = {
  buildMapFileMetadata,
  getBundledMapsRoot,
  listLoadableMapFiles,
  loadMapFileFromRoot,
  normalizeMapRelativePath,
  resolvePreferredMapRoot,
  toPortableRelativePath
};
