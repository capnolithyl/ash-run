# Commanders

Ash Run currently defines **10 commanders** in data.

## Starting Availability

Default unlocked set:

- Atlas
- Viper
- Rook

Other commanders are locked for player selection but still valid enemy commanders.

## Commander Model

Each commander has:

- A passive modifier (always active)
- An active power (requires full charge)

Charge behavior:

- Damage dealt grants charge (with commander-specific modifiers possible)
- Damage taken grants charge
- Charge caps at 100 and resets when power is used
- Charge is battle-local (not carried map-to-map)

## Active Power Families (current)

- Team shield
- Team assault
- Team mobility
- Team heal
- Team resupply
- Supply drop (funds + resupply)
- Orbital strike (enemy HP pressure)
