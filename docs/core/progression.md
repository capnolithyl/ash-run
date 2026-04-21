# Progression

## Unit Leveling

- Units gain XP through battle actions.
- XP threshold grows by level (`80 + 35 * (level-1)`).
- On level-up, one stat increases from a weighted random table.

## Current Stat Growth Weights

- High weight: Attack, Armor, Max Health
- Medium weight: Stamina Max, Ammo Max, Luck
- Low weight: Movement, Max Range

Range growth is skipped for units that cannot attack at range.

## Persistence + Permadeath

- Survivor snapshots carry level, XP, and rolled stats to next map.
- Units reduced to 0 HP are permanently removed from the run roster.
- Roster deployment is capped at 10 units per battle.
