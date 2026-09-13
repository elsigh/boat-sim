import assert from "node:assert/strict";
import { test } from "node:test";
import { BOAT_CATALOG, DEFAULT_BOAT_SLUG } from "../boats/catalog";
import { ImpactTracker, type ImpactIncident } from "./collision-damage";
import { estimateDamageCost, estimateVesselDamageCost, recordPropertyDamage, recordTargetVesselDamage, type PropertyDamageLedger } from "./damage-cost";
import { applyTargetVesselImpact, createVesselDamage, stepVesselDamage } from "./vessel-damage";
import { smallCraftAsset } from "../boats/valuation";

const value = BOAT_CATALOG.find((boat) => boat.profileSlug === DEFAULT_BOAT_SLUG)!.economics!.replacementValueUsd!;
const impact = (overrides: Partial<ImpactIncident> = {}): ImpactIncident => ({
  ...new ImpactTracker().register({ otherName: "dock:test", closingSpeedMps: 8,
    world: { x: 0, z: 0 }, local: { x: 0, z: 7 }, atMs: 0 }, 16)!, ...overrides,
});
const brokenBay = (key: string, objectName = "dock:test") => impact({ objectName,
  fracture: { key, objectName, width: 2, length: 3, workJ: 100_000 },
});

test("a destroyed, sinking or broken-up Bonum Vitae is a $750,000 total loss", () => {
  assert.equal(value, 750_000);
  for (const loss of [{ hullIntegrityPct: 0 }, { sinking: 0.01 }, { sinking: 1 }, { breakup: 0.8 }]) {
    const cost = estimateDamageCost({ ...createVesselDamage(), ...loss }, value, new Map());
    assert.equal(cost.totalLoss, true);
    assert.equal(cost.vesselUsd, value);
  }
});

test("minor repairs stay affordable; flooded machinery can make repair uneconomic", () => {
  const pristine = createVesselDamage();
  const scratch = estimateDamageCost({ ...pristine, hullIntegrityPct: 98 }, value, new Map());
  assert.equal(estimateDamageCost(pristine, value, new Map()).totalUsd, 0);
  assert.equal(scratch.totalLoss, false);
  assert.ok(scratch.totalUsd > 0 && scratch.totalUsd < 2_000);
  const damaged = { ...pristine, hullIntegrityPct: 25, floodingPct: 60, portDamage: 1, starboardDamage: 1, breach: 0.8 };
  assert.equal(estimateDamageCost(damaged, value, new Map()).vesselUsd, value);
  assert.equal(estimateDamageCost({ ...damaged, fire: 0.8 }, value, new Map()).totalUsd,
    estimateDamageCost({ ...damaged, fire: 0 }, value, new Map()).totalUsd, "extinguishing flames does not repair damage");
});

test("dock bays and pilings add to a total loss, with each destroyed member billed once", () => {
  const first = brokenBay("dock:test/bay:0:0");
  let ledger = recordPropertyDamage(new Map(), first);
  assert.equal(recordPropertyDamage(ledger, first), ledger);
  ledger = recordPropertyDamage(ledger, brokenBay("dock:test/bay:0:1"));
  ledger = recordPropertyDamage(ledger, impact({ objectName: "piling:a", surface: "piling",
    fracture: { key: "piling:a", objectName: "piling:a", width: 0.4, length: 4, workJ: 85_000 } }));
  const cost = estimateDamageCost({ ...createVesselDamage(), sinking: 1 }, value, ledger);
  assert.equal(cost.vesselUsd, 750_000);
  assert.equal(cost.docksUsd, 35_000);
  assert.equal(cost.totalUsd, 785_000);
});

test("replacing a member supersedes its earlier repair and charges larger bays more", () => {
  let ledger = recordPropertyDamage(new Map(), impact({ severity: "minor" }));
  ledger = recordPropertyDamage(ledger, brokenBay("dock:test/bay:0:0"));
  assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).docksUsd, 10_000);
  const larger = brokenBay("dock:large/bay:0:0", "dock:large");
  larger.fracture = { ...larger.fracture!, width: 3, length: 3 };
  assert.ok(estimateDamageCost(createVesselDamage(), value, recordPropertyDamage(new Map(), larger)).docksUsd > 10_000);
});

test("a piling that snaps just after a bump still registers its replacement cost", () => {
  const tracker = new ImpactTracker();
  const raw = { otherName: "piling:a", world: { x: 0, z: 0 }, local: { x: 0, z: 7 }, atMs: 0, closingSpeedMps: 1 };
  let ledger = recordPropertyDamage(new Map(), tracker.register(raw, 16)!);
  const fracture = tracker.register({ ...raw, atMs: 100, closingSpeedMps: 8,
    fracture: { key: "piling:a", objectName: "piling:a", width: 0.4, length: 4, workJ: 85_000 } }, 16);
  assert.ok(fracture, "contact cooldown must not suppress a new structural failure");
  ledger = recordPropertyDamage(ledger, fracture);
  assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).docksUsd, 15_000);
});

test("the bill outlives the 40-incident feed and a fresh exercise clears all costs", () => {
  let ledger: PropertyDamageLedger = new Map();
  let feed: ImpactIncident[] = [];
  for (let i = 0; i < 65; i++) {
    const hit = brokenBay(`dock:test/bay:${i}:0`);
    ledger = recordPropertyDamage(ledger, hit);
    feed = [...feed.slice(-39), hit];
  }
  assert.equal(feed.length, 40);
  assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).docksUsd, 650_000);
  assert.equal(estimateDamageCost(createVesselDamage(), value, new Map()).totalUsd, 0);
});

