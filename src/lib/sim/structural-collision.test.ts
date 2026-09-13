import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { RapierContext } from "@react-three/rapier";
import { fractureAlongSweep } from "./structural-collision";
import { dockStructuralCells, dockDamageSections } from "./dock-damage";
import { ImpactTracker, type Fracture, type RawImpact } from "./collision-damage";
import { applyVesselImpact, createVesselDamage, stepVesselDamage } from "./vessel-damage";
import { estimateDamageCost, recordPropertyDamage, type PropertyDamageLedger } from "./damage-cost";

// Use precisely the engine version that react-three/rapier loads in the app.
const requireRapier = createRequire(import.meta.resolve("@react-three/rapier"));
const R: RapierContext["rapier"] = await import(requireRapier.resolve("@dimforge/rapier3d-compat"));
await R.init();

function marina(speed: number, solid = false, yaw = 0, mass = 26308) {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const point = (x: number, z: number) => ({ x: 100 + Math.cos(yaw) * x + Math.sin(yaw) * z, y: 0.9, z: 200 - Math.sin(yaw) * x + Math.cos(yaw) * z });
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...Object.values(point(0, 0)) as [number, number, number]).setRotation(rotation).setCcdEnabled(true).enabledRotations(false, true, false));
  world.createCollider(R.ColliderDesc.roundCuboid(1.9, 0.85, 6.4, 0.42).setMass(mass).setFriction(0).setRestitution(0), body);
  const members = new Map<number, Fracture>(), colliderKeys = new Map<string, number>();
  // Three cross-floats followed by solid shore. The hull spans several bays.
  for (let dockIndex = 0; dockIndex < 3; dockIndex++) {
    const dock = { id: `float${dockIndex}`, position: [0, 0] as [number, number], size: [30, 2.5] as [number, number] };
    for (const cell of dockStructuralCells(dock)) {
      const p = point(cell.x, 10 + dockIndex * 12);
      const collider = world.createCollider(R.ColliderDesc.cuboid(cell.width / 2, 1.2, cell.length / 2).setTranslation(p.x, p.y, p.z).setRotation(rotation));
      if (!solid) members.set(collider.handle, cell.fracture!);
      colliderKeys.set(cell.key, collider.handle);
    }
  }
  const shore = point(0, 52);
  world.createCollider(R.ColliderDesc.cuboid(30, 3, 3).setTranslation(shore.x, shore.y, shore.z).setRotation(rotation));
  world.step(); // Populate Rapier's query broad phase.
  body.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
  const hits: RawImpact[] = [], tracker = new ImpactTracker();
  let damage = createVesselDamage(), peakRetained = 0;
  let propertyDamage: PropertyDamageLedger = new Map();
  for (let i = 0; i < 420; i++) {
    const before = hits.length;
    fractureAlongSweep(world, body, mass, world.timestep, (c) => members.get(c.handle), (hit) => {
      hits.push(hit);
      const incident = tracker.register(hit, 16);
      if (incident) {
        damage = applyVesselImpact(damage, incident, 16);
        propertyDamage = recordPropertyDamage(propertyDamage, incident);
      }
    });
    if (hits.length > before) peakRetained = Math.max(peakRetained, Math.hypot(body.linvel().x, body.linvel().z));
    world.step();
  }
  const position = body.translation();
  const distance = (position.x - 100) * Math.sin(yaw) + (position.z - 200) * Math.cos(yaw);
  return { world, body, hits, damage, distance, peakRetained, colliderKeys, propertyDamage };
}

test("a heavy fast hull bursts through multiple floats before the solver; distant bays remain solid", () => {
  const run = marina(15);
  try {
    assert.equal(new Set(run.hits.map((hit) => hit.otherName)).size, 3);
    assert.ok(run.peakRetained > 12, `retained ${run.peakRetained} m/s`);
    assert.ok(run.distance > 34 && run.distance < 44, `stops at shore: ${run.distance}`);
    assert.ok(run.hits.length >= 6);
    for (const hit of run.hits) assert.equal(run.world.getCollider(run.colliderKeys.get(hit.fracture!.key)!)!.isEnabled(), false);
    assert.equal(run.world.getCollider(run.colliderKeys.get("dock:float0/bay:0:0")!)!.isEnabled(), true);
    assert.ok(run.hits.every((hit) => hit.local.z > 6 && Math.abs(hit.local.x) < 2.4));
  } finally { run.world.free(); }
});

