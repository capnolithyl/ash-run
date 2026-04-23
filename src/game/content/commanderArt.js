function buildCommanderAssetPath(folderName, fileName) {
  return `./assets/img/commanders/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;
}

const COMMANDER_ART = {
  atlas: {
    info: buildCommanderAssetPath("atlas", "Atlas - Info.png"),
    portrait: buildCommanderAssetPath("atlas", "Atlas - Portrait.png")
  },
  viper: {
    info: buildCommanderAssetPath("viper", "Viper - Info.png"),
    portrait: buildCommanderAssetPath("viper", "Viper - Portrait.png")
  },
  rook: {
    info: buildCommanderAssetPath("rook", "Rook - Info.png"),
    portrait: buildCommanderAssetPath("rook", "Rook - Portrait.png")
  },
  echo: {
    info: buildCommanderAssetPath("echo", "Echo - Info.png"),
    portrait: buildCommanderAssetPath("echo", "Echo - Portrait.png")
  },
  blaze: {
    info: buildCommanderAssetPath("blaze", "Blaze - Info.png"),
    portrait: buildCommanderAssetPath("blaze", "Blaze - Portrait.png")
  },
  knox: {
    info: buildCommanderAssetPath("knox", "Knox - Info.png"),
    portrait: buildCommanderAssetPath("knox", "Knox - Portrait.png")
  },
  falcon: {
    info: buildCommanderAssetPath("falcon", "Falcon - Info.png"),
    portrait: buildCommanderAssetPath("falcon", "Falcon - Portrait.png")
  },
  graves: {
    info: buildCommanderAssetPath("graves", "Graves - Info.png"),
    portrait: buildCommanderAssetPath("graves", "Graves - Portrait.png")
  },
  nova: {
    info: buildCommanderAssetPath("nova", "Nova - Info.png"),
    portrait: buildCommanderAssetPath("nova", "Nova - Portrait.png")
  },
  sable: {
    info: buildCommanderAssetPath("sables", "Sables - Info.png"),
    portrait: buildCommanderAssetPath("sables", "Sables - Portrait.png")
  }
};

function getCommanderArt(commanderId) {
  return COMMANDER_ART[commanderId] ?? null;
}

export function getCommanderInfoImageUrl(commanderId) {
  return getCommanderArt(commanderId)?.info ?? null;
}

export function getCommanderPortraitImageUrl(commanderId) {
  return getCommanderArt(commanderId)?.portrait ?? null;
}
