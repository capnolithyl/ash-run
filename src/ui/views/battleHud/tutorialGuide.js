import { escapeHtml } from "../../shared/html.js";

export function renderTutorialGuide(battleSnapshot) {
  const tutorial = battleSnapshot?.presentation?.tutorial;

  if (!tutorial) {
    return "";
  }

  const nudge = tutorial.nudge
    ? `<p class="tutorial-guide__nudge" role="status">${escapeHtml(tutorial.nudge)}</p>`
    : "";
  const primaryAction = tutorial.phase === "lesson-complete"
    ? `${tutorial.returnIntent === "new-run" ? '<button class="menu-button menu-button--small" data-action="continue-new-run-from-tutorial">Continue to New Run</button>' : ""}<button class="menu-button menu-button--small" data-action="tutorial-epilogue">Tutorial Hub</button>`
    : tutorial.enemyObservationPhase === "recap"
      ? '<button class="menu-button menu-button--small" data-action="continue-tutorial-enemy-recap">Continue</button>'
      : tutorial.canContinue
      ? '<button class="menu-button menu-button--small" data-action="tutorial-next">Continue</button>'
      : "";
  const exitAction = tutorial.canExit
    ? '<button class="ghost-button ghost-button--small" data-action="skip-tutorial">Exit Lesson</button>'
    : "";
  const stageResult = tutorial.stageResult ?? null;
  const guideClasses = [
    "tutorial-guide",
    `tutorial-guide--${tutorial.panelPlacement === "right" ? "right" : "left"}`,
    stageResult ? "tutorial-guide--result" : "",
    tutorial.enemyObservationPhase ? "tutorial-guide--enemy-observation" : ""
  ].filter(Boolean).join(" ");
  const eyebrow = stageResult
    ? `${escapeHtml(stageResult.label)} · ${escapeHtml(stageResult.objective)}`
    : `${escapeHtml(tutorial.mascotName ?? "Pip")} · ${escapeHtml(tutorial.lessonTitle ?? "Training")}`;

  return `
    <aside class="${guideClasses}" aria-label="${stageResult ? "Objective result" : "Tutorial guide"}">
      <div class="tutorial-guide__portrait" aria-hidden="true">
        <span>${tutorial.mascotName ?? "Pip"}</span>
      </div>
      <div class="tutorial-guide__copy">
        <div class="tutorial-guide__header">
          <p class="eyebrow">${eyebrow}</p>
          <span>${escapeHtml(tutorial.progress)}</span>
        </div>
        <strong>${escapeHtml(tutorial.title)}</strong>
        <p>${escapeHtml(tutorial.body)}</p>
        ${tutorial.actionLabel ? `<p class="tutorial-guide__action-label"><strong>Do:</strong> ${escapeHtml(tutorial.actionLabel)}</p>` : ""}
        ${nudge}
        ${
          primaryAction || exitAction
            ? `<div class="tutorial-guide__actions">${primaryAction}${exitAction}</div>`
            : ""
        }
      </div>
    </aside>
  `;
}
