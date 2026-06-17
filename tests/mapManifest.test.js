import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { generateMapManifest } from "../scripts/generate-map-manifest.shared.mjs";

test("map manifest generation includes nested map files under map-family folders", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ash-run-map-manifest-"));
  const mapsRoot = path.join(tempRoot, "src/game/content/maps");
  const nestedMapPath = path.join(mapsRoot, "crossfire-creek", "crossfire-creek.json");
  const flatMapPath = path.join(mapsRoot, "river-city.json");

  try {
    await fs.mkdir(path.dirname(nestedMapPath), { recursive: true });
    await fs.writeFile(
      flatMapPath,
      JSON.stringify({ id: "river-city", name: "River City", width: 8, height: 8 }, null, 2),
      "utf8"
    );
    await fs.writeFile(
      nestedMapPath,
      JSON.stringify({
        format: "ash-run-map-bundle-v1",
        id: "crossfire-creek",
        name: "Crossfire Creek",
        stages: [{ id: "crossfire-creek-stage-2", name: "Crossfire Creek", width: 8, height: 8, stage: 2 }]
      }, null, 2),
      "utf8"
    );

    await generateMapManifest({ root: tempRoot });

    const output = await fs.readFile(
      path.join(tempRoot, "src/game/content/maps.generated.js"),
      "utf8"
    );

    assert.match(output, /\.\/maps\/river-city\.json/);
    assert.match(output, /\.\/maps\/crossfire-creek\/crossfire-creek\.json/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
