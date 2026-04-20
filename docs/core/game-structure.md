# Game Structure

## Runs

- Series of sequential battles
- No branching paths in the prototype
- Maps chosen randomly from a larger pool
- Difficulty increases over time
- Run ends on defeat

## Prototype Victory Track

- First milestone: beat 10 maps in a row
- Clearing milestone runs unlocks harder goals and difficulties
- Later goals can expand to 20 maps in a row and beyond
- Boss battles are a future addition, not a prototype requirement

## Battle Economy And Roster

- Each map has its own income economy
- Players can buy new units during battle from production buildings
- Surviving units carry over to the next map with their levels, XP, stats, and other persistent unit progression
- Money resets at the start of every map
- Commander power charge resets at the start of every map
- Newly bought units start at level 1
- Future option: allow paying extra for higher starting levels
- Prototype roster cap: 10 units

## Between Battles

- Surviving units remain in the run roster
- Player selects upgrades or rewards
- Possible rewards:
  - New units
  - Stat bonuses
  - Passive effects
  - Commander enhancements
- Rewards should support the roster system without letting the player bypass core map economy too easily

## Meta Progression

- Currency earned after runs
- Used to unlock:
  - Commanders
  - Permanent bonuses
  - New unit types
  - Starting perks

## Save Data

- Desktop version ships through Electron
- Save slots are required
- Save data should cover both meta progression and in-progress runs
