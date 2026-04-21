export const OWNER_PALETTE = {
  player: 0xc35cff,
  enemy: 0xff8a3d,
  neutral: 0xd8b65d
};

export function getOwnerColor(owner) {
  return OWNER_PALETTE[owner] ?? OWNER_PALETTE.neutral;
}
