import assert from "node:assert/strict";
import { test } from "node:test";
import { closingSpeedAtContact, ImpactTracker, severityForClosingSpeed } from "./collision-damage";
import { applyVesselImpact, createVesselDamage, damageHandling, damagePose, stepVesselDamage } from "./vessel-damage";
import { dockDamageSections, dockStructuralCells } from "./dock-damage";
import type { DockFloat } from "../marinas/types";

const hit = (knots: number, local = { x: 2, z: 0 }, object = "dock:test") => new ImpactTracker().register({
  otherName: object, closingSpeedMps: knots * 0.514444, world: { x: 1, z: 2 }, local, atMs: 1000,
}, 16)!;

test("impacts measure relative normal speed, including a rotating bow", () => {
  const zero = { x: 0, z: 0 }, normal = { x: 1, z: 0 }, bow = { x: 0, z: 7 };
  assert.equal(closingSpeedAtContact({ x: 2, z: 0 }, 0, bow, { x: -3, z: 0 }, normal), 5);
  assert.equal(closingSpeedAtContact({ x: 2, z: 0 }, 0, bow, { x: 2, z: 0 }, normal), 0);
  assert.equal(closingSpeedAtContact({ x: 0, z: 10 }, 0, bow, zero, normal), 0, "parallel sliding is not a 20-knot ram");
  assert.ok(Math.abs(closingSpeedAtContact(zero, 0.2, bow, zero, normal) - 1.4) < 1e-9);
  assert.equal(closingSpeedAtContact({ x: -2, z: 0 }, 0, bow, zero, normal), 0, "separating contact adds no damage");
});

test("fender touches and resting contacts do not rack up damage; reset rearms the same object", () => {
  const tracker = new ImpactTracker();
  const contact = { otherName: "dock:a", closingSpeedMps: 0.1, world: { x: 0, z: 0 }, local: { x: 2, z: 0 }, atMs: 0 };
  assert.equal(tracker.register(contact, 16), null);
  contact.closingSpeedMps = 1;
  const first = tracker.register(contact, 16)!;
  assert.ok(first);
  assert.equal(tracker.register({ ...contact, atMs: 1000 }, 16), null);
  tracker.reset();
  assert.ok(tracker.register({ ...contact, atMs: 1001 }, 16)!.id > first.id);
  assert.equal(severityForClosingSpeed(NaN), null);
  assert.equal(severityForClosingSpeed(Infinity), null);
});

test("ordinary docking mistakes stay cosmetic and never turn into delayed fires or sinking", () => {
  let damage = createVesselDamage();
  for (let i = 0; i < 5; i++) damage = applyVesselImpact(damage, hit(1.3), 16);
  assert.ok(damage.hullIntegrityPct < 100);
  const later = stepVesselDamage(damage, 600, 26308);
  assert.equal(later.breach, 0); assert.equal(later.fire, 0); assert.equal(later.floodingPct, 0);
  assert.equal(damageHandling(later).portPower, 1);
});

test("hard bow impacts breach the hull without igniting the machinery space", () => {
  const damage = applyVesselImpact(createVesselDamage(), hit(10, { x: 0, z: 7 }), 16);
  assert.ok(damage.breach > 0); assert.equal(damage.fire, 0);
  assert.equal(damage.portDamage, 0); assert.equal(damage.starboardDamage, 0);
  const flooded = stepVesselDamage(damage, 1, 26308);
  assert.ok(flooded.floodingPct > 0 && flooded.floodingPct < 30);
  assert.ok(damagePose(flooded, 16).pitch > 0, "bow settles first");
});

