# Buildings

Current building types:

- **Command Post** (`command`): HQ-style structure, +100 income/turn
- **Sector Node** (`sector`): economy node, +100 income/turn
- **Barracks** (`barracks`): infantry recruitment
- **Motor Pool** (`motor-pool`): vehicle recruitment
- **Airfield** (`airfield`): air recruitment
- **Hospital** (`hospital`): one-time infantry restoration on capture
- **Repair Station** (`repair-station`): one-time vehicle restoration while owned

## Prototype Rules

- Skirmish keeps the classic prototype economy: recruitment happens during battle from owned production buildings, available funds limit purchases, and commander passives can modify recruit costs.
- Run mode no longer lets the player recruit during battle. The enemy still uses owned production buildings and hidden funds to bring in reinforcements.
- Infantry can capture non-owned buildings to flip ownership.
- Run-mode captures award `+2` Intel Credits immediately instead of granting instant funds.
- Sector ownership also provides automatic field servicing for units standing on owned sector tiles: 33% max HP healing, full ammo, and full stamina.
- Hospitals fully restore the capturing infantry once per owner cycle.
- Repair stations fully restore one vehicle standing on the owned station once per owner cycle.
