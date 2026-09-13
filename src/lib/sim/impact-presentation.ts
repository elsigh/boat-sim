import type { ImpactIncident } from "./collision-damage";

/** Severity is useful text; impact speed and failed-member size drive spectacle. */
export function impactPresentation(hit: ImpactIncident) {
  const base = hit.severity === "severe" ? 1 : hit.severity === "major" ? 0.62 : hit.severity === "minor" ? 0.22 : 0.06;
  const speed = Math.max(0, hit.closingSpeedKnots * 0.514444);
  const area = hit.fracture ? hit.fracture.width * hit.fracture.length : 1;
  const power = Math.min(3, base * (1 + Math.max(0, speed - 2.6) * 0.14) * Math.min(1.3, 0.9 + area * 0.06));
  return { power, speed, chunks: hit.severity === "scuff" ? 0 : Math.ceil(Math.min(76, power * 30)),
    drops: Math.ceil(Math.min(130, 14 + power * 45)), plume: hit.severity === "major" || hit.severity === "severe" };
}
