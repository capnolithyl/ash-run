# Combat System

## Damage Flow

Current combat damage is based on:

1. Attacker base attack plus commander/status modifiers.
2. Flat effectiveness bonus when the attacker has the right matchup.
3. HP scaling by attacker health ratio.
4. Luck roll from `0` through the attacker's luck value.
5. Defender armor plus commander/status, terrain, and building armor modifiers.

Minimum final damage is 0.

## Exact Damage Formula

Given attacker **A** and defender **D**:

1. `attack = activeWeapon.attack + attackModifier(A)`
2. `effectiveBonus = A.effectiveAgainstTags includes D.family ? 6 : 0`
3. `baseArmor = D.stats.armor`
4. `if A is Breaker and D is a vehicle, baseArmor = floor(baseArmor / 2)`
5. `armor = baseArmor + armorModifier(D) + terrainArmor(D) + buildingArmor(D)`
6. `hpRatio = max(0, A.current.hp / A.stats.maxHealth)`
7. `roll = randomInt(0, A.stats.luck)` inclusive
8. `scaledAttack = round((attack + effectiveBonus) * hpRatio)`
9. `damage = max(0, scaledAttack + roll - armor)`

Player mental model:

- Attack
- Scale by HP
- Add luck
- Subtract defense

Primary weapons still use full listed attack and consume ammo. Empty-ammo units switch to weaker secondary fire with 55% base attack, 1 range, and no ammo cost. Effectiveness is always a flat `+6`; there are no hidden multipliers in the current model.

## Counterattacks

- Defenders can counter if the attacker is in legal range and the defender has either primary ammo or secondary fire.
- Counter damage uses the same core formula.
- Counterattacks naturally weaken when the defender has already lost HP because they use the defender's post-hit `hpRatio`.

## Ammo / Stamina

- Primary attacks consume ammo.
- Empty-ammo units can still make weak secondary attacks.
- Movement range is gated by terrain/path cost, but any completed reposition currently spends 1 stamina.
- Sector servicing and some commander powers can resupply both.

## Effectiveness

Current effectiveness tags:

| Unit        | Effective Against                       |
| ----------- | --------------------------------------- |
| Longshots   | All Infantry                            |
| Breakers    | All Vehicles                            |
| Runners     | All Infantry                            |
| Bruisers    | All Infantry                            |
| Juggernauts | All Infantry and Vehicles               |
| Medics      | No special effectiveness                |
| Mechanics   | No special effectiveness                |
| Siege Gun   | All Vehicles                            |
| Skyguard    | All Air Units                           |
| Gunship     | All Infantry                            |
| Payload     | All Infantry and Vehicles               |
| Interceptor | All Air Units                           |
| Carrier     | Cannot attack                           |

Breaker is the only special case beyond the shared `+6` rule: against vehicles, it also halves the defender's base armor before terrain/building/status cover is added.

## Support Actions

- Medics can support adjacent infantry.
- Mechanics can support adjacent vehicles.
- Support restores 50% max HP, full ammo, and full stamina.
- Medics receive a 2-turn support cooldown; mechanics receive a 3-turn support cooldown.

## Combat Outcomes

- Units at 0 HP are removed.
- XP is awarded from actual HP removed, not overkill damage.
- Kill XP scales with level delta, target value, damage dealt, and the target's HP before the killing blow.
- Siege Gun can move and attack in the current prototype.

## Enemy Repair Behavior

- Wounded enemy units may enter repair mode instead of falling back aimlessly.
- Repairing enemies path toward the nearest owned sector or, for vehicles, an unused owned repair station.
- Units in repair mode spend their action holding on the service tile long enough to receive start-of-turn servicing before rejoining the fight.
