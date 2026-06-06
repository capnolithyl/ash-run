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
- Runtime sprites load from the `purple/`, `blue/`, `green/`, `orange/`, and `pink/` color folders.
- Optional unit animation metadata lives at `assets/sprites/units/<unitTypeId>.animations.json`.
- Animated sheets live beside the color SVG in a per-unit folder, such as `purple/grunt/grunt-idle.png`, `purple/grunt/grunt-walk.png`, or `purple/grunt/grunt-attack.png`.
- Metadata defines `frameWidth`, `frameHeight`, and the animation clips to emit from each sheet. Frame sizes can differ by unit.
- Idle and walk use a `ranges.default` clip.
- Attack can use `ranges.left` and `ranges.right`, or a single directional clip if the opposite facing should be mirrored at runtime.
- Color folders can omit any animation sheet. Missing sheets fall back to that color's SVG at runtime.
- A color is enabled in Options after its folder contains a static SVG for every active unit.
- Restart the dev server or run `yarn sprites:sheets` after adding or changing a sheet so the generated manifest can pick it up.
- Static owner SVGs must remain in place as the fallback for units without an animated sheet.
