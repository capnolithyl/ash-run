# Unit Stats

Current normalized unit stat set:

- `maxHealth`
- `attack`
- `armor`
- `armorClass`
- `movement`
- `minRange`
- `maxRange`
- `staminaMax`
- `ammoMax`
- `luck`
- `weaponClass`

Runtime unit state also tracks:

- current HP/ammo/stamina
- level + XP
- move/attack completion flags
- transport state for carried infantry and Runner cargo
- support cooldowns for Medic/Mechanic service actions
- temporary statuses such as attack, shield, mobility, and luck

## Notes

- All units now start from a 100 HP baseline.
- `armorClass` determines which weapon profile matchup applies when the unit is attacked.
- `weaponClass` determines what the unit can target and how it profiles damage into each armor class.
- `minRange/maxRange` controls direct-fire vs indirect-fire behavior.
- `luck` contributes a random additive roll after HP scaling and after armor subtraction.
- Secondary fire always uses the rifle weapon profile for targeting and matchup rules.
- `staminaMax` and `ammoMax` are resupply-sensitive resources.
- XP progression uses percent damage to target max HP plus matchup, level-delta, and kill-bonus modifiers.
- XP needed for the next level is `90 + 30 * (currentLevel - 1)`.
