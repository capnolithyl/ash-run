import { getUnitColorDefinitionForOwner } from "../../core/unitColors.js";

const NEUTRAL_OWNER_COLOR = 0xd8b65d;

export function getOwnerColor(owner, colorOptions = {}) {
  return getUnitColorDefinitionForOwner(owner, colorOptions)?.color ?? NEUTRAL_OWNER_COLOR;
}
