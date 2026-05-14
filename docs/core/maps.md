# Maps

## Current Pool

- 20 authored battlefields.
- Compact, standard, and large boards with mixed east-west, north-south, corner, and center-ring deployments.
- Themes currently include ash, storm, dusk, and frost variants.

## Common Features

- Terrain mixes: road, forest, mountain, ridge, water, plain
- At least two neutral economy points on every map
- Hospital and repair station service objectives on every map
- Board sizes range from quick skirmish maps to wide, multi-front encounters
- Wider central route/bridge bands to avoid single-tile stall points
- Variable player production building assignments
- Every map exports a single goal definition through `map.goal`

## Goal Schema

- `map.goal.type`: `rout`, `hq-capture`, `rescue`, `defend`, or `survive`
- `map.goal.target`: `{ x, y }` for `rescue` and `defend`
- `map.goal.turnLimit`: positive integer for `defend` and `survive`

## Run Usage

- A run shuffles map IDs into a sequence.
- The active run consumes maps by index until clear or defeat.
