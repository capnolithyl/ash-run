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

- Recruitment happens during battle from owned production buildings.
- Recruitment is limited by available funds and roster cap.
- Commander passives can modify recruit costs.
- Infantry can capture non-owned buildings to flip ownership.
- Sectors grant +100 funds immediately on capture in addition to turn income.
- Sector ownership also provides automatic field servicing for units standing on owned sector tiles: 33% max HP healing, full ammo, and full stamina.
- Hospitals fully restore the capturing infantry once per owner cycle.
- Repair stations fully restore one vehicle standing on the owned station once per owner cycle.
