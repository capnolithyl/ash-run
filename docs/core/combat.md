# Combat System

<<<<<<< ours
<<<<<<< ours
## Exact Damage Formula (current implementation)

Given attacker **A** and defender **D**:

1. `attack = A.stats.attack + attackModifier(A)`
2. `armor = D.stats.armor + armorModifier(D)`
3. `effectiveMultiplier = A.effectiveAgainstTags includes D.family ? 2 : 1`
4. `hpRatio = max(0, A.current.hp / A.stats.maxHealth)`
5. `roll = randomInt(0, A.stats.luck)` (inclusive)
6. `scaledAttack = round((attack * effectiveMultiplier + roll) * hpRatio)`
7. `damage = max(1, scaledAttack - armor)`

Final:

`damage = max(1, round(( (attack * effectiveMultiplier) + roll ) * hpRatio) - armor)`

### Notes

- Effective attacks double attack **before** HP scaling.
- Low-health attackers deal less damage via `hpRatio`.
- Damage is always at least `1`.
- Commander passives and temporary statuses modify attack/armor through their respective modifiers.

## Effectiveness

| Unit        | Effective Against                       |
| ----------- | --------------------------------------- |
| Longshots   | Grunts, Breakers, Longshots             |
| Breakers    | All Vehicles                            |
| Runners     | Grunts, Breakers, Longshots             |
| Bruiser     | Runners, Bruisers, Skyguard, Siege Gun  |
| Juggernaut  | All Vehicles                            |
| Siege Gun   | Runners, Bruisers, Juggernaut, Skyguard |
| Skyguard    | All Air Units                           |
| Gunship     | Runners, Bruisers, Siege Gun            |
| Payload     | All Land Units                          |
| Interceptor | All Air Units                           |
| Carrier     | Cannot attack                           |

## Special Rules

- Siege Gun can move and attack.
- Luck introduces randomness.
- Stamina and ammo add resource management.
=======
=======
>>>>>>> theirs
## Damage Flow

Current combat damage is based on:

1. Attacker base attack (+ commander/status modifiers)
2. Effectiveness bonus (double attack when attacker counters target family)
3. Luck roll (`0..luck`)
4. HP scaling by attacker health ratio
5. Defender armor (+ commander/status modifiers)

Minimum final damage is 1.

## Counterattacks

- Defenders can counter if target is in legal range and has ammo.
- Counter damage uses the same core formula.

## Ammo / Stamina

- Attacking consumes ammo.
- Movement consumes stamina by path cost.
- Sector servicing and some commander powers can resupply both.

## Combat Outcomes

- Units at 0 HP are removed.
- XP is awarded for dealing/taking combat actions.
- Kill XP scales with level delta and threshold.
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
