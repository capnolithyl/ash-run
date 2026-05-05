# Combat System

## Damage Flow

Combat now uses weapon classes against armor classes instead of flat family effectiveness.

Damage is driven by:

1. Weapon attack plus commander/status attack modifiers.
2. Weapon-class `powerMultiplier` for the defender's armor class.
3. Defender base armor multiplied by the weapon profile's `armorMultiplier`.
4. Defender commander/status armor plus one positional armor bonus.
5. Attacker HP scaling.
6. Small additive luck that does not scale with HP.
7. Final AA-kit air penalty when applicable.

Minimum final damage is `0`.

## Exact Formula

Given attacker **A** and defender **D**:

1. `targetProfile = weaponProfile(A.weaponClass, D.armorClass)`
2. `modifiedAttack = activeWeapon.attack + attackModifier(A)`
3. `profiledAttack = round(modifiedAttack * targetProfile.powerMultiplier)`
4. `baseArmor = round(D.stats.armor * targetProfile.armorMultiplier)`
5. `positionArmor = buildingArmor(D) > 0 ? buildingArmor(D) : terrainArmor(D)`
6. `armor = baseArmor + armorModifier(D) + positionArmor`
7. `fullHpBaseDamage = max(0, profiledAttack - armor)`
8. `scaledDamage = round(fullHpBaseDamage * max(0, A.current.hp / A.stats.maxHealth))`
9. `roll = randomInt(0, A.stats.luck + luckModifier(A))` inclusive
10. `damage = round((scaledDamage + roll) * antiAirGearPenalty)`
11. `finalDamage = max(0, damage)`

Key rules:

- Armor is subtracted before HP scaling.
- Luck is added after HP scaling.
- Luck does not scale down with low HP.
- Weapon armor multipliers only affect `defender.stats.armor`.
- Terrain, building, commander, and status armor are added after profiling.

## Weapons and Targeting

- Primary attacks use the unit's listed `weaponClass` and consume ammo.
- Empty-ammo units switch to secondary fire with:
  - `attack = floor(primaryAttack * 0.55)`, minimum `1`
  - range `1`
  - no ammo cost
  - `WEAPON_CLASSES.RIFLE` for targeting and matchup rules
- Longshot and Siege Gun still use min-range indirect fire on primary attacks.
- Longshot and Siege Gun can counter ranged attacks if the attacker is inside their legal range band.
- Longshot and Siege Gun do not counter melee attackers because melee range is below their primary `minRange`.

## Position Armor

- Buildings override terrain armor instead of stacking with it.
- Any building gives `+3` armor.
- Command posts give `+4` armor.
- Air units ignore terrain and building armor.

## Air Rules

- Ground weapons only attack air if their weapon profile supports it.
- AA Kit still lets equipped infantry target air with reduced final damage.
- Skyguard attacks ground and air.
- Interceptor attacks air only.
- Payload attacks ground only.
- Gunship attacks ground and other Gunships, but not Payloads or Interceptors.

## Support Actions

- Medics support adjacent infantry.
- Mechanics support adjacent vehicles.
- Support restores 50% max HP, full ammo, and full stamina.
- Medics receive a 2-turn support cooldown; mechanics receive a 3-turn support cooldown.

## Combat Outcomes

- Units at `0` HP are removed.
- Combat XP is based on `damageDealt / defender.stats.maxHealth`.
- Kills add a flat bonus before matchup and level-delta multipliers are applied.
- Zero-damage attacks grant `0` XP.
- Siege Gun can still move and attack in the current prototype.
