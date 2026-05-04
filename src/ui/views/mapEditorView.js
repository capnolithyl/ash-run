export function renderMapEditorView(state) {
  const map = state.mapEditor?.mapData;
  if (!map) {
    return `<div class="screen"><section class="panel"><p>No map loaded.</p></section></div>`;
  }
  const rows = map.tiles.map((row,y)=>row.map((tile,x)=>`<button class="skirmish-map-tile skirmish-map-tile--${tile}" data-action="map-editor-paint" data-x="${x}" data-y="${y}">${tile[0].toUpperCase()}</button>`).join("")).join("");
  return `<div class="screen"><section class="panel"><p class="eyebrow">Map Editor</p><h2>${map.name}</h2>
  <div style="display:grid;grid-template-columns:repeat(${map.width},24px);gap:2px;">${rows}</div>
  <div class="panel-footer"><button class="ghost-button" data-action="map-editor-export">Export</button><label class="ghost-button" for="map-editor-import">Import</label><input id="map-editor-import" type="file" data-action="map-editor-import" accept="application/json" /><button class="ghost-button" data-action="back-to-title">Back</button></div>
  </section></div>`;
}
