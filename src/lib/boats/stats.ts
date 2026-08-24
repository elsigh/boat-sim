import type { BoatProfile } from "./catalog";

// Spec sheets are written for humans — 5' 2", 0.90 m, ~1.9 m — so anything that
// wants to do arithmetic with them (under-keel clearance, mostly) has to parse
// them first.

const FEET_PER_METRE = 3.28084;

/**
 * Draft in feet, from whatever the spec sheet says. Falls back to a
 * conservative estimate from hull length if the string can't be read.
 */
export function draftFeet(boat: Pick<BoatProfile, "stats" | "lengthM">): number {
  const raw = boat.stats.draft.trim();

  // metres: "0.90 m", "~1.9 m"
  const metres = raw.match(/([\d.]+)\s*m\b/i);

  if (metres) {
    return Number(metres[1]) * FEET_PER_METRE;
  }

  // feet and inches: "5' 2\"", "6' 11\"", "6' (approx.)"
  const feetInches = raw.match(/([\d.]+)\s*'\s*(?:([\d.]+)\s*")?/);

  if (feetInches) {
    return Number(feetInches[1]) + (feetInches[2] ? Number(feetInches[2]) / 12 : 0);
  }

  // Nothing readable: about 8% of LOA is a fair guess for these hull types.
  return boat.lengthM * 0.08 * FEET_PER_METRE;
}
