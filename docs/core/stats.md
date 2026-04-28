# Unit Stats

Current normalized unit stat set:

- `maxHealth`
- `attack`
- `armor`
- `movement`
- `minRange`
- `maxRange`
- `staminaMax`
- `ammoMax`
- `luck`

Runtime unit state also tracks:

- current HP/ammo/stamina
- level + XP
- move/attack completion flags
- transport state for carried infantry and Runner cargo
- support cooldowns for Medic/Mechanic service actions
- temporary statuses (shield/attack/mobility effects)

## Notes

- `minRange/maxRange` controls direct-fire vs indirect-fire behavior.
- `luck` contributes a random additive roll after HP scaling and before defense is subtracted.
- `staminaMax` and `ammoMax` are resupply-sensitive resources.
- XP progression uses percent damage to target max HP plus matchup, level-delta, and kill-bonus modifiers.
- XP needed for the next level is `90 + 30 * (currentLevel - 1)`.
