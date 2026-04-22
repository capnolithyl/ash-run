import { BattleSystem } from "../src/game/simulation/battleSystem.js";
import { TERRAIN_KEYS, TURN_SIDES } from "../src/game/core/constants.js";
import { randomInt } from "../src/game/core/random.js";
import { createUnitFromType } from "../src/game/simulation/unitFactory.js";

function expectedDamage({ seed, attacker, defender, attackModifier = 0, armorModifier = 0 }) {
  const attackRoll = randomInt(seed, 0, attacker.stats.luck);
  const attackerAttack = attacker.stats.attack + attackModifier;
  const armorBreak = attacker.unitTypeId === "breaker" && defender.family === "vehicle" ? 0.5 : 1;
  const defenderArmor = Math.floor(defender.stats.armor * armorBreak) + armorModifier;
  const isEffective = attacker.effectiveAgainstTags.includes(defender.family);
  const healthRatio = Math.max(0, attacker.current.hp / attacker.stats.maxHealth);
  const baseAttack = isEffective ? attackerAttack * 2 : attackerAttack;
  const scaledAttack = Math.round((baseAttack + attackRoll.value) * healthRatio);
  const damage = Math.max(1, scaledAttack - defenderArmor);

  return { damage, isEffective, roll: attackRoll.value, nextSeed: attackRoll.seed };
}

function makeState(seed, attacker, defender) {
  return {
    id: "test-battle",
    seed,
    map: {
      width: 3,
      height: 3,
      tiles: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => TERRAIN_KEYS.ROAD)),
      buildings: [
        { id: "pc", type: "command", owner: TURN_SIDES.PLAYER, x: 0, y: 0 },
        { id: "ec", type: "command", owner: TURN_SIDES.ENEMY, x: 2, y: 2 }
      ]
    },
    turn: { number: 1, activeSide: TURN_SIDES.PLAYER },
    player: { commanderId: "rook", funds: 0, charge: 0, recruitDiscount: 0, units: [attacker] },
    enemy: { commanderId: "rook", funds: 0, charge: 0, recruitDiscount: 0, units: [defender] },
    selection: { type: null, id: null, x: null, y: null },
    pendingAction: null,
    enemyTurn: null,
    levelUpQueue: [],
    log: [],
    victory: null
  };
}

function runCase(name, { seed, attackerType, defenderType, attackerHp }) {
  const attacker = createUnitFromType(attackerType, TURN_SIDES.PLAYER);
  const defender = createUnitFromType(defenderType, TURN_SIDES.ENEMY);

  attacker.x = 1;
  attacker.y = 1;
  defender.x = 2;
  defender.y = 1;
  attacker.current.hp = attackerHp;

  const expected = expectedDamage({ seed, attacker, defender });
  const system = new BattleSystem(makeState(seed, attacker, defender));
  const hpBefore = defender.current.hp;
  const changed = system.attackTarget(attacker.id, defender.id);
  const hpAfter = system.state.enemy.units[0]?.current.hp ?? 0;
  const actualDamage = hpBefore - hpAfter;
  const pass = changed && actualDamage === expected.damage;

  console.log(
    `${pass ? "PASS" : "FAIL"} ${name} | roll=${expected.roll} | expected=${expected.damage} | actual=${actualDamage} | effective=${expected.isEffective}`
  );

  if (!pass) {
    process.exitCode = 1;
  }
}

runCase("base attack", {
  seed: 12345,
  attackerType: "grunt",
  defenderType: "runner",
  attackerHp: 18
});

runCase("effective + hp scaling + min-1 clamp", {
  seed: 777,
  attackerType: "breaker",
  defenderType: "juggernaut",
  attackerHp: 8
});
