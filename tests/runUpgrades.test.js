import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  drawImmediateRunCards,
  drawRunUpgradeChoices,
  getDefaultUnlockedRunCardIds,
  getEffectiveRunUpgradeIds,
  getEligibleRunUpgrades,
  getRarityWeightsForStage,
  getRunUpgradeById,
  getRunUpgradeRarityAsset,
  RUN_CARD_TYPES,
  RUN_UPGRADE_DRAW_TUNING,
  RUN_UPGRADE_EFFECT_VALUES,
  RUN_UPGRADE_RARITIES,
  RUN_UPGRADE_RARITY_ASSETS,
  RUN_UPGRADE_RARITY_LABELS,
  RUN_UPGRADES
} from "../src/game/content/runUpgrades.js";

const ISSUE_CARD_IDS = [
  "passive-drill",
  "passive-plating",
  "gear-aa-kit",
  "gear-field-meds",
  "combat-stims-1",
  "combat-stims-2",
  "combat-stims-3",
  "armor-plating-1",
  "armor-plating-2",
  "armor-plating-3",
  "field-repairs-1",
  "field-repairs-2",
  "field-repairs-3",
  "motorized-infantry-1",
  "motorized-infantry-2",
  "motorized-infantry-3",
  "shock-troops-1",
  "shock-troops-2",
  "shock-troops-3",
  "entrench-1",
  "entrench-2",
  "entrench-3",
  "pack-mules-1",
  "pack-mules-2",
  "pack-mules-3",
  "bayonet-charge",
  "overclocked-engines-1",
  "overclocked-engines-2",
  "siege-package-1",
  "siege-package-2",
  "siege-package-3",
  "heavy-payload-1",
  "heavy-payload-2",
  "heavy-payload-3",
  "afterburners-1",
  "afterburners-2",
  "low-altitude-strike-1",
  "low-altitude-strike-2",
  "fuel-reserve-1",
  "fuel-reserve-2",
  "glass-cannons-1",
  "glass-cannons-2",
  "lottery-ticket",
  "experimental-ammunition-1",
  "experimental-ammunition-2",
  "supply-mishap-1",
  "supply-mishap-2",
  "supply-mishap-3",
  "gear-toolkit",
  "gear-flamethrower",
  "hit-and-run",
  "hold-the-line",
  "dust-storm-1",
  "dust-storm-2",
  "dust-storm-3",
  "lone-wolf-1",
  "lone-wolf-2",
  "lone-wolf-3",
  "battle-brothers-1",
  "battle-brothers-2",
  "battle-brothers-3",
  "glass-army-1",
  "glass-army-2",
  "glass-army-3",
  "iron-army-1",
  "iron-army-2",
  "iron-army-3",
  "everything-is-a-missile",
  "canto-1",
  "canto-2",
  "chain-reaction-1",
  "chain-reaction-2",
  "chain-reaction-3",
  "ammo-optional-1",
  "ammo-optional-2",
  "redline-1",
  "redline-2",
  "redline-3",
  "gear-final-transmission",
  "gear-scavengers",
  "gear-predators",
  "gear-blood-trail",
  "glass-fuel-lines",
  "devils-ammo",
  "overconfidence",
  "gear-climbing-gear-1",
  "gear-climbing-gear-2",
  "gear-climbing-gear-3",
  "gear-pathfinder-1",
  "gear-pathfinder-2",
  "gear-patient-zero"
];

test("run upgrade catalog includes every named issue card and current upgrade", () => {
  const ids = new Set(RUN_UPGRADES.map((upgrade) => upgrade.id));

  for (const cardId of ISSUE_CARD_IDS) {
    assert.equal(ids.has(cardId), true, `${cardId} missing from run upgrade catalog`);
    assert.ok(getRunUpgradeById(cardId)?.summary);
  }

  assert.equal(new Set(RUN_UPGRADES.map((upgrade) => upgrade.id)).size, RUN_UPGRADES.length);
});

