# Commanders

Ash Run '84 currently defines **10 commanders** in data.

## Status Note

Commander copy has been updated in the data layer and commander-select overlay first.

- The quotes, passive names, active names, and brief text below match the current design brief.
- The entries below should be treated as current-state commander reference for the prototype.
- Commander behavior is live in simulation; if a commander changes, this doc should be updated alongside the code.
- Rook still represents its current placeholder redesign values rather than a final long-term kit.

## Starting Availability

Default unlocked set:

- Atlas
- Viper
- Rook

Other commanders are locked for player selection but still valid enemy commanders.

Full run clears unlock the next locked commander, one at a time, until the full commander roster is available.

## Commander Model

Each commander currently stores:

- Name
- Title
- Quote
- Accent color
- Passive name and summary
- Active power name and summary
- Power cap (`powerMax`)

Charge behavior in the current prototype:

- Damage dealt grants charge when supported by current mechanics
- Damage taken grants charge
- Charge caps at each commander's `powerMax` value
- Current power caps: Atlas 300, Viper 250, Rook 325, Echo 325, Blaze 350, Knox 275, Falcon 350, Nova 300, Graves 250, Sable 300
- Charge is battle-local and resets when power is used

## Commander Briefs

- **Atlas** - _The Mechanic_
  - Quote: "If it still rolls, it can still win."
  - Passive: **Field Repairs** - All units heal +10% HP at the start of your turn.
  - Active: **Overhaul** - All units recover 33% HP, gain +3 armor for 1 turn, and heal status conditions.
  - Starting squad: Grunt, Runner, Longshot

- **Viper** - _Femme Fatale_
  - Quote: "Hit first, smile last, leave them guessing in between."
  - Passive: **Shock Doctrine** - Infantry and Runners gain +20% attack; other units gain -20% attack.
  - Active: **Blitz Surge** - Infantry and Runners gain +30% attack; Infantry also gain +2 movement for 1 turn.
  - Starting squad: Grunt, Breaker, Longshot

- **Rook** - _The Inheritor_
  - Quote: "A clean ledger wins dirtier wars."
  - Passive: **Estate Claim** - Units gain +30% attack while standing on an owned property.
  - Active: **Hostile Takeover** - For 1 turn, all units gain +5% attack and +5% armor for each owned property. Does not require standing on a property and stacks with Estate Claim. No cap.
  - Starting squad: 2x Grunt, Bruiser

- **Echo** - _The Control Freak_
  - Quote: "The battle is over the moment I decide where you stand."
  - Passive: **Slipstream** - Units can move 1 tile after attacking.
  - Active: **Disruption** - All enemy units get -1 movement and become Corrupted for 1 turn. Corrupted randomly halves one visible stat when applied.
  - Starting squad: Grunt, Longshot, Runner

- **Blaze** - _The Pyromaniac_
  - Quote: "If they wanted mercy, they should've brought rain."
  - Passive: **Scorched Earth** - Deal +10% damage to damaged units.
  - Active: **Ignition** - All enemies take 10% damage and Burn is applied for 1 turn. Burn deals 10% damage at start of turn, leaves units at 1 HP minimum, halves attack for that turn, then clears at end of turn. Infantry can spend their action to extinguish another unit.
  - Starting squad: Grunt, Runner, Runner

- **Knox** - _The Bulwark_
  - Quote: "Let them break themselves on the wall."
  - Passive: **Shield Wall** - Units that do not move double terrain bonuses. They can still attack.
  - Active: **Fortress Protocol** - For 1 turn, terrain bonuses are doubled regardless of movement, and the first combat during the opponent’s turn deals no damage.
  - Starting squad: Grunt, Breaker, Bruiser

- **Falcon** - _The Ace_
  - Quote: "Own the sky and the ground starts asking permission."
  - Passive: **Air Superiority** - Aircraft gain +20% attack and +10% armor.
  - Active: **Reinforcements** - Spawn a Gunship at or near HQ. That Gunship can act immediately.
  - Starting squad: Grunt, Gunship, Longshot

- **Nova** - _The Glass Cannon_
  - Quote: "If you're going to burn bright, make sure they have to look away."
  - Passive: **Full Magazine** - Units gain +20% attack when at full ammo.
  - Active: **Overload** - Units expend all ammo and gain +10% attack per ammo spent this turn.
  - Starting squad: Longshot, Runner, Gunship

- **Graves** - _The Reaper_
  - Quote: "Make it count. Then make sure they stay down."
  - Passive: **Kill Confirm** - Units gain 50% extra combat EXP.
  - Active: **Execution Window** - Units counterattack before being attacked for 1 turn.
  - Starting squad: 2x Grunt, Breaker

- **Sable** - _Lady Luck_
  - Quote: "Chance is just another weapon if you know how to hold it."
  - Passive: **Loaded Dice** - Friendly attacks have a Luck% chance to Crit for double final damage. Friendly units have a Luck% chance to Glance incoming attacks for half final damage.
  - Active: **Lucky Seven** - Until the start of your next turn, Crit and Glance chances use Luck × 10% instead.
  - Starting squad: Grunt, Breaker, Runner
