import type { ImpactIncident } from "./collision-damage";
import { applyTargetVesselImpact, createVesselDamage, type VesselDamage } from "./vessel-damage";
import { smallCraftAsset, type VesselAsset } from "../boats/valuation";

type PropertyDamage = {
  surface: "dock" | "piling";
  repairUsd: number;
  destroyed: ReadonlyMap<string, number>;
} | {
  surface: "moored" | "traffic";
  asset: VesselAsset;
  damage: VesselDamage;
  lastIncidentId: number;
  costUsd: number;
};

/** One entry per struck object, retained for the entire exercise. */
export type PropertyDamageLedger = ReadonlyMap<string, PropertyDamage>;
export type DamageCostEstimate = ReturnType<typeof estimateDamageCost>;
export type TargetDamageSample = (objectName: string, damage: VesselDamage, lastIncidentId: number) => void;

// Gameplay estimates in USD: marine labour, materials and installation.
// A broken bay includes its float/frame/connections; pilings include removal
// and pile driving. These are asset costs, independent of the player's boat.
const DOCK_REPAIR = { scuff: 150, minor: 1_500, major: 7_500, severe: 15_000 };

export function recordPropertyDamage(ledger: PropertyDamageLedger, hit: ImpactIncident): PropertyDamageLedger {
  const { surface, fracture } = hit;
  if (surface !== "dock" && surface !== "piling" && surface !== "moored" && surface !== "traffic") return ledger;
  const previous = ledger.get(hit.objectName);
  if (surface === "moored" || surface === "traffic") {
    const earlier = previous && "asset" in previous ? previous : undefined;
    if (earlier && hit.id <= earlier.lastIncidentId) return ledger;
    // Older/raw incident producers may omit metadata; use dimensions when
    // available, otherwise a representative 10 m powerboat. Live colliders
    // supply the target's actual dimensions and its power/sail valuation.
    const asset = earlier?.asset ?? hit.targetVessel ?? fracture?.vessel ?? smallCraftAsset({ kind: "power",
      lengthM: fracture?.length ?? 10, beamM: fracture?.width ?? 3.1 });
    const damage = applyTargetVesselImpact(earlier?.damage ?? createVesselDamage(), hit, asset.lengthM);
    const costUsd = Math.max(earlier?.costUsd ?? 0, estimateVesselDamageCost(damage, asset.replacementValueUsd).vesselUsd!);
    return new Map(ledger).set(hit.objectName, { surface, asset, damage, costUsd, lastIncidentId: hit.id });
  }
  const earlier = previous && "destroyed" in previous ? previous : undefined;
  const destroyed = new Map(earlier?.destroyed);
  if (fracture) {
    if (destroyed.has(fracture.key)) return ledger;
    const area = Math.max(0, fracture.width * fracture.length);
    const replacementUsd = surface === "dock" ? 2_500 + area * 1_250
      : 15_000 * Math.max(1, fracture.width / 0.4);
    destroyed.set(fracture.key, Math.round(replacementUsd));
  }
  // Repeated solver reports or another scrape on the same object must not
  // repeatedly bill for the same repair. Replacement supersedes that repair.
  const repairUsd = Math.max(earlier?.repairUsd ?? 0, fracture ? 0 : DOCK_REPAIR[hit.severity]);
  if (!fracture && earlier && repairUsd === earlier.repairUsd) return ledger;
  return new Map(ledger).set(hit.objectName, { surface, repairUsd, destroyed });
}

/** Both the helm boat and struck boats use this exact repair/write-off rule. */
export function estimateVesselDamageCost(damage: VesselDamage, replacementUsd: number | undefined) {
  const hullLoss = Math.max(0, Math.min(1, 1 - damage.hullIntegrityPct / 100));
  // Hull repairs accelerate with structural damage. Flooded machinery,
  // breaches and separation remain costly after the visible fire goes out.
  const repairFraction = hullLoss ** 1.6 * 0.7 + damage.breach * 0.12
    + (damage.floodingPct / 100) ** 2 * 0.45
    + (damage.portDamage + damage.starboardDamage) * 0.1 + damage.breakup * 0.45;
  const totalLoss = damage.hullIntegrityPct <= 0 || damage.sinking > 0
    || damage.breakup >= 0.65 || repairFraction >= 0.8;
  const vesselUsd = replacementUsd === undefined ? null
    : Math.round(replacementUsd * (totalLoss ? 1 : repairFraction));
  return { vesselUsd, totalLoss };
}

/** Follow actual fire/flooding progression on other boats. Sampling never lowers
 * an incurred bill, and old render samples cannot overwrite a more recent hit. */
export function recordTargetVesselDamage(ledger: PropertyDamageLedger, objectName: string, damage: VesselDamage, lastIncidentId: number): PropertyDamageLedger {
  const previous = ledger.get(objectName);
  if (!previous || !("asset" in previous) || previous.lastIncidentId !== lastIncidentId) return ledger;
  const costUsd = Math.max(previous.costUsd, estimateVesselDamageCost(damage, previous.asset.replacementValueUsd).vesselUsd!);
  // Preserve damage even if the rounded dollar amount is unchanged, so the
  // next collision starts from the boat's actual condition.
  if (previous.damage === damage) return ledger;
  return new Map(ledger).set(objectName, { ...previous, damage, costUsd });
}

export function estimateDamageCost(damage: VesselDamage, replacementUsd: number | undefined, ledger: PropertyDamageLedger) {
  const { vesselUsd, totalLoss } = estimateVesselDamageCost(damage, replacementUsd);
  let docksUsd = 0, otherBoatsUsd = 0;
  for (const entry of ledger.values()) {
    if ("asset" in entry) otherBoatsUsd += entry.costUsd;
    else {
      let replacement = 0;
      for (const cost of entry.destroyed.values()) replacement += cost;
      docksUsd += Math.max(entry.repairUsd, replacement);
    }
  }
  return { vesselUsd, totalLoss, docksUsd, otherBoatsUsd, totalUsd: (vesselUsd ?? 0) + docksUsd + otherBoatsUsd };
}
