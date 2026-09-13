import assert from "node:assert/strict";
import { test } from "node:test";
import { Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
import { appendClippedGeometry, emptyFragment } from "../sim/fracture-geometry";
import { createSmallCraftModel, smallCraftFreeboard, smallCraftScarSurface, smallCraftStyle, type SmallCraftSpec } from "./small-craft-model";

const spec = (lengthM = 10, kind: "power" | "sail" = "power"): SmallCraftSpec => ({
  kind, lengthM, beamM: Math.min(4.4, lengthM * 0.31), hullColor: "#22384c", accentColor: "#1f3a52",
});
const triangles = (g: BufferGeometry) => g.getAttribute("position").count / 3;

test("all marina sizes have finite, bounded models within the per-vessel rendering budget", () => {
  const styles = new Set<string>();
  for (const kind of ["power", "sail"] as const) for (const length of [6.5, 8.5, 10, 11, 12, 15.5]) {
    const vessel = spec(length, kind), meshes = createSmallCraftModel(vessel);
    styles.add(smallCraftStyle(vessel));
    try {
      assert.ok(meshes.length <= 8);
      assert.ok(meshes.reduce((sum, m) => sum + triangles(m.geometry), 0) < 10_000);
      for (const { geometry } of meshes) {
        for (const name of ["position", "normal", "uv"]) assert.ok(Array.from(geometry.getAttribute(name).array).every(Number.isFinite));
        assert.ok(geometry.boundingSphere!.radius > 0);
      }
      const bounds = meshes.find(m => m.finish === "hull")!.geometry.boundingBox!;
      assert.ok(bounds.max.x <= vessel.beamM * 0.501 && bounds.min.x >= -vessel.beamM * 0.501);
      assert.ok(Math.abs(bounds.max.z - length / 2) < 0.00001 && Math.abs(bounds.min.z + length / 2) < 0.00001);
      assert.ok(bounds.min.y < -0.4 && bounds.max.y > smallCraftFreeboard(vessel));
    } finally { for (const m of meshes) m.geometry.dispose(); }
  }
  assert.deepEqual([...styles].sort(), ["express", "flybridge", "pilothouse", "sloop"]);
});

test("the curved hull is visible from outside and the cockpit is recessed through the side deck", () => {
  for (const kind of ["power", "sail"] as const) {
    const vessel = spec(12, kind), parts = createSmallCraftModel(vessel), material = new MeshBasicMaterial();
    const meshes = parts.map(p => { const mesh = new Mesh(p.geometry, material); mesh.name = p.finish; return mesh; });
    try {
      const hull = meshes.find(m => m.name === "hull")!;
      const amidships = new Raycaster(new Vector3(vessel.beamM, 0.15, 0), new Vector3(-1, 0, 0)).intersectObject(hull);
      const bow = new Raycaster(new Vector3(vessel.beamM, 0.15, vessel.lengthM * 0.42), new Vector3(-1, 0, 0)).intersectObject(hull);
      assert.ok(amidships.length && bow.length, "outward hull faces must render and receive collisions/scars");
      assert.ok(bow[0].point.x < amidships[0].point.x * 0.5, "the bow must actually taper");
      const cockpit = new Raycaster(new Vector3(0.07, 20, -vessel.lengthM * 0.30), new Vector3(0, -1, 0)).intersectObjects(meshes);
      assert.equal(cockpit[0].object.name, "teak");
      assert.ok(cockpit[0].point.y < smallCraftFreeboard(vessel) - 0.20);
    } finally { for (const p of parts) p.geometry.dispose(); material.dispose(); }
  }
});

function area(positions: ArrayLike<number>) {
  let total = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i); b.fromArray(positions, i + 3); c.fromArray(positions, i + 6);
    total += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return total;
}

test("hulls, windows, rails and rigging retain their surfaces when clipped into wreck pieces", () => {
  for (const kind of ["power", "sail"] as const) {
    const parts = createSmallCraftModel(spec(10, kind));
    try {
      for (const { geometry, finish } of parts) {
        const fragments = emptyFragment();
        for (const [left, right] of [[-100, 0], [0, 100]]) appendClippedGeometry(geometry, new Matrix4(), 0,
          geometry.attributes.position.count, { left, right, aft: -100, fore: 100 }, fragments);
        const originalArea = area(geometry.attributes.position.array), fracturedArea = area(fragments.positions);
        assert.ok(Math.abs(originalArea - fracturedArea) < Math.max(0.001, originalArea * 0.0001), `${kind} ${finish}`);
        assert.ok(fragments.normals.every(Number.isFinite) && fragments.uvs.every(Number.isFinite));
      }
    } finally { for (const p of parts) p.geometry.dispose(); }
  }
});

test("damage follows the new hull contour and leaves the far side of the hull intact", () => {
  const vessel = spec(), at = smallCraftScarSurface(vessel, vessel.beamM / 2, 0);
  const normal = new Vector3(Math.sin(at.yaw), 0, Math.cos(at.yaw));
  assert.ok(at.x < vessel.beamM / 2 && normal.x > 0.9);
  const bow = smallCraftScarSurface(vessel, vessel.beamM / 2, vessel.lengthM * 0.44);
  assert.ok(bow.x < at.x / 2 && Math.cos(bow.yaw) > normal.z + 0.2);
  const intact = createSmallCraftModel(vessel), damaged = createSmallCraftModel(vessel, true, [{ ...at, radius: 1, severe: true }]);
  try {
    const before = intact.find(m => m.finish === "hull")!.geometry.attributes.position;
    const after = damaged.find(m => m.finish === "hull")!.geometry.attributes.position;
    let changed = 0;
    for (let i = 0; i < before.count; i++) {
      if (before.getX(i) !== after.getX(i)) changed++;
      if (before.getX(i) < -vessel.beamM * 0.25) assert.equal(after.getX(i), before.getX(i));
    }
    assert.ok(changed > 0 && changed < before.count / 2);
  } finally { for (const m of [...intact, ...damaged]) m.geometry.dispose(); }
});
