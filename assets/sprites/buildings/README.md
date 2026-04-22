# Building Tile Set (64px Pixel Art)

This folder contains 64x64 pixel-art building tiles requested for tactical map use.

## Included buildings

- `sector.svg`
- `command.svg`
- `barracks.svg`
- `airfield.svg`
- `motor-pool.svg`
- `hospital.svg`
- `repair-station.svg`

## Name mapping

- "Airport" in request corresponds to `airfield` in game data.
- "Vehicle factory" in request corresponds to `motor-pool` in game data.

## Variant pipeline

- Top-level SVGs are source masters for `scripts/generate-sprite-variants.mjs`.
- Runtime sprites load from generated `player/`, `enemy/`, and `neutral/` owner-color folders.