test("machinery-space rams damage the struck drive, ignite, then flooding extinguishes the fire and disables propulsion", () => {
  let damage = applyVesselImpact(createVesselDamage(), hit(9, { x: 2, z: -4 }), 16);
  assert.ok(damage.fire > 0);
  assert.ok(damageHandling(damage).portPower < damageHandling(damage).starboardPower);
  for (let i = 0; i < 120 * 60; i++) damage = stepVesselDamage(damage, 1 / 60, 26308);
  assert.equal(damage.sinking, 1); assert.equal(damage.fire, 0);
  assert.equal(damageHandling(damage).portPower, 0); assert.equal(damageHandling(damage).starboardPower, 0);
  assert.ok(damagePose(damage, 16).roll < 0, "port side settles toward the breach");
  assert.ok(damagePose(damage, 16).sinkDepth > 8);
  assert.equal(stepVesselDamage(damage, 60, 26308), damage);
  assert.deepEqual(createVesselDamage(), { hullIntegrityPct: 100, floodingPct: 0, breach: 0, fire: 0, portDamage: 0, starboardDamage: 0, listBias: 0, trimBias: 0, sinking: 0, breakup: 0 });
});

test("flooding respects pause, vessel size, and frame rate", () => {
  const start = applyVesselImpact(createVesselDamage(), hit(6, { x: -2, z: 5 }), 16);
  assert.equal(stepVesselDamage(start, 0, 26308), start);
  const run = (hz: number, mass = 26308) => {
    let state = start;
    for (let i = 0; i < hz * 5; i++) state = stepVesselDamage(state, 1 / hz, mass);
    return state;
  };
  const a = run(30), b = run(120);
  assert.ok(Math.abs(a.floodingPct - b.floodingPct) < 0.1);
  assert.ok(run(60, 3000).floodingPct > run(60, 160000).floodingPct * 2);
});

test("repeated major collisions can overwhelm a compromised hull", () => {
  let damage = createVesselDamage();
  for (let i = 0; i < 5; i++) damage = applyVesselImpact(damage, hit(3.2), 16);
  assert.ok(damage.breach > 0); assert.equal(damage.fire, 0);
});

test("a finger dock loses only the failed bay, and restarting restores its full footprint", () => {
  const dock: DockFloat = { id: "test", position: [0, 0], size: [2, 20], rotationDeg: 0 };
  const intact = dockDamageSections(dock, new Set());
  const broken = dockDamageSections(dock, new Set([dockStructuralCells(dock)[3].key]));
  const area = (parts: ReturnType<typeof dockDamageSections>) => parts.reduce((n, p) => n + p.width * p.length, 0);
  assert.equal(area(intact), 40); assert.ok(Math.abs(area(broken) - (40 - 40 / 7)) < 1e-6);
  assert.ok(broken.every((part) => Math.abs(part.z) >= part.length / 2 + 1.4));
  assert.deepEqual(dockDamageSections(dock, new Set()), intact);
  assert.equal(area(dockDamageSections(dock, new Set())), 40);
});

test("damage follows rotated dock coordinates and never punches through a stone breakwater", () => {
  const dock: DockFloat = { id: "test", position: [20, 30], size: [2, 20], rotationDeg: 90 };
  const destroyed = new Set([dockStructuralCells(dock)[3].key]);
  const sections = dockDamageSections(dock, destroyed);
  assert.ok(Math.abs(sections.reduce((n, p) => n + p.width * p.length, 0) - (40 - 40 / 7)) < 1e-6);
  assert.deepEqual(dockDamageSections({ ...dock, kind: "breakwater" }, destroyed), [{ x: 0, z: 0, width: 2, length: 20 }]);
});

test("catastrophic repeated bow rams ignite torn machinery, while a single bow breach stays fire-free", () => {
  const bow = { x: 0, z: 7 };
  const first = applyVesselImpact(createVesselDamage(), hit(12, bow), 16);
  assert.equal(first.fire, 0);
  const broken = applyVesselImpact(first, hit(12, bow), 16);
  assert.ok(broken.breakup >= 0.65 && broken.fire >= 0.45);
  const submerged = applyVesselImpact({ ...first, floodingPct: 70 }, hit(12, bow), 16);
  assert.equal(submerged.fire, 0);
  const machinery = applyVesselImpact(createVesselDamage(), hit(12, {x: 2, z: -4}), 16);
  assert.ok(machinery.fire >= 0.45);
});
