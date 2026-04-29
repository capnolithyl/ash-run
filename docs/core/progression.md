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

## Current Stat Growth Chances

- Attack: 50%
- Armor: 50%
- Max Health: 50%
- Movement: 10%
- Max Range: 5%
- Stamina Max: 25%
- Ammo Max: 20%
- Luck: 20%

Fallback weighting still favors the old tiers:

- High weight: Attack, Armor, Max Health
- Medium weight: Stamina Max, Ammo Max, Luck
- Low weight: Movement, Max Range

Range growth is skipped for units that cannot attack at range, both on the normal rolls and on the fallback pick.

## Persistence + Permadeath

- Survivor snapshots carry level, XP, and rolled stats to next map.
- Units reduced to 0 HP are permanently removed from the run roster.
- Roster deployment is capped at 6 units per battle.
- Returning rosters are redeployed to unique nearby starting tiles so carried units cannot stack on the same spawn.
- Each cleared map awards `5` Intel Credits.
- Capturing any building during a run awards `2` Intel Credits.
- Clearing the full 10-map run grants an extra `30` Intel Credits on top of the `50` earned from map clears.

## Enemy Map Scaling

- Enemy pressure rises with map index.
- Early maps keep reinforcements lighter now that player recruiting is locked to the pre-map loadout.
- Enemy starting funds and reinforcement drops still rise over the run, but later and more gradually than before.
- Later maps add higher-level enemy units, heavier starting reinforcements, and a small number of enemy-held forward sectors.
- The scaling remains capped so it pressures snowballing without replacing authored map balance.
