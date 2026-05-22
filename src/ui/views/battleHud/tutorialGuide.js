export function renderTutorialGuide(battleSnapshot) {
  const tutorial = battleSnapshot?.presentation?.tutorial;

  if (!tutorial) {
    return "";
  }

  const nudge = tutorial.nudge
    ? `<p class="tutorial-guide__nudge" role="status">${tutorial.nudge}</p>`
    : "";
  const primaryAction = tutorial.phase === "complete"
    ? '<button class="menu-button menu-button--small" data-action="tutorial-epilogue">Field Notes</button>'
    : tutorial.canContinue
      ? '<button class="menu-button menu-button--small" data-action="tutorial-next">Next</button>'
      : "";
  const skipAction = tutorial.canSkip
    ? '<button class="ghost-button ghost-button--small" data-action="skip-tutorial">Skip</button>'
    : "";

  return `
    <aside class="tutorial-guide" aria-label="Tutorial guide">
      <div class="tutorial-guide__portrait" aria-hidden="true">
        <span>${tutorial.mascotName ?? "Pip"}</span>
      </div>
      <div class="tutorial-guide__copy">
        <div class="tutorial-guide__header">
          <p class="eyebrow">${tutorial.mascotName ?? "Pip"} Says</p>
          <span>${tutorial.progress}</span>
        </div>
        <strong>${tutorial.title}</strong>
        <p>${tutorial.body}</p>
        ${nudge}
        ${
          primaryAction || skipAction
            ? `<div class="tutorial-guide__actions">${primaryAction}${skipAction}</div>`
            : ""
        }
      </div>
    </aside>
  `;
}
