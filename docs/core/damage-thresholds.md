# Damage Thresholds

Use `node scripts/damage-formula-test.mjs` to print the full neutral full-HP matchup table from the live combat resolver.

These thresholds are the main sanity checks for the current damage model. All values assume:

- neutral commanders
- road tiles
- no buildings
- full HP
- default luck
- valid attack distance for the attacker

| Matchup                  | Trade                    |
| ------------------------ | ------------------------ |
| Grunt vs Grunt           | 56% - 59% vs 23% - 28%  |
| Grunt vs Runner          | 11% - 14% vs 61% - 66%  |
| Breaker vs Grunt         | 64% - 67% vs 16% - 20%  |
| Breaker vs Runner        | 73% - 76% vs 16% - 21%  |
| Breaker vs Bruiser       | 46% - 49% vs 37% - 42%  |
| Breaker vs Juggernaut    | 17% - 20% vs 86% - 92%  |
| Longshot vs Grunt        | 68% - 71% vs 0%         |
| Longshot vs Longshot     | 60% - 63% vs 22% - 27%  |
| Longshot vs Siege Gun    | 33% - 36% vs 52% - 57%  |
| Runner vs Grunt          | 71% - 74% vs 3% - 6%    |
| Runner vs Runner         | 38% - 41% vs 22% - 27%  |
| Runner vs Bruiser        | 6% - 9% vs 66% - 71%    |
| Bruiser vs Runner        | 72% - 75% vs 2% - 5%    |
| Bruiser vs Bruiser       | 55% - 58% vs 23% - 28%  |
| Bruiser vs Juggernaut    | 8% - 11% vs 73% - 77%   |
| Juggernaut vs Grunt      | 112% - 114% vs 0%       |
| Juggernaut vs Juggernaut | 54% - 56% vs 24% - 27%  |
| Siege Gun vs Grunt       | 89% - 92% vs 0%         |
| Siege Gun vs Juggernaut  | 50% - 53% vs 0%         |
| Skyguard vs Gunship      | 119% - 122% vs 0%       |
| Skyguard vs Payload      | 82% - 85% vs 16% - 21%  |
| Skyguard vs Interceptor  | 70% - 73% vs 0%         |
| Gunship vs Skyguard      | 63% - 66% vs 40% - 47%  |
| Gunship vs Gunship       | 58% - 61% vs 23% - 27%  |
| Payload vs Juggernaut    | 101% - 103% vs 0%       |
| Interceptor vs Gunship   | 106% - 109% vs 0%       |
| Interceptor vs Interceptor | 61% - 64% vs 22% - 27% |

Illegal targets should report `N/A` in the generated table:

- most ground units vs air
- Payload vs any air unit
- Interceptor vs any ground unit
- Carrier vs everything
