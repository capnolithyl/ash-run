# Combat System

## Damage Flow

Current combat damage is based on:

1. Attacker base attack plus commander/status modifiers.
2. Flat effectiveness bonus when the attacker has the right matchup.
3. HP scaling by attacker health ratio.
4. Luck roll from `0` through the attacker's luck value.
5. Defender armor plus commander/status and one positional armor bonus.

Minimum final damage is 0.

## Exact Damage Formula

Given attacker **A** and defender **D**:

1. `attack = activeWeapon.attack + attackModifier(A)`
2. `effectiveBonus = A.effectiveAgainstTags includes D.family ? 6 : 0`
3. `baseArmor = D.stats.armor`
4. `if A is Breaker and D is a vehicle, baseArmor = floor(baseArmor / 2)`
5. `positionArmor = buildingArmor(D) > 0 ? buildingArmor(D) : terrainArmor(D)`
6. `armor = baseArmor + armorModifier(D) + positionArmor`
7. `hpRatio = max(0, A.current.hp / A.stats.maxHealth)`
8. `roll = randomInt(0, A.stats.luck)` inclusive
9. `scaledAttack = round((attack + effectiveBonus) * hpRatio)`
10. `damage = max(0, scaledAttack + roll - armor)`

Player mental model:

- Attack
- Scale by HP
- Add luck
- Subtract defense

Primary weapons still use full listed attack and consume ammo. Empty-ammo units switch to weaker secondary fire with 55% base attack, 1 range, and no ammo cost. Effectiveness is always a flat `+6`; there are no hidden multipliers in the current model.

Buildings override terrain defense instead of stacking with it. Any building gives `+3` armor, and command posts give `+4`, regardless of ownership.

## Counterattacks

- Defenders can counter if the attacker is in legal range and the defender has either primary ammo or secondary fire.
- Counter damage uses the same core formula.
- Counterattacks naturally weaken when the defender has already lost HP because they use the defender's post-hit `hpRatio`.

## Ammo / Stamina

- Primary attacks consume ammo.
- Empty-ammo units can still make weak secondary attacks.
- Movement spends stamina equal to the actual path cost paid to reach the destination tile.
- Sectors heal `10%` max HP and resupply ammo/stamina.
- Command posts resupply ammo/stamina without restoring HP.

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
- Combat XP is only awarded to units that actually deal damage, including counterattacks.
- Damage XP is based on `damageDealt / defender.stats.maxHealth`, scaled from a 60 XP full-bar baseline.
- Level difference matters through a clamped multiplier: `1 + (defender.level - attacker.level) * 0.25`, limited to `0.4` through `1.8`.
- Family matchups also scale XP:
  - Infantry -> Infantry `x1.0`
  - Infantry -> Vehicle `x1.5`
  - Vehicle -> Infantry `x0.75`
  - Vehicle -> Vehicle `x1.0`
  - Vehicle -> Air `x1.25`
  - Air -> Infantry `x0.75`
  - Air -> Vehicle `x0.9`
  - Air -> Air `x1.0`
- Kills add a flat 20 XP bonus before the same level and matchup multipliers are applied.
- Zero-damage attacks grant 0 XP, and any damaging hit grants at least 2 XP after rounding.
- Siege Gun can move and attack in the current prototype.

## Air Targeting

- Aircraft are only threatened by dedicated anti-air units right now: Skyguard and Interceptor.
- Gunship and Payload attack ground targets only.

## Enemy Repair Behavior

- Wounded enemy units may enter repair mode instead of falling back aimlessly.
- Repairing enemies path toward the nearest owned sector or, for vehicles, an unused owned repair station.
- Units in repair mode spend their action holding on the service tile long enough to receive start-of-turn servicing before rejoining the fight.
