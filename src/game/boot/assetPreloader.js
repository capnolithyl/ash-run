export const BOOT_FONT_DESCRIPTORS = [
  "400 16px Oxanium",
  "500 16px Oxanium",
  "600 16px Oxanium",
  "700 16px Oxanium",
  "800 16px Oxanium",
  "600 16px Orbitron",
  "700 16px Orbitron",
  "800 16px Orbitron",
];

const DEFAULT_PRELOAD_CONCURRENCY = 8;
const DEFAULT_AUDIO_TIMEOUT_MS = 10000;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export async function preloadAssetManifest(assetManifest = [], options = {}) {
  const environment = options.environment ?? getDefaultPreloadEnvironment();
  const assets = assetManifest
    .map(normalizePreloadAssetEntry)
    .filter(Boolean)
    .filter((asset) => matchesAssetPreloadEnvironment(asset, environment));
  const totalBytes = assets.reduce((sum, asset) => sum + getAssetProgressWeight(asset), 0);
  const progressState = {
    loaded: 0,
    total: assets.length,
    loadedBytes: 0,
    totalBytes,
    progress: assets.length === 0 ? 1 : 0,
  };

  emitAssetPreloadProgress(options.onProgress, progressState);

  if (assets.length === 0) {
    return {
      total: 0,
      loaded: 0,
      failures: [],
    };
  }

  const loaders = options.loaders ?? createDefaultAssetPreloadLoaders(options);
  const logger = options.logger ?? console;
  const failures = [];
  const concurrency = clampPositiveInteger(
    options.concurrency,
    DEFAULT_PRELOAD_CONCURRENCY,
    assets.length,
  );
  let nextAssetIndex = 0;

  async function runWorker() {
    while (nextAssetIndex < assets.length) {
      const asset = assets[nextAssetIndex];
      nextAssetIndex += 1;

      try {
        await preloadAsset(asset, loaders);
      } catch (error) {
        failures.push({ asset, error });
        logger?.warn?.(
          `[boot] Optional asset preload failed: ${asset.url}`,
          error,
        );
      } finally {
        progressState.loaded += 1;
        progressState.loadedBytes += getAssetProgressWeight(asset);
        progressState.progress = progressState.totalBytes > 0
          ? progressState.loadedBytes / progressState.totalBytes
          : progressState.loaded / progressState.total;
        emitAssetPreloadProgress(options.onProgress, progressState);
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => runWorker()),
  );

  progressState.progress = 1;
  progressState.loadedBytes = totalBytes;
  emitAssetPreloadProgress(options.onProgress, progressState);

  return {
    total: assets.length,
    loaded: assets.length,
    failures,
  };
}

export async function waitForBootFonts(options = {}) {
  const fontFaceSet = options.fontFaceSet ?? getDocumentFontFaceSet();

  if (!fontFaceSet?.load) {
    return [];
  }

  const descriptors = options.descriptors ?? BOOT_FONT_DESCRIPTORS;
  const loadResults = await Promise.allSettled(
    descriptors.map((descriptor) => fontFaceSet.load(descriptor)),
  );

  if (fontFaceSet.ready) {
    await Promise.resolve(fontFaceSet.ready).catch(() => null);
  }

  return loadResults;
}

export function createDefaultAssetPreloadLoaders(options = {}) {
  return {
    audio: (asset) => preloadAudioAsset(asset, options),
    cursor: (asset) => preloadCursorAsset(asset, options),
    font: (asset) => preloadFontAsset(asset, options),
    image: (asset) => preloadImageAsset(asset, options),
    script: (asset) => preloadScriptAsset(asset, options),
    style: (asset) => preloadStyleAsset(asset, options),
    file: (asset) => preloadFetchAsset(asset, options),
  };
}

export function normalizePreloadAssetEntry(asset) {
  if (!asset?.url || !asset?.kind) {
    return null;
  }

  return {
    url: String(asset.url),
    kind: String(asset.kind),
    byteSize: Number.isFinite(Number(asset.byteSize))
      ? Math.max(0, Number(asset.byteSize))
      : 0,
    environment: asset.environment ? String(asset.environment) : "all",
  };
}

function preloadAsset(asset, loaders) {
  const loader = loaders[asset.kind] ?? loaders.file;

  if (!loader) {
    return Promise.resolve();
  }

  return loader(asset);
}

function emitAssetPreloadProgress(onProgress, progressState) {
  onProgress?.({
    loaded: progressState.loaded,
    total: progressState.total,
    loadedBytes: progressState.loadedBytes,
    totalBytes: progressState.totalBytes,
    progress: Math.max(0, Math.min(1, progressState.progress)),
  });
}

function preloadImageAsset(asset, options) {
  const ImageCtor = options.ImageCtor ?? globalThis.Image;

  if (!ImageCtor) {
    return preloadFetchAsset(asset, options);
  }

  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    const url = resolveAssetUrl(asset.url, options.baseUrl);
    let settled = false;

    const settle = (handler) => {
      if (settled) {
        return;
      }

      settled = true;
      image.onload = null;
      image.onerror = null;
      handler();
    };

    image.onload = () => {
      settle(() => {
        if (typeof image.decode === "function") {
          Promise.resolve(image.decode()).catch(() => null).then(resolve);
          return;
        }

        resolve();
      });
    };
    image.onerror = () => {
      settle(() => reject(new Error(`Image failed to preload: ${asset.url}`)));
    };

    image.decoding = "async";
    image.loading = "eager";
    image.src = url;

    if (image.complete && image.naturalWidth !== 0) {
      image.onload();
    }
  });
}

