# Combat System

## Damage Flow

Current combat damage is based on:

1. Attacker base attack plus commander/status modifiers.
2. Effectiveness bonus from the active weapon profile.
3. Luck roll from `0` through the attacker's luck value.
4. HP scaling by attacker health ratio.
5. Defender armor plus commander/status, terrain, and building armor modifiers.

Minimum final damage is 1.

## Exact Damage Formula

Given attacker **A** and defender **D**:

1. `attack = activeWeapon.attack + attackModifier(A)`
2. `armor = D.stats.armor + armorModifier(D) + terrainArmor(D) + buildingArmor(D)`
3. `effectiveMultiplier = A.effectiveAgainstTags includes D.family ? weapon.effectiveMultiplier : 1`
4. `hpRatio = max(0, A.current.hp / A.stats.maxHealth)`
5. `roll = randomInt(0, A.stats.luck)` inclusive
6. `scaledAttack = round(((attack * effectiveMultiplier) + roll) * hpRatio)`
7. `damage = max(1, scaledAttack - armor)`

Primary weapons use a 2x effective multiplier. Empty-ammo units switch to weaker secondary fire with 55% base attack, 1 range, no ammo cost, and a smaller 1.25x effective multiplier. Low-health attackers deal less damage through `hpRatio`.

## Counterattacks

- Defenders can counter if the attacker is in legal range and the defender has either primary ammo or secondary fire.
- Counter damage uses the same core formula.

## Ammo / Stamina

- Primary attacks consume ammo.
- Empty-ammo units can still make weak secondary attacks.
- Movement consumes stamina by path cost.
- Sector servicing and some commander powers can resupply both.

## Effectiveness

| Unit        | Effective Against                       |
| ----------- | --------------------------------------- |
| Longshots   | Grunts, Breakers, Longshots             |
| Breakers    | All Vehicles                            |
| Runners     | Grunts, Breakers, Longshots             |
| Bruiser     | Runners, Bruisers, Skyguard, Siege Gun  |
| Juggernaut  | Barracks units and all vehicles         |
| Siege Gun   | Runners, Bruisers, Juggernaut, Skyguard |
| Skyguard    | All Air Units                           |
| Gunship     | Runners, Bruisers, Siege Gun            |
| Payload     | All Land Units                          |
| Interceptor | All Air Units                           |
| Carrier     | Cannot attack                           |

## Combat Outcomes

- Units at 0 HP are removed.
- XP is awarded from actual HP removed, not overkill damage.
- Kill XP scales with level delta, target value, damage dealt, and the target's HP before the killing blow.
- Siege Gun can move and attack in the current prototype.
