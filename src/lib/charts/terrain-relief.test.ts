import assert from "node:assert/strict";
import { test } from "node:test";
import { getWorldChart } from "./index";
import { pointInRing } from "./geometry";
import { buildTerrainRelief, terrainHeightAt } from "./terrain-relief";
import type { ChartData, ChartPoint } from "./types";

test("relief preserves a concave shoreline and lagoon with upward, finite faces", () => {
  const outer: ChartPoint[] = [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]];
  const lagoon: ChartPoint[] = [[10, 10], [10, 30], [30, 30], [30, 10]];
  const chart: ChartData = {
    id: "test", name: "test", origin: { lat: 0, lon: 0 }, halfWidthM: 100, halfHeightM: 100,
    contours: [], soundings: [], labels: [], structures: [],
    land: [{ points: outer, hole: false, areaM2: 7500 }, { points: lagoon, hole: true, areaM2: 400 }],
    depth: { cols: 2, rows: 2, cellXM: 100, cellZM: 100, data: Buffer.from(new Int16Array([-300, -300, -300, -300]).buffer).toString("base64") },
  };
  const geometry = buildTerrainRelief(chart, 12);
  try {
    const p = geometry.attributes.position, normals = geometry.attributes.normal, index = geometry.index!;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
      const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      assert.ok(pointInRing(outer, x, z));
      assert.ok(!pointInRing(lagoon, x, z));
      const cross = (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a));
      assert.ok(cross < 0, "front face must point up");
      area += -cross / 2;
    }
    assert.ok(Math.abs(area - 7100) < 0.01, `shoreline area changed: ${area}`);
    for (let i = 0; i < p.count; i++) {
      assert.ok(Number.isFinite(p.getY(i)) && p.getY(i) >= 0.55 - 1e-6);
      assert.ok(Number.isFinite(normals.getY(i)) && normals.getY(i) > 0);
    }
    assert.equal(terrainHeightAt(chart, 0, 50), 0.55);
    assert.ok(terrainHeightAt(chart, 25, 70) > 10, "interior should rise above the beach");
    assert.equal(terrainHeightAt(chart, 10, 20), 0.55, "lagoon banks meet water too");
  } finally { geometry.dispose(); }
});

test("Roche hill house sits above the waterfront on the existing elevation raster", () => {
  const chart = getWorldChart("roche-harbor-marina")!;
  assert.ok(terrainHeightAt(chart, -581, -123) > 30);
  assert.ok(terrainHeightAt(chart, -387, -147) < 12);
});
