export type VesselAsset = {
  lengthM: number;
  beamM: number;
  replacementValueUsd: number;
};

/** Typical maintained, used marina craft; not a new-build price. Named playable
 * boats have individually researched values in catalog.ts. See docs/vessel-values.md. */
export function smallCraftAsset(spec: { kind: "power" | "sail"; lengthM: number; beamM: number }): VesselAsset {
  const lengthRatio = spec.lengthM / 10;
  const beamRatio = spec.beamM / (spec.lengthM * 0.31);
  const estimate = (spec.kind === "sail" ? 90_000 * lengthRatio ** 2.5 : 160_000 * lengthRatio ** 3)
    * beamRatio ** 0.65;
  return { lengthM: spec.lengthM, beamM: spec.beamM,
    replacementValueUsd: Math.max(10_000, Math.round(estimate / 1_000) * 1_000) };
}
