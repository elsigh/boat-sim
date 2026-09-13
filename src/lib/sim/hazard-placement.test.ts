import assert from "node:assert/strict";
import { test } from "node:test";
import { MARINA_LAYOUTS, getMarinaLayout } from "../marinas";
import { sceneChart } from "../marinas/scene";
import { harborHazardBounds, placeHazards } from "./hazard-placement";

test("all harbor approaches, docking exercises and departures are free of random hazards", () => {
  for (const layout of MARINA_LAYOUTS) {
    for (const spawn of layout.spawns.filter((entry) => entry.range !== "passage")) {
      for (let seed = 1; seed <= 32; seed++) {
        assert.deepEqual(placeHazards(layout, spawn, seed), [], `${layout.id} / ${spawn.id} / seed ${seed}`);
      }
    }
    assert.deepEqual(placeHazards(layout, null, 7), [], "default berth must also be clear");
  }
});

test("passages retain offshore hazards with clearance from every berth, entrance and mooring area", () => {
  const kinds = new Set<string>();
  for (const layout of MARINA_LAYOUTS) {
    const anchors = [
      ...layout.berths.map((berth) => berth.center),
      ...layout.spawns.filter((spawn) => spawn.range !== "passage").map((spawn) => spawn.position),
      ...(layout.buoys ?? []),
      ...(sceneChart(layout)?.structures.filter((structure) => structure.kind === "marina")
        .flatMap((structure) => structure.points) ?? []),
    ];
    let offshoreCount = 0;
    for (const spawn of layout.spawns.filter((entry) => entry.range === "passage")) {
      for (let seed = 1; seed <= 16; seed++) {
        const hazards = placeHazards(layout, spawn, seed);
        offshoreCount += hazards.length;
        for (const hazard of hazards) {
          kinds.add(hazard.kind);
          for (const [x, z] of anchors) {
            assert.ok(Math.hypot(hazard.x - x, hazard.z - z) >= 400,
              `${hazard.kind} too close to ${layout.id}`);
          }
        }
      }
    }
    assert.ok(offshoreCount > 0, `${layout.id} still needs hazards on its offshore passage`);
  }
  assert.deepEqual([...kinds].sort(), ["crab", "kelp", "log"]);
});

test("Roche excludes the mapped marina and entrance without refilling the offshore quota", () => {
  const layout = getMarinaLayout("roche-harbor-marina");
  const bounds = harborHazardBounds(layout)!;
  // World coordinates are mirrored from the authored east-positive layout.
  assert.ok(bounds.minX <= -842.5 && bounds.maxX >= 541);
  assert.ok(bounds.minZ <= -639.4 && bounds.maxZ >= 1019);
  const passage = layout.spawns.find((spawn) => spawn.range === "passage")!;
  const hazards = placeHazards(layout, passage, 1);
  assert.ok(hazards.length > 0 && hazards.length < 20);
  assert.deepEqual(placeHazards(layout, passage, 1), hazards,
    "rerendering or restarting must not relocate the offshore field");
});
