# Ash Run '84 sound effects

These WAV files are deterministic, original synthesized effects generated for Ash Run '84. They are production-usable placeholders and contain no sampled third-party material.

## Replacing an effect

Replace the WAV at the documented path while keeping its filename. Use a 44.1 kHz, 16-bit mono WAV (other browser-supported encodings may work, but the catalog intentionally points to WAV). The generator creates only missing files by default, so running it will not overwrite replacements. After adding or replacing assets, run `npm run assets:preload` so the boot preload manifest has current sizes.

- Generate only missing effects: `npm run sfx:generate`
- Rebuild every synthesized placeholder: `npm run sfx:generate -- --force`
- Runtime mix and routing metadata lives in `src/game/phaser/audio/SfxCatalog.js`.

## Cue catalog

| Cue ID | Replaceable file | Use |
| --- | --- | --- |
| `ui.hover` | `ui/hover.wav` | Enabled menu control hover or manual focus navigation |
| `ui.confirm` | `ui/confirm.wav` | Accept or ordinary enabled menu action |
| `ui.cancel` | `ui/cancel.wav` | Back, cancel, close, resume, revert, redo, or discard |
| `ui.danger` | `ui/danger.wav` | Delete, quit, forfeit, or destructive confirmation |
| `ui.adjust` | `ui/adjust.wav` | Selector, slider, toggle, drawer, tab, or carousel adjustment |
| `battle.cursor` | `ui/grid-cursor.wav` | Restrained gamepad battlefield cursor step |
| `battle.select` | `ui/unit-select.wav` | Unit selected |
| `battle.deselect` | `ui/unit-deselect.wav` | Unit deselected |
| `battle.move-confirm` | `ui/move-confirm.wav` | Validated movement destination selected |
| `battle.targeting` | `ui/target-mode.wav` | Attack or support targeting mode entered |
| `battle.target-confirm` | `ui/target-valid.wav` | Validated movement, attack, or support target chosen |
| `battle.invalid` | `ui/target-invalid.wav` | Invalid battlefield target rejected |
| `movement.infantry` | `movement/infantry-loop.wav` | Infantry movement loop |
| `movement.vehicle` | `movement/wheeled-loop.wav` | Runner and wheeled vehicle movement loop |
| `movement.tracked` | `movement/tracked-loop.wav` | Tracked vehicle movement loop |
| `movement.air` | `movement/air-loop.wav` | Aircraft movement loop |
| `movement.teleport-depart` | `movement/teleport-depart.wav` | Infantry teleport departure |
| `movement.teleport-arrive` | `movement/teleport-arrive.wav` | Infantry teleport arrival |
| `weapon.rifle` | `weapons/rifle.wav` | Rifle-class primary fire |
| `weapon.breaker_charge` | `weapons/breaker-charge.wav` | Breaker charge detonation |
| `weapon.marksman_rifle` | `weapons/marksman-rifle.wav` | Marksman rifle fire |
| `weapon.sidearm` | `weapons/sidearm.wav` | Sidearm fire |
| `weapon.tool_rifle` | `weapons/tool-rifle.wav` | Mechanic tool-rifle fire |
| `weapon.autocannon` | `weapons/autocannon.wav` | Autocannon burst |
| `weapon.bruiser_cannon` | `weapons/bruiser-cannon.wav` | Bruiser cannon fire |
| `weapon.heavy_cannon` | `weapons/heavy-cannon.wav` | Heavy cannon fire |
| `weapon.siege_artillery` | `weapons/siege-artillery.wav` | Siege artillery launch |
| `weapon.flak_cannon` | `weapons/flak-cannon.wav` | Flak cannon burst |
| `weapon.rocket_pods` | `weapons/rocket-pods.wav` | Rocket-pod salvo |
| `weapon.payload_bombs` | `weapons/payload-bombs.wav` | Payload bomb release |
| `weapon.interceptor_cannons` | `weapons/interceptor-cannons.wav` | Interceptor cannon burst |
| `weapon.secondary` | `weapons/secondary-fire.wav` | Secondary weapon fire |
| `weapon.aa` | `weapons/aa-gear.wav` | Anti-air gear attack |
| `impact.hit` | `impact/hit.wav` | Normal weapon impact |
| `impact.crit` | `impact/critical.wav` | Critical impact accent |
| `impact.glance` | `impact/glance.wav` | Glancing impact accent |
| `impact.effective` | `impact/effective.wav` | Super-effective impact accent |
| `impact.miss` | `impact/miss.wav` | Attack misses or deals no damage |
| `impact.destroy` | `impact/destroyed.wav` | Unit destruction after impact |
| `support.medic` | `support/medic.wav` | Medic service |
| `support.mechanic` | `support/mechanic.wav` | Mechanic service |
| `support.field-medpack` | `support/field-medpack.wav` | Field Medpack service |
| `support.command` | `support/hq.wav` | Headquarters service |
| `support.sector` | `support/sector.wav` | Sector building service |
| `support.hospital` | `support/hospital.wav` | Hospital service |
| `support.repair-station` | `support/repair-station.wav` | Repair Station service |
| `support.passive` | `support/passive.wav` | Passive end-turn service |
| `support.run-card` | `support/run-card.wav` | Run-card service effect |
| `support.resupply` | `support/resupply.wav` | Generic ammunition or fuel resupply |
| `transport.board` | `transport/runner-board.wav` | Unit boards a Runner |
| `transport.unload` | `transport/runner-unload.wav` | Unit unloads from a Runner |
| `commander.atlas` | `commander/atlas.wav` | Atlas commander ability |
| `commander.viper` | `commander/viper.wav` | Viper commander ability |
| `commander.rook` | `commander/rook.wav` | Rook commander ability |
| `commander.echo` | `commander/echo.wav` | Echo commander ability |
| `commander.blaze` | `commander/blaze.wav` | Blaze commander ability |
| `commander.knox` | `commander/knox.wav` | Knox commander ability |
| `commander.falcon` | `commander/falcon.wav` | Falcon commander ability |
| `commander.graves` | `commander/graves.wav` | Graves commander ability |
| `commander.nova` | `commander/nova.wav` | Nova commander ability |
| `commander.sable` | `commander/sable.wav` | Sable commander ability |
| `progression.xp` | `progression/xp-gain.wav` | Experience bar sweep |
| `progression.threshold` | `progression/xp-threshold.wav` | Experience threshold crossed |
| `progression.level-up` | `progression/level-up.wav` | Level-up fanfare |
| `progression.stat-up` | `progression/stat-gain.wav` | One changed level-up stat |
| `progression.reward` | `progression/reward.wav` | Reward or unlock revealed |
| `world.turn-player` | `world/turn-player.wav` | Player turn begins |
| `world.turn-enemy` | `world/turn-enemy.wav` | Enemy turn begins |
| `battle.turn-end` | `world/turn-end.wav` | Turn ends |
| `world.capture` | `world/capture.wav` | Building capture completes |
| `world.deploy` | `world/deployment.wav` | Unit deployment |
| `world.reinforcement` | `world/reinforcements.wav` | Reinforcements arrive |
| `world.objective` | `world/objective.wav` | Objective state changes |
| `world.rescue` | `world/rescue.wav` | Rescue target picked up |
| `world.drop-off` | `world/drop-off.wav` | Rescue target delivered |
| `world.sabotage` | `world/sabotage.wav` | Sabotage action completes |
| `world.extinguish` | `world/extinguish.wav` | Burning status extinguished |
| `world.burn` | `world/burn.wav` | Burning status applied |
| `world.status-damage` | `world/status-damage.wav` | Burn or other status damage tick |
| `outcome.victory` | `outcome/victory.wav` | Victory overlay reveal |
| `outcome.defeat` | `outcome/defeat.wav` | Defeat overlay reveal |
| `outcome.run-complete` | `outcome/run-complete.wav` | Full run completion fanfare |
