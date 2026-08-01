import test from "node:test";
import assert from "node:assert/strict";
import { UNIT_UNLOCK_TIERS } from "../src/game/content/runUpgrades.js";
import {
  generateRunUnitName,
  getRunUnitNameKey,
  RUN_UNIT_NAME_MAX_LENGTH,
  RUN_UNIT_NAME_POOLS,
  validateRunUnitName
} from "../src/game/content/runUnitNames.js";

test("every run-recruitable unit type has a large unique valid name pool", () => {
  const recruitableIds = UNIT_UNLOCK_TIERS.flatMap((tier) => tier.unitIds);

  for (const unitTypeId of recruitableIds) {
    const pool = RUN_UNIT_NAME_POOLS[unitTypeId];
    assert.ok(pool, `${unitTypeId} should have a name pool`);
    assert.ok(pool.length >= 40, `${unitTypeId} should have at least 40 names`);
    assert.equal(
      new Set(pool.map(getRunUnitNameKey)).size,
      pool.length,
      `${unitTypeId} names should be unique within the pool`
    );

    for (const name of pool) {
      assert.equal(validateRunUnitName(name).valid, true, `${unitTypeId}: ${name}`);
      assert.ok(name.length <= RUN_UNIT_NAME_MAX_LENGTH);
    }
  }
});

test("run-unit name generation is deterministic and skips reserved names", () => {
  const first = generateRunUnitName("grunt", { unitId: "grunt-test", roll: 0 });
  const repeated = generateRunUnitName("grunt", { unitId: "grunt-test", roll: 0 });
  const rerolled = generateRunUnitName("grunt", {
    unitId: "grunt-test",
    roll: 1,
    excludedNames: [first]
  });

  assert.equal(repeated, first);
  assert.notEqual(rerolled, first);
});

test("run-unit name generation suffixes a pool name after exhaustion", () => {
  const pool = RUN_UNIT_NAME_POOLS.grunt;
  const generated = generateRunUnitName("grunt", {
    unitId: "exhausted-grunt",
    excludedNames: pool
  });

  assert.match(generated, / \d+$/);
  assert.ok(generated.length <= RUN_UNIT_NAME_MAX_LENGTH);
  assert.equal(pool.map(getRunUnitNameKey).includes(getRunUnitNameKey(generated)), false);
});

test("custom run-unit names normalize whitespace and reject invalid or duplicate values", () => {
  assert.deepEqual(validateRunUnitName("  Road   Ace  "), {
    valid: true,
    name: "Road Ace",
    error: ""
  });
  assert.equal(validateRunUnitName("").valid, false);
  assert.equal(validateRunUnitName("<script>").valid, false);
  assert.equal(validateRunUnitName("A".repeat(RUN_UNIT_NAME_MAX_LENGTH + 1)).valid, false);
  assert.equal(validateRunUnitName("Mara", ["mArA"]).valid, false);
});
