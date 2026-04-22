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
- `luck` contributes a random additive attack roll.
- `staminaMax` and `ammoMax` are resupply-sensitive resources.
