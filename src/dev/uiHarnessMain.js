import "../styles/main.css";
import { renderCommanderSelectView } from "../ui/views/commanderSelectView.js";
import { renderOptionsView } from "../ui/views/optionsView.js";
import { renderProgressionView } from "../ui/views/progressionView.js";
import { renderBattleHudView } from "../ui/views/battleHudView.js";
import { renderRunLoadoutView } from "../ui/views/runLoadoutView.js";
import { renderSkirmishSetupView } from "../ui/views/skirmishSetupView.js";
import { renderTitleView } from "../ui/views/titleView.js";
import { UI_HARNESS_SCENES, createUiHarnessScene } from "./uiHarnessFixtures.js";

const params = new URLSearchParams(window.location.search);
const requestedSceneId = params.get("scene") ?? "title";
const embedMode = params.get("embed") === "1";
const root = document.getElementById("ui-root");
const toolbar = document.getElementById("ui-harness-toolbar");

if (!root || !toolbar) {
  throw new Error("UI harness root elements are missing.");
}

root.dataset.inputMode = "mouse";
toolbar.hidden = embedMode;

function renderScene() {
  const { sceneId, state } = createUiHarnessScene(requestedSceneId);
  root.innerHTML = renderSceneMarkup(sceneId, state);
  document.title = `Ash Run '84 UI Harness - ${sceneId}`;
  syncToolbar(sceneId);
}

function renderSceneMarkup(sceneId, state) {
  switch (sceneId) {
    case "commander-select":
      return renderCommanderSelectView(state);
    case "run-loadout":
      return renderRunLoadoutView(state);
    case "skirmish-commanders":
    case "skirmish-map":
      return renderSkirmishSetupView(state);
    case "options":
      return renderOptionsView(state);
    case "progression":
      return renderProgressionView(state);
    case "battle-targeting":
    case "battle-pause":
    case "battle-reward":
    case "battle-run-complete":
    case "battle-run-lost":
    case "battle-level-up":
      return renderBattleHudView(state);
    case "title":
    default:
      return renderTitleView(state);
  }
}

function syncToolbar(activeSceneId) {
  toolbar.innerHTML = UI_HARNESS_SCENES.map(
    (scene) => `
      <button
        type="button"
        data-scene-id="${scene.id}"
        data-active="${scene.id === activeSceneId ? "true" : "false"}"
      >
        ${scene.label}
      </button>
    `
  ).join("");
}

toolbar.addEventListener("click", (event) => {
  const nextSceneId = event.target.closest("[data-scene-id]")?.dataset.sceneId;

  if (!nextSceneId) {
    return;
  }

  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("scene", nextSceneId);
  window.location.search = nextParams.toString();
});

renderScene();
