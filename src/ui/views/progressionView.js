import { UNIT_CATALOG } from "../../game/content/unitCatalog.js";
import { RUN_UPGRADES, UNIT_UNLOCK_TIERS } from "../../game/content/runUpgrades.js";

export function renderProgressionView(state) {
  const unlockedUnits = new Set(state.metaState.unlockedUnitIds ?? []);
  const unlockedCards = new Set(state.metaState.unlockedRunCardIds ?? []);
  const currency = state.metaState.metaCurrency ?? 0;

  return `
    <div class="screen screen--options">
      <section class="panel panel--medium">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Progression</p>
            <h2>Armory & Unlocks</h2>
          </div>
          <button class="ghost-button" data-action="back-to-title">Back</button>
        </div>
        <div class="options-list">
          <p><strong>Intel Credits:</strong> ${currency}</p>
          <h4>Unit Unlocks</h4>
          ${UNIT_UNLOCK_TIERS
            .filter((tier) => tier.tier > 0)
            .map((tier) => {
              const previousTier = UNIT_UNLOCK_TIERS.find((candidate) => candidate.tier === tier.tier - 1);
              const canAccessTier = previousTier
                ? previousTier.unitIds.every((id) => unlockedUnits.has(id))
                : true;
              return `
                <div>
                  <p><strong>Tier ${tier.tier}</strong> (${tier.unlockCost} credits each)</p>
                  ${tier.unitIds
                    .map((unitTypeId) => {
                      const unit = UNIT_CATALOG[unitTypeId];
                      const unlocked = unlockedUnits.has(unitTypeId);
                      return `
                        <button class="ghost-button ghost-button--small" data-action="purchase-unit-unlock" data-unit-type-id="${unitTypeId}" ${unlocked || !canAccessTier || currency < (tier.unlockCost ?? 0) ? "disabled" : ""}>
                          ${unlocked ? "Unlocked" : "Unlock"} ${unit?.name ?? unitTypeId}
                        </button>
                      `;
                    })
                    .join("")}
                </div>
              `;
            })
            .join("")}
          <h4>Run Card Unlocks</h4>
          ${RUN_UPGRADES.map((card) => {
            const unlocked = unlockedCards.has(card.id);
            const cost = card.unlockCost ?? 80;
            return `
              <button class="ghost-button ghost-button--small" data-action="purchase-card-unlock" data-card-id="${card.id}" ${unlocked || currency < cost ? "disabled" : ""}>
                ${unlocked ? "Unlocked" : `Unlock (${cost})`} ${card.name}
              </button>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}