test("fender-speed docking and stone breakwaters still stop the boat", () => {
  for (const run of [marina(0.5), marina(15, true), marina(5, false, 0, 800)]) {
    try { assert.equal(run.hits.length, 0); assert.ok(run.distance < 3); }
    finally { run.world.free(); }
  }
});

test("rotated docks fracture at the actual hull contact, and every member counts despite cooldown", () => {
  const run = marina(15, false, Math.PI / 3);
  try {
    assert.equal(new Set(run.hits.map((hit) => hit.otherName)).size, 3);
    assert.ok(run.hits.every((hit) => hit.local.z > 6));
    assert.ok(run.damage.hullIntegrityPct < 20, String(run.damage.hullIntegrityPct));
  } finally { run.world.free(); }
});

test("destroyed members outlive the recent incident window and reset restores precisely the original footprint", () => {
  const dock = { id: "long", position: [0, 0] as [number, number], size: [12, 150] as [number, number] };
  const cells = dockStructuralCells(dock), gone = new Set(cells.slice(0, 60).map((cell) => cell.key));
  const area = (destroyed: ReadonlySet<string>) => dockDamageSections(dock, destroyed).reduce((sum, p) => sum + p.width * p.length, 0);
  assert.equal(area(gone), 1800 - 60 * 9);
  assert.equal(area(new Set()), 1800);
  assert.equal(dockStructuralCells({ ...dock, kind: "breakwater" })[0].fracture, undefined);
});

test("repeated structural rams break the vessel apart and sink it promptly; fresh exercise is intact", () => {
  const run = marina(15);
  try {
    let state = run.damage;
    assert.ok(state.breakup > 0.7);
    for (let i = 0; i < 60 * 30; i++) state = stepVesselDamage(state, 1 / 60, 26308);
    assert.ok(state.breakup >= 0.85); assert.equal(state.sinking, 1); assert.equal(state.fire, 0);
    const cost = estimateDamageCost(state, 750_000, run.propertyDamage);
    assert.equal(cost.vesselUsd, 750_000);
    assert.ok(cost.docksUsd > 50_000, "all physically destroyed bays add to the vessel loss");
    assert.equal(cost.totalUsd, 750_000 + cost.docksUsd);
    assert.equal(createVesselDamage().breakup, 0);
  } finally { run.world.free(); }
});

test("fracture spends energy without deleting tangential momentum or inventing extra speed", () => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  try {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic());
    const hull = world.createCollider(R.ColliderDesc.roundCuboid(1.8, 0.85, 6, 0.42).setMass(26308), body);
    const dock = world.createCollider(R.ColliderDesc.cuboid(20, 1.2, 1).setTranslation(0, 0, 7.55));
    const member: Fracture = { key: "dock:cross", objectName: "dock:cross", workJ: 100000, width: 3, length: 3 };
    world.step();
    body.setLinvel({ x: 4, y: 0, z: 10 }, true);
    const before = 0.5 * 26308 * (4 * 4 + 10 * 10);
    const count = fractureAlongSweep(world, body, 26308, world.timestep, c => c.handle === dock.handle ? member : undefined, () => {});
    assert.equal(count, 1);
    assert.ok(Math.abs(body.linvel().x - 4) < 0.002);
    const after = 0.5 * 26308 * (body.linvel().x ** 2 + body.linvel().z ** 2);
    assert.ok(Math.abs(before - after - member.workJ) < 20);
    assert.equal(fractureAlongSweep(world, body, 26308, world.timestep, () => member, () => assert.fail("cannot break a disabled cell twice")), 0);
    hull.setSensor(true);
    assert.equal(fractureAlongSweep(world, body, 26308, world.timestep, () => member, () => assert.fail()), 0);
  } finally { world.free(); }
});
