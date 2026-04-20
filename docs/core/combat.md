# Combat System

## Damage Formula

Damage = Attack + rand(0, Luck) - Armor

## Example

Attack = 10
Luck = 5
Armor = 3

Damage = 10 + rand(0–5) - 3

## Effective Damage

- Certain units deal bonus damage
- Effective = double attack before calculation

## Effectiveness

| Unit        | Effective Against                       |
| ----------- | --------------------------------------- |
| Longshots   | Grunts, Breakers, Longshots             |
| Breakers    | All Vehicles                            |
| Runners     | Grunts, Breakers, Longshots             |
| Bruiser     | Runners, Bruisers, Skyguard, Siege Gun  |
| Juggernaut  | All Vehicles                            |
| Siege Gun   | Runners, Bruisers, Juggernaut, Skyguard |
| Skyguard    | All Air Units                           |
| Gunship     | Runners, Bruisers, Siege Gun            |
| Payload     | All Land Units                          |
| Interceptor | All Air Units                           |
| Carrier     | Cannot attack                           |

## Special Rules

- Siege Gun can move and attack
- Luck introduces randomness
- Stamina and ammo add resource management