test("rarity constants expose editable labels, weights, and local assets", () => {
  assert.deepEqual(Object.values(RUN_UPGRADE_RARITIES), [
    "common",
    "uncommon",
    "rare",
    "epic",
    "mythic",
    "legendary"
  ]);
  assert.equal(RUN_UPGRADE_RARITY_LABELS[RUN_UPGRADE_RARITIES.LEGENDARY], "Legendary");
  assert.ok(RUN_UPGRADE_DRAW_TUNING.stageRarityWeights.length >= 5);
  assert.equal(RUN_UPGRADE_EFFECT_VALUES["lottery-ticket"].cardCount, 2);

  for (const rarity of Object.values(RUN_UPGRADE_RARITIES)) {
    const asset = RUN_UPGRADE_RARITY_ASSETS[rarity];
    assert.ok(asset.endsWith(`${rarity}.png`) || asset.endsWith("5_mythic.png"));
    assert.equal(existsSync(asset.replace("./", "")), true, `${asset} should exist`);
  }

  assert.match(getRunUpgradeRarityAsset("gear-final-transmission"), /6_legendary\.png$/);
});

test("evolution cards require the previous tier and only the highest tier is effective", () => {
  const emptyEligibleIds = new Set(getEligibleRunUpgrades({ ownedRunCardIds: [] }).map((upgrade) => upgrade.id));
  assert.equal(emptyEligibleIds.has("motorized-infantry-1"), true);
  assert.equal(emptyEligibleIds.has("motorized-infantry-2"), false);

  const tierOneEligibleIds = new Set(
    getEligibleRunUpgrades({ ownedRunCardIds: ["motorized-infantry-1"] }).map((upgrade) => upgrade.id)
  );
  assert.equal(tierOneEligibleIds.has("motorized-infantry-1"), false);
  assert.equal(tierOneEligibleIds.has("motorized-infantry-2"), true);
  assert.equal(tierOneEligibleIds.has("motorized-infantry-3"), false);

  assert.deepEqual(
    getEffectiveRunUpgradeIds(["motorized-infantry-1", "motorized-infantry-2", "passive-drill"]),
    ["motorized-infantry-2", "passive-drill"]
  );
});

test("reward draws are deterministic, stage-weighted, and keep repeatable gear eligible", () => {
  const earlyWeights = getRarityWeightsForStage(1);
  const lateWeights = getRarityWeightsForStage(8);
  assert.equal(earlyWeights.legendary, 0);
  assert.ok(lateWeights.legendary > earlyWeights.legendary);
  assert.ok(earlyWeights.common > earlyWeights.rare);

  const runState = {
    ownedRunCardIds: ["passive-drill", "gear-aa-kit"],
    availableRunCardIds: ["passive-drill", "passive-plating", "gear-aa-kit", "gear-field-meds"]
  };
  const firstDraw = drawRunUpgradeChoices(runState, 3, "same-seed");
  const secondDraw = drawRunUpgradeChoices(runState, 3, "same-seed");

  assert.deepEqual(firstDraw.choices.map((choice) => choice.id), secondDraw.choices.map((choice) => choice.id));
  assert.equal(firstDraw.choices.some((choice) => choice.id === "passive-drill"), false);
  assert.equal(firstDraw.choices.some((choice) => choice.id === "gear-aa-kit"), true);
});

test("hidden placeholders stay out of default unlocks and rewards", () => {
  const defaultIds = new Set(getDefaultUnlockedRunCardIds());
  const eligibleIds = new Set(getEligibleRunUpgrades({ ownedRunCardIds: [] }).map((upgrade) => upgrade.id));
  assert.equal(defaultIds.has("noop-xp-boost"), false);
  assert.equal(eligibleIds.has("noop-xp-boost"), false);
  assert.equal(
    getEligibleRunUpgrades({ ownedRunCardIds: [] }, { includeHidden: true })
      .some((upgrade) => upgrade.id === "noop-xp-boost"),
    true
  );
});

test("immediate lottery draws exclude gear and the ticket itself", () => {
  const result = drawImmediateRunCards(
    {
      ownedRunCardIds: [],
      availableRunCardIds: [
        "lottery-ticket",
        "gear-aa-kit",
        "passive-drill",
        "passive-plating",
        "combat-stims-1",
        "field-repairs-1"
      ]
    },
    5,
    "lottery-seed",
    3
  );

  assert.equal(result.choices.length, 3);
  assert.equal(result.choices.some((choice) => choice.id === "lottery-ticket"), false);
  assert.equal(result.choices.some((choice) => choice.type === RUN_CARD_TYPES.GEAR), false);
});
