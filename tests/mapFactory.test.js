import test from "node:test";
import assert from "node:assert/strict";
import { createBattlefield } from "../src/game/content/mapFactory.js";

test("createBattlefield rejects maps without a ground route between command posts", () => {
  assert.throws(
    () =>
      createBattlefield({
        id: "blocked-route",
        name: "Blocked Route",
        theme: "Validation",
        width: 10,
        height: 6,
        riverColumns: [5],
        bridgeRows: []
      }),
    /valid ground route/
  );
});
