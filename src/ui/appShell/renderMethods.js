import { appShellBattleMeterMethods } from "./render/battleMeters.js";
import { appShellBattlePresentationPlaybackMethods } from "./render/battlePresentationPlayback.js";
import { appShellBattleScreenMethods } from "./render/battleScreen.js";
import { appShellCombatCutsceneMethods } from "./render/combatCutscene.js";
import { appShellScreenRouterMethods } from "./render/screenRouter.js";
import { appShellUiStatePersistenceMethods } from "./render/uiStatePersistence.js";

export const appShellRenderMethods = Object.assign(
  {},
  appShellScreenRouterMethods,
  appShellBattleScreenMethods,
  appShellBattlePresentationPlaybackMethods,
  appShellCombatCutsceneMethods,
  appShellBattleMeterMethods,
  appShellUiStatePersistenceMethods
);
