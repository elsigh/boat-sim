import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BOAT_CATALOG, DEFAULT_BOAT_SLUG } from "@/lib/boats/catalog";
import { ImpactTracker } from "@/lib/sim/collision-damage";
import { estimateDamageCost, recordPropertyDamage, type PropertyDamageLedger } from "@/lib/sim/damage-cost";
import { applyVesselImpact, createVesselDamage, stepVesselDamage, type VesselDamage } from "@/lib/sim/vessel-damage";
import { ExerciseOutcomeOverlay } from "./ExerciseOutcomeOverlay";

const boat = BOAT_CATALOG.find((entry) => entry.profileSlug === DEFAULT_BOAT_SLUG)!;
const grounding = { depthFeet: 4.5, draftFeet: 5 + 2 / 12 };
const crash = { ...new ImpactTracker().register({ otherName: "dock:test", closingSpeedMps: 20,
  world: { x: 0, z: 0 }, local: { x: 0, z: 7 }, atMs: 0 }, boat.lengthM)!, hullDamagePct: 100,
  fracture: { key: "dock:test/bay:0", objectName: "dock:test", width: 2, length: 3, workJ: 100_000 } };
const wreck = applyVesselImpact(createVesselDamage(), crash, boat.lengthM);
const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function render(damage: VesselDamage, grounded = false, ledger: PropertyDamageLedger = new Map(), vessel = boat) {
  const cost = estimateDamageCost(damage, vessel.economics.replacementValueUsd, ledger);
  return renderToStaticMarkup(<ExerciseOutcomeOverlay boat={vessel} damage={damage} cost={cost}
    grounding={grounded ? grounding : null} onRestart={() => {}} />);
}

test("a dock crash shows destruction and the full property bill even in grounding depth", () => {
  let ledger = recordPropertyDamage(new Map(), crash);
  ledger = recordPropertyDamage(ledger, { ...crash, id: crash.id + 1, surface: "moored", objectName: "moored:sailboat",
    targetVessel: { lengthM: 10, beamM: 3.1, replacementValueUsd: 90_000 } });
  const markup = render(wreck, true, ledger);
  assert.match(markup, /Total destruction/);
  assert.match(markup, /Bonum Vitae is destroyed/);
  assert.doesNotMatch(markup, /beached|Aground|charted water depth/);
  for (const amount of [750_000, 10_000, 90_000, 850_000]) assert.ok(markup.includes(usd(amount)));
  assert.match(markup, /Active fire/);
  assert.match(markup, /Watch the wreck/);
});

test("every boat gets its own full-value loss report offshore as well as aground", () => {
  for (const vessel of BOAT_CATALOG) {
    for (const grounded of [false, true]) {
      for (const loss of [{ hullIntegrityPct: 0 }, { breakup: 0.65 }, { sinking: 0.1 }, { sinking: 1 }]) {
        const markup = render({ ...createVesselDamage(), ...loss }, grounded, new Map(), vessel);
        assert.ok(markup.includes(usd(vessel.economics.replacementValueUsd)), vessel.displayName);
        assert.match(markup, /Vessel · total loss/);
        assert.doesNotMatch(markup, /beached/);
      }
    }
  }
});

test("an ordinary grounding escalates to a loss as flooding progresses, and reset clears it", () => {
  let damaged = { ...createVesselDamage(), hullIntegrityPct: 60, breach: 0.5 };
  assert.match(render(damaged, true), /is beached/);
  assert.equal(render(damaged), "");
  for (let i = 0; i < 1200; i++) damaged = stepVesselDamage(damaged, 0.25, 26_308);
  assert.equal(damaged.sinking, 1);
  assert.match(render(damaged, true), /has sunk/);
  assert.doesNotMatch(render(damaged, true), /beached/);
  assert.equal(render(createVesselDamage()), "");
  assert.match(render(createVesselDamage(), true), /is beached/);
});

test("a financial write-off is labelled as a total loss without inventing destruction or sinking", () => {
  const damaged = { ...createVesselDamage(), hullIntegrityPct: 25, floodingPct: 60,
    portDamage: 1, starboardDamage: 1, breach: 0.8 };
  const markup = render(damaged, true);
  assert.match(markup, /is a total loss/);
  assert.match(markup, /Beyond economic repair/);
  assert.doesNotMatch(markup, /beached|is destroyed|is sinking|has sunk/);
  assert.equal(render({ ...createVesselDamage(), hullIntegrityPct: 98 }), "");
});
