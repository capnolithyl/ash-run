const GRAYSCALE_TEXTURE_SUFFIX = ":spent-grayscale";

export function getGrayscaleTextureKey(sourceTextureKey) {
  return `${sourceTextureKey}${GRAYSCALE_TEXTURE_SUFFIX}`;
}

export function applyLuminanceGrayscale(imageData) {
  const pixels = imageData?.data;

  if (!pixels) {
    return imageData;
  }

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(
      pixels[index] * 0.2126 +
      pixels[index + 1] * 0.7152 +
      pixels[index + 2] * 0.0722,
    );
    pixels[index] = luminance;
    pixels[index + 1] = luminance;
    pixels[index + 2] = luminance;
  }

  return imageData;
}

export function copyTextureFrames(sourceTexture, targetTexture) {
  for (const frameName of sourceTexture.getFrameNames?.() ?? []) {
    const frame = sourceTexture.get(frameName);

    if (!frame || frame.sourceIndex !== 0) {
      continue;
    }

    targetTexture.add(
      frameName,
      0,
      frame.cutX,
      frame.cutY,
      frame.cutWidth,
      frame.cutHeight,
    );
  }
}

export function ensureGrayscaleTexture(scene, sourceTextureKey) {
  const textureManager = scene?.textures;

  if (!textureManager?.exists(sourceTextureKey)) {
    return null;
  }

  const grayscaleTextureKey = getGrayscaleTextureKey(sourceTextureKey);

  if (textureManager.exists(grayscaleTextureKey)) {
    return grayscaleTextureKey;
  }

  const sourceTexture = textureManager.get(sourceTextureKey);
  const sourceImage = sourceTexture?.getSourceImage?.();
  const width = sourceImage?.naturalWidth ?? sourceImage?.width ?? sourceTexture?.source?.[0]?.width;
  const height = sourceImage?.naturalHeight ?? sourceImage?.height ?? sourceTexture?.source?.[0]?.height;

  if (!sourceImage || !(width > 0) || !(height > 0)) {
    return null;
  }

  const grayscaleTexture = textureManager.createCanvas(grayscaleTextureKey, width, height);

  if (!grayscaleTexture) {
    return textureManager.exists(grayscaleTextureKey) ? grayscaleTextureKey : null;
  }

  try {
    const context = grayscaleTexture.context;
    context.clearRect(0, 0, width, height);
    context.drawImage(sourceImage, 0, 0);
    const imageData = applyLuminanceGrayscale(context.getImageData(0, 0, width, height));
    context.putImageData(imageData, 0, 0);
    copyTextureFrames(sourceTexture, grayscaleTexture);
    grayscaleTexture.refresh();
    return grayscaleTextureKey;
  } catch {
    textureManager.remove(grayscaleTextureKey);
    return null;
  }
}
