import { renderOptionFields } from "./optionFieldsView.js";

export function renderOptionsView(state) {
  const { options } = state.metaState;

  return `
    <div class="screen screen--options">
      <section class="panel panel--medium">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Options</p>
            <h2>Command Interface</h2>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>
        <div class="options-list">
          ${renderOptionFields(options)}
        </div>
      </section>
    </div>
  `;
}
