const fs = require("node:fs/promises");
const path = require("node:path");

const MAP_BUNDLE_FORMAT = "ash-run-map-bundle-v1";

function normalizeMapFileName(fileName) {
  const baseName = path.basename(String(fileName ?? "").trim() || "custom-map.json");

  return baseName.toLowerCase().endsWith(".json") ? baseName : `${baseName}.json`;
}

function parseMapRelativePathSpecifier(filePath) {
  const rawPath = String(filePath ?? "").trim().replace(/\\/g, "/");
  const [pathPart, queryPart = ""] = rawPath.split("?");
  const params = new URLSearchParams(queryPart);
  const stage = Number(params.get("stage"));

  return {
    pathPart,
    stage: Number.isInteger(stage) && stage > 0 ? stage : null
  };
}

function normalizeMapRelativePath(filePath) {
  const { pathPart } = parseMapRelativePathSpecifier(filePath);
  const rawPath = pathPart;
  const rawSegments = rawPath.split("/").filter(Boolean);
  const safeSegments = rawSegments
    .slice(0, -1)
    .map((segment) => path.basename(segment).trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const fileName = normalizeMapFileName(rawSegments.at(-1) ?? "custom-map.json");

  return path.join(...safeSegments, fileName);
}

function toMapStageRelativePath(relativePath, stage) {
  return Number.isInteger(stage) && stage > 0
    ? `${toPortableRelativePath(relativePath)}?stage=${stage}`
    : toPortableRelativePath(relativePath);
}

function toPortableRelativePath(filePath) {
  return String(filePath ?? "").replace(/\\/g, "/");
}

function normalizeStageNumber(value) {
  const stage = Number(value);
  return Number.isInteger(stage) && stage > 0 ? stage : null;
}

function getMapStage(parsedMap, fallbackStage = null) {
  const runStage = Array.isArray(parsedMap?.runStages)
    ? parsedMap.runStages.map(normalizeStageNumber).find(Boolean)
    : null;

  return (
    normalizeStageNumber(parsedMap?.stage)
    ?? normalizeStageNumber(parsedMap?.variantStage)
    ?? runStage
    ?? normalizeStageNumber(fallbackStage)
    ?? null
  );
}

function isMapBundle(parsedMap) {
  return Boolean(
    parsedMap &&
    typeof parsedMap === "object" &&
    parsedMap.format === MAP_BUNDLE_FORMAT &&
    Array.isArray(parsedMap.stages)
  );
}

function getBundleStageMaps(parsedMap) {
  if (!isMapBundle(parsedMap)) {
    return [{ map: parsedMap, stage: getMapStage(parsedMap) }];
  }

  return parsedMap.stages.map((stageMap, index) => {
    const stage = getMapStage(stageMap, index + 1) ?? index + 1;

    return {
      map: {
        ...stageMap,
        name: stageMap.name ?? parsedMap.name,
        theme: stageMap.theme ?? parsedMap.theme,
        stage,
        variantStage: stage,
        runStages: [stage]
      },
      stage
    };
  });
}

function getBundledMapsRoot(baseDirectory = __dirname) {
  return path.resolve(baseDirectory, "../src/game/content/maps");
}

function getPackagedMapsRoot(resourcesPath) {
  return path.resolve(String(resourcesPath ?? ""), "maps");
}

function resolvePreferredMapRoot({
  isPackaged = false,
  customMapsRoot,
  bundledMapsRoot = getBundledMapsRoot(),
  packagedMapsRoot = null
}) {
  if (isPackaged) {
    return packagedMapsRoot || customMapsRoot;
  }

  return bundledMapsRoot;
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

function buildMapFileMetadata(filePath, parsedMap, stats = null, rootDirectory = null, options = {}) {
  const baseRelativePath = rootDirectory
    ? toPortableRelativePath(path.relative(rootDirectory, filePath))
    : path.basename(filePath);
  const stage = getMapStage(parsedMap, options.stage);
  const relativePath = options.bundleStage
    ? toMapStageRelativePath(baseRelativePath, stage)
    : baseRelativePath;

  return {
    relativePath,
    sourceRelativePath: baseRelativePath,
    fileName: path.basename(filePath),
    id: typeof parsedMap?.id === "string" ? parsedMap.id : "",
    name: typeof parsedMap?.name === "string" ? parsedMap.name : path.basename(filePath, ".json"),
    stage,
    bundleStage: options.bundleStage ? stage : null,
    variantStage: stage ?? (Number.isInteger(parsedMap?.variantStage) ? parsedMap.variantStage : null),
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

function buildMapFileMetadataEntries(filePath, parsedMap, stats = null, rootDirectory = null) {
  if (!isMapBundle(parsedMap)) {
    return [buildMapFileMetadata(filePath, parsedMap, stats, rootDirectory)];
  }

  return getBundleStageMaps(parsedMap).map(({ map, stage }) =>
    buildMapFileMetadata(filePath, map, stats, rootDirectory, {
      bundleStage: true,
      stage
    })
  );
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

      entries.push(...buildMapFileMetadataEntries(filePath, parsedMap, stats, rootDirectory));
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
  const requestedPath = parseMapRelativePathSpecifier(relativePath);
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

  const metadataMap = isMapBundle(parsedMap)
    ? getBundleStageMaps(parsedMap).find(({ stage }) => stage === requestedPath.stage)?.map
      ?? getBundleStageMaps(parsedMap)[0]?.map
    : parsedMap;
  const metadataStage = getMapStage(metadataMap, requestedPath.stage);

  return {
    filePath: targetPath,
    text,
    metadata: buildMapFileMetadata(targetPath, metadataMap, stats, rootDirectory, {
      bundleStage: isMapBundle(parsedMap),
      stage: metadataStage
    })
  };
}

module.exports = {
  buildMapFileMetadata,
  getBundledMapsRoot,
  getPackagedMapsRoot,
  listLoadableMapFiles,
  loadMapFileFromRoot,
  normalizeMapRelativePath,
  resolvePreferredMapRoot,
  toPortableRelativePath
};
