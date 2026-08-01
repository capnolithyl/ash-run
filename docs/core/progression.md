# Progression

## Unit Leveling

- Units gain XP through battle actions.
- Combat XP is driven by percent damage dealt to the target's max HP, not raw damage amount or unit cost.
- Higher-level targets award more XP, lower-level targets award less, with the level-difference multiplier clamped between `0.4` and `1.8`.
- Family matchups matter: infantry punching into vehicles earns extra XP, while vehicles or aircraft farming softer targets earns less.
- Kills add a flat bonus on top of the damage XP calculation.
- XP threshold grows by level as `90 + 30 * (level - 1)`.
- On level-up, each eligible stat rolls independently for growth, so one level can increase multiple stats.
- If every growth roll misses, the game forces at least one stat gain by making a fallback weighted pick.

## Current Shared Stat Growth Defaults

| Stat | Chance | Fallback Weight | Increment |
| --- | ---: | ---: | ---: |
| Attack | 57% | 6 | 6-8 |
| Armor | 48% | 4 | 3-5 |
| Max Health | 68% | 6 | 10-17 |
| Movement | 4% | 0 | 1 |
| Max Range | 1% | 0 | 1 |
| Stamina Max | 33% | 2 | 9-13 |
| Ammo Max | 42% | 5 | 1-2 |
| Luck | 16% | 3 | 1-2 |

Unit-specific `levelUpGrowthModifiers` add to these defaults. `chance` and
`weight` are signed deltas, while `increment.min` and `increment.max` adjust
the lower and upper increment bounds independently. Omitted values add zero.
For example, Longshot's attack modifier adds `8` chance, `1` weight, `1` to
the minimum increment, and `0` to the maximum, resolving to `65%`, weight `7`,
and an increment of `7-8`.

Range growth is skipped for units that cannot attack at range, both on the normal rolls and on the fallback pick.

## Persistence + Permadeath

- Survivor snapshots carry level, XP, and rolled stats to next map.
- Units reduced to 0 HP are permanently removed from the run roster.
- Roster deployment is capped at 6 units per battle.
- Returning rosters are redeployed to unique nearby starting tiles so carried units cannot stack on the same spawn.
- Each cleared map awards `5` Intel Credits.
- The first time a building is captured in a battle, the capturing infantry also earns `+20` XP and `+2` Intel Credits.
- Clearing the full 10-map run grants an extra `30` Intel Credits on top of the `50` earned from map clears.
- Reinforcement Draft now replaces card rewards on maps `2`, `4`, `6`, and `8`.

## Enemy Map Scaling

- Enemy pressure rises with map index.
- Early maps keep reinforcements lighter now that player recruiting is locked to the pre-map loadout.
- Enemy starting funds and reinforcement drops still rise over the run, but later and more gradually than before.
- Later maps add higher-level enemy units, heavier starting reinforcements, and a small number of enemy-held forward sectors.
- The scaling remains capped so it pressures snowballing without replacing authored map balance.
