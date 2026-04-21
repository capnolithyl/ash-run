# Game Structure

## Run Structure

- Runs target **10 maps** by default.
- A run samples from a **20-map authored pool**.
- Difficulty scales by map index (enemy roster pressure increases over time).
- Run ends immediately on battle defeat.

## Battle Structure

- Turn-based, two sides: player and enemy.
- Player roster is deployed from persistent snapshots.
- Enemy roster is generated from commander-based templates plus scaling additions.
- Victory currently centers on eliminating the enemy force.

## Persistence Rules

- Surviving player units carry to the next battle.
- Dead units are removed from run roster.
- Unit XP/level/stats persist across the run.
- Funds and commander charge are battle-local and reset per map.

## Save Structure

- 3 manual save slots.
- Slot records include:
  - run state
  - active battle state
  - summary (commander, map progress, map name)
- Meta state stores unlocked commanders, options, and last played slot.
