# Commanders

Ash Run '84 currently defines **10 commanders** in data.

## Status Note

Commander copy has been updated in the data layer and commander-select overlay first.

- The quotes, passive names, active names, and brief text below match the current design brief.
- Not every mechanic described below is implemented in simulation yet.
- Commander mechanics will be updated one by one in later passes.
- Atlas now matches his current passive and active design in simulation.

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
- Charge caps at each commander's `powerMax` value, currently defaulting to 70 for all commanders
- Charge is battle-local and resets when power is used

## Commander Briefs

- **Atlas** - *The Mechanic*
  - Quote: "If it still rolls, it can still win."
  - Passive: **Field Repairs** - All units heal +1 HP at the start of your turn.
  - Active: **Overhaul** - All units recover 50% HP and gain +2 armor for 1 turn.
  - Starting squad: Grunt, Runner, Longshot

- **Viper** - *Femme Fatale*
  - Quote: "Hit first, smile last, leave them guessing in between."
  - Passive: **Shock Doctrine** - Infantry and Runners gain +2 attack; other units gain -2 attack.
  - Active: **Blitz Surge** - Infantry and Runners gain +3 attack; Infantry also gain +2 movement for 1 turn.
  - Starting squad: Grunt, Breaker, Longshot

- **Rook** - *The Inheritor*
  - Quote: "A clean ledger wins dirtier wars."
  - Passive: **War Budget** - +200 funds per turn; cannot resupply units.
  - Active: **Liquidation** - Spend all funds. All units gain +1 attack per 300 funds spent.
  - Starting squad: 2x Grunt, Bruiser

- **Echo** - *The Control Freak*
  - Quote: "The battle is over the moment I decide where you stand."
  - Passive: **Slipstream** - Units can move 1 tile after attacking.
  - Active: **Disruption** - All enemy units get -1 movement for 1 turn.
  - Starting squad: Grunt, Longshot, Runner

- **Blaze** - *The Pyromaniac*
  - Quote: "If they wanted mercy, they should've brought rain."
  - Passive: **Scorched Earth** - Deal +1 damage to damaged units.
  - Active: **Ignition** - All enemies take 10% damage and Burn is applied for 1 turn.
  - Starting squad: Grunt, Runner, Runner

- **Knox** - *The Bulwark*
  - Quote: "Let them break themselves on the wall."
  - Passive: **Shield Wall** - Units that do not move double terrain bonuses.
  - Active: **Fortress Protocol** - For 1 turn, terrain bonuses are doubled regardless of movement and the first combat deals no damage.
  - Starting squad: Grunt, Breaker, Bruiser

- **Falcon** - *The Ace*
  - Quote: "Own the sky and the ground starts asking permission."
  - Passive: **Air Superiority** - Aircraft gain +2 attack and +1 armor.
  - Active: **Reinforcements** - Spawn a Gunship at or near HQ. That Gunship can act immediately.
  - Starting squad: Grunt, Gunship, Longshot

- **Nova** - *The Glass Cannon*
  - Quote: "If you're going to burn bright, make sure they have to look away."
  - Passive: **Full Magazine** - Units gain +2 attack when at full ammo.
  - Active: **Overload** - Units expend all ammo and gain +1 attack per ammo spent this turn.
  - Starting squad: Longshot, Runner, Gunship

- **Graves** - *The Reaper*
  - Quote: "Make it count. Then make sure they stay down."
  - Passive: **Kill Confirm** - Units gain 50% extra EXP when killing an enemy.
  - Active: **Execution Window** - Units counterattack before being attacked for 1 turn.
  - Starting squad: 2x Grunt, Breaker

- **Sable** - *Lady Luck*
  - Quote: "Chance is just another weapon if you know how to hold it."
  - Passive: **Loaded Dice** - All units gain +1 luck.
  - Active: **Lucky Seven** - Luck range is doubled for 1 turn.
  - Starting squad: Grunt, Breaker, Runner
