import assert from "node:assert/strict";
import { test } from "node:test";
import { chartDepthMeters } from "../charts";
import { pointInRing } from "../charts/geometry";
import { getMarinaLayout } from "./index";
import { sceneChart, sceneDocks } from "./scene";
import type { Vec2 } from "./types";

function rectangle(center: Vec2, width: number, length: number, heading: number): Vec2[] {
  const angle = heading * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [
    center[0] + x * width / 2 * c + z * length / 2 * s,
    center[1] - x * width / 2 * s + z * length / 2 * c,
  ]);
}

function overlap(a: Vec2[], b: Vec2[]) {
  for (const points of [a, b]) for (let i = 0; i < 2; i++) {
    const next = points[i + 1];
    const axis = [next[1] - points[i][1], points[i][0] - next[0]];
    const project = (poly: Vec2[]) => poly.map(([x, z]) => x * axis[0] + z * axis[1]);
    const ap = project(a), bp = project(b);
    if (Math.max(...ap) <= Math.min(...bp) || Math.max(...bp) <= Math.min(...ap)) return false;
  }
  return true;
}

test("Roche practice berths have clear footprints in water, including the added fingers", () => {
  const layout = getMarinaLayout("roche-harbor-marina"), chart = sceneChart(layout)!;
  const docks = sceneDocks(layout);
  assert.ok(docks.filter((dock) => dock.id.includes("-finger-")).length > 150);
  for (const berth of layout.berths) {
    const footprint = rectangle(berth.center, berth.widthM, berth.lengthM, berth.headingDeg);
    for (const dock of docks) assert.ok(!overlap(footprint, rectangle(dock.position, ...dock.size, dock.rotationDeg ?? 0)), `${berth.id} intersects ${dock.id}`);
    for (const [x, z] of [...footprint, berth.center]) {
      assert.ok(chartDepthMeters(chart, x, z) > 1.5, `${berth.id} too shallow`);
      assert.ok(!chart.land.some((ring) => !ring.hole && pointInRing(ring.points, x, z)));
    }
  }
});

test("I-9 departure uses the same bow-in pose as its arrival target", () => {
  const layout = getMarinaLayout("roche-harbor-marina");
  const berth = layout.berths.find((b) => b.id === "roche-i9")!;
  const departure = layout.spawns.find((s) => s.kind === "departure")!;
  assert.deepEqual(departure.position, berth.center);
  assert.equal(departure.yawDeg, berth.headingDeg);
  assert.ok(berth.headingDeg < -138 && berth.headingDeg > -140);
});