function preloadAudioAsset(asset, options) {
  const AudioCtor = options.AudioCtor ?? globalThis.Audio;

  if (!AudioCtor) {
    return preloadFetchAsset(asset, options);
  }

  return new Promise((resolve, reject) => {
    const audio = new AudioCtor();
    const url = resolveAssetUrl(asset.url, options.baseUrl);
    const timeoutMs = options.audioTimeoutMs ?? DEFAULT_AUDIO_TIMEOUT_MS;
    let settled = false;
    const timeout = setTimeout(() => {
      settle(() => reject(new Error(`Audio preload timed out: ${asset.url}`)));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      audio.removeEventListener?.("canplay", handleReady);
      audio.removeEventListener?.("canplaythrough", handleReady);
      audio.removeEventListener?.("loadeddata", handleReady);
      audio.removeEventListener?.("error", handleError);
    };
    const settle = (handler) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      handler();
    };
    function handleReady() {
      settle(resolve);
    }
    function handleError() {
      settle(() => reject(new Error(`Audio failed to preload: ${asset.url}`)));
    }

    audio.preload = "auto";
    audio.addEventListener?.("canplay", handleReady, { once: true });
    audio.addEventListener?.("canplaythrough", handleReady, { once: true });
    audio.addEventListener?.("loadeddata", handleReady, { once: true });
    audio.addEventListener?.("error", handleError, { once: true });
    audio.src = url;
    audio.load?.();
  });
}

async function preloadFontAsset(asset, options) {
  const FontFaceCtor = options.FontFaceCtor ?? globalThis.FontFace;
  const fontFaceSet = options.fontFaceSet ?? getDocumentFontFaceSet();

  if (!FontFaceCtor) {
    return preloadFetchAsset(asset, options);
  }

  const fontFamily = createPreloadFontFamily(asset.url);
  const source = `url("${resolveAssetUrl(asset.url, options.baseUrl).replaceAll('"', "%22")}")`;
  const fontFace = new FontFaceCtor(fontFamily, source);
  const loadedFace = await fontFace.load();

  fontFaceSet?.add?.(loadedFace);
}

function preloadCursorAsset(asset, options) {
  const url = resolveAssetUrl(asset.url, options.baseUrl);

  if (url.startsWith("file:")) {
    return Promise.resolve();
  }

  return preloadFetchAsset(asset, options);
}

function preloadScriptAsset(asset, options) {
  return preloadLinkedAsset(asset, {
    rel: "modulepreload",
    as: null,
  }, options);
}

function preloadStyleAsset(asset, options) {
  return preloadLinkedAsset(asset, {
    rel: "preload",
    as: "style",
  }, options);
}

function preloadLinkedAsset(asset, linkOptions, options) {
  if (typeof document === "undefined" || !document.head) {
    return preloadFetchAsset(asset, options);
  }

  const url = resolveAssetUrl(asset.url, options.baseUrl);
  const existingLink = document.head.querySelector(
    `link[rel="${linkOptions.rel}"][href="${cssEscapeAttribute(url)}"]`,
  );

  if (existingLink) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    let settled = false;
    const settle = (handler) => {
      if (settled) {
        return;
      }

      settled = true;
      link.onload = null;
      link.onerror = null;
      handler();
    };

    link.rel = linkOptions.rel;
    if (linkOptions.as) {
      link.as = linkOptions.as;
    }
    link.href = url;
    link.onload = () => settle(resolve);
    link.onerror = () =>
      settle(() => reject(new Error(`Linked asset failed to preload: ${asset.url}`)));
    document.head.append(link);
  });
}

async function preloadFetchAsset(asset, options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  if (!fetchImpl) {
    return;
  }

  const url = resolveAssetUrl(asset.url, options.baseUrl);
  const timeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      cache: "force-cache",
      signal: controller?.signal,
    });

    if (!response?.ok) {
      throw new Error(`Request failed with status ${response?.status ?? "unknown"}`);
    }

    await response.arrayBuffer?.();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function matchesAssetPreloadEnvironment(asset, environment) {
  return asset.environment === "all" || asset.environment === environment;
}

function getAssetProgressWeight(asset) {
  return asset.byteSize > 0 ? asset.byteSize : 1;
}

function clampPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return Math.max(1, Math.min(fallback, maximum));
  }

  return Math.max(1, Math.min(parsed, maximum));
}

function createPreloadFontFamily(url) {
  return `AshRunPreload-${url.replace(/[^a-z0-9]+/gi, "-")}`;
}

function resolveAssetUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl ?? getDocumentBaseUrl()).href;
  } catch {
    return url;
  }
}

function getDefaultPreloadEnvironment() {
  return import.meta.env?.DEV === true ? "development" : "production";
}

function getDocumentBaseUrl() {
  if (typeof document !== "undefined" && document.baseURI) {
    return document.baseURI;
  }

  if (typeof location !== "undefined" && location.href) {
    return location.href;
  }

  return undefined;
}

function cssEscapeAttribute(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function getDocumentFontFaceSet() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.fonts ?? null;
}