test("other boats are separate from dock costs and shore impacts don't invent property bills", () => {
  const hit = impact({ surface: "moored", objectName: "moored:yacht",
    targetVessel: { lengthM: 12, beamM: 4, replacementValueUsd: 300_000 },
    fracture: { key: "moored:yacht", objectName: "moored:yacht", width: 4, length: 12, workJ: 500_000 } });
  const ledger = recordPropertyDamage(new Map(), hit);
  const cost = estimateDamageCost({ ...createVesselDamage(), hullIntegrityPct: 0 }, value, ledger);
  assert.equal(cost.otherBoatsUsd, 300_000);
  assert.equal(cost.docksUsd, 0);
  assert.equal(cost.totalUsd, 1_050_000);
  assert.equal(recordPropertyDamage(ledger, impact({ surface: "land", objectName: "land:shore" })), ledger);
});

test("every playable boat has a baseline and uses the same repair, total-loss and property rules", () => {
  const ledger = recordPropertyDamage(new Map(), brokenBay("dock:test/bay:0:0"));
  for (const boat of BOAT_CATALOG) {
    const baseline = boat.economics.replacementValueUsd;
    assert.ok(Number.isFinite(baseline) && baseline > 0, boat.displayName);
    assert.equal(estimateVesselDamageCost(createVesselDamage(), baseline).vesselUsd, 0);
    const repaired = estimateVesselDamageCost({ ...createVesselDamage(), hullIntegrityPct: 95 }, baseline);
    assert.equal(repaired.totalLoss, false, boat.displayName);
    assert.ok(repaired.vesselUsd! > 0 && repaired.vesselUsd! < baseline * 0.02, boat.displayName);
    for (const loss of [{ hullIntegrityPct: 0 }, { sinking: 1 }, { breakup: 0.8 }]) {
      const cost = estimateDamageCost({ ...createVesselDamage(), ...loss }, baseline, ledger);
      assert.equal(cost.vesselUsd, baseline, boat.displayName);
      assert.equal(cost.docksUsd, 10_000, "the same dock doesn't cost more when struck by a more expensive boat");
      assert.equal(cost.totalUsd, baseline + 10_000, boat.displayName);
    }
  }
});

test("marina craft valuations grow with size, distinguish sail/power, and remain stable", () => {
  for (const kind of ["power", "sail"] as const) {
    let previous = 0;
    for (const lengthM of [6.5, 10, 13, 15.5]) {
      const spec = { kind, lengthM, beamM: lengthM * 0.31 };
      const asset = smallCraftAsset(spec);
      assert.ok(asset.replacementValueUsd > previous);
      assert.deepEqual(smallCraftAsset(spec), asset);
      assert.ok(asset.replacementValueUsd >= 25_000 && asset.replacementValueUsd < 700_000);
      previous = asset.replacementValueUsd;
    }
  }
  assert.equal(smallCraftAsset({ kind: "power", lengthM: 10, beamM: 3.1 }).replacementValueUsd, 160_000);
  assert.equal(smallCraftAsset({ kind: "sail", lengthM: 10, beamM: 3.1 }).replacementValueUsd, 90_000);
});

test("hits on moored and passing boats accumulate, then replace earlier repairs with one full loss", () => {
  for (const surface of ["moored", "traffic"] as const) {
    const asset = smallCraftAsset({ kind: "sail", lengthM: 10, beamM: 3.1 });
    const hit = impact({ surface, objectName: `${surface}:test`, targetVessel: asset, hullDamagePct: 10, severity: "minor" });
    let ledger = recordPropertyDamage(new Map(), hit);
    const before = estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd;
    assert.ok(before > 0 && before < asset.replacementValueUsd * 0.05);
    assert.equal(recordPropertyDamage(ledger, hit), ledger, "duplicate samples don't bill twice");
    ledger = recordPropertyDamage(ledger, { ...hit, id: hit.id + 1 });
    assert.ok(estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd > before);
    const wreck = { ...hit, id: hit.id + 2, severity: "severe" as const,
      fracture: { key: hit.objectName, objectName: hit.objectName, width: 3.1, length: 10, workJ: 100_000 } };
    ledger = recordPropertyDamage(ledger, wreck);
    assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd, asset.replacementValueUsd);
    const repeated = recordPropertyDamage(ledger, { ...wreck, id: wreck.id + 1 });
    assert.equal(estimateDamageCost(createVesselDamage(), value, repeated).otherBoatsUsd, asset.replacementValueUsd);
  }
});

test("other boats use the helm loss formula, including sinking after the initial collision", () => {
  const asset = smallCraftAsset({ kind: "power", lengthM: 10, beamM: 3.1 });
  const hit = impact({ objectName: "moored:test", surface: "moored", targetVessel: asset,
    hullDamagePct: 40, targetLocal: { x: 1, z: 4 } });
  let damage = applyTargetVesselImpact(createVesselDamage(), hit, asset.lengthM);
  let ledger = recordPropertyDamage(new Map(), hit);
  assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd,
    estimateVesselDamageCost(damage, asset.replacementValueUsd).vesselUsd);
  assert.ok(estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd < asset.replacementValueUsd);
  for (let i = 0; i < 600 * 4; i++) damage = stepVesselDamage(damage, 0.25, 14_000);
  assert.equal(damage.sinking, 1);
  ledger = recordTargetVesselDamage(ledger, hit.objectName, damage, hit.id);
  assert.equal(estimateDamageCost(createVesselDamage(), value, ledger).otherBoatsUsd, asset.replacementValueUsd);
  assert.equal(recordTargetVesselDamage(ledger, hit.objectName, createVesselDamage(), hit.id - 1), ledger);
  assert.equal(recordTargetVesselDamage(new Map(), hit.objectName, damage, hit.id).size, 0, "old samples cannot revive a reset bill");
});
