# Unit Sprite Set (64px Pixel Art)

This folder contains first-pass 64x64 pixel-art-style SVG sprites for every unit in `UNIT_CATALOG`.

## Goals

- Distinct silhouette per unit so recognition does not rely on text labels.
- Family consistency across Infantry, Vehicle, and Air units.
- Readability on dark tactical maps.

## Unit silhouette cues

- **Infantry**: upright body, visible head/helmet, handheld gear.
- **Vehicle**: horizontal chassis + wheel/tread blocks.
- **Air**: wings/fuselage profiles with no ground wheels.

## Files

- `grunt.svg`
- `breaker.svg`
- `longshot.svg`
- `medic.svg`
- `mechanic.svg`
- `runner.svg`
- `bruiser.svg`
- `juggernaut.svg`
- `siege-gun.svg`
- `skyguard.svg`
- `gunship.svg`
- `payload.svg`
- `interceptor.svg`
- `carrier.svg`

## Variant pipeline

- Top-level SVGs are source masters for `scripts/generate-sprite-variants.mjs`.
- Runtime sprites load from generated `player/` and `enemy/` owner-color folders.
- Optional animated unit sheets live beside the owner SVG in a per-unit folder, such as `player/bruiser/bruiser.png`.
- Animated sheets use 64x64 frames in row-major order. Trailing transparent frames are ignored so partially filled sheets do not flash empty frames. Restart the dev server or run `yarn sprites:sheets` after adding one so the generated manifest can pick it up.
- Static owner SVGs must remain in place as the fallback for units without an animated sheet.
