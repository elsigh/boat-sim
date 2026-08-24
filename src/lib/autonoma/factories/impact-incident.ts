import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { pruneTestRunScope, testRunScope } from "@/lib/autonoma/store";
import { describeHullLocation, type ImpactSurface } from "@/lib/sim/collision-damage";

const KNOTS_TO_METERS_PER_SECOND = 0.514444;
/** Nominal hull length used to place contact points; a 52' motor yacht. */
const REFERENCE_BOAT_LENGTH_M = 15.8;

/**
 * Collider name the physics callback would have produced. `classifySurface`
 * splits on the colon and looks for "finger" in the remainder, so the label a
 * scenario asks for comes out of the app's own classifier rather than being
 * written into the record.
 */
function colliderName(surface: ImpactSurface, surfaceLabel: string, index: number): string {
  const detail = surfaceLabel.replace(/[^a-z]+/gi, "-").toLowerCase();

  return `${surface}:${detail}-${index}`;
}

/**
 * Inverse of `describeHullLocation`: a contact point in the boat's local frame
 * that the app's own describer maps back to the requested location. Hull
 * location is derived, not stored, so seeding a specific one means placing the
 * contact where it lands in that zone.
 */
function localContactPoint(hullLocation: string, boatLengthM: number): { x: number; z: number } {
  const halfLength = Math.max(1, boatLengthM * 0.5);
  const words = hullLocation.trim().toLowerCase().split(/\s+/);
  const side = words[0] === "port" ? 1.5 : words[0] === "starboard" ? -1.5 : 0;
  const along = words[words.length - 1];

  if (along === "stem") {
    return { x: 0, z: 0.95 * halfLength };
  }

  const alongRatio = along === "bow" ? 0.7 : along === "quarter" || along === "stern" ? -0.7 : 0;

  return { x: side, z: alongRatio * halfLength };
}

export const ImpactIncidentFactory = defineFactory({
  inputSchema: z.object({
    surface: z.enum(["dock", "piling", "land", "moored", "traffic", "unknown"]),
    surfaceLabel: z.string(),
    closingSpeedKnots: z.number(),
    hullLocation: z.string(),
    /**
     * Milliseconds after the test run was seeded that this impact happened.
     * The app timestamps incidents from a live clock, so the recipe carries an
     * offset and the factory derives the timestamp.
     */
    atOffsetMs: z.number().optional(),
    /** Distinguishes struck objects so the tracker's per-object cooldown doesn't fold two incidents into one. */
    objectIndex: z.number().optional(),
    boatLengthM: z.number().optional(),
    world: z.object({ x: z.number(), z: z.number() }).optional(),
  }),
  refSchema: z.object({
    id: z.string(),
    testRunId: z.string(),
    incidentId: z.number(),
  }),
  create: (data, ctx) => {
    const scope = testRunScope(ctx.testRunId);
    const boatLengthM = data.boatLengthM ?? REFERENCE_BOAT_LENGTH_M;
    const local = localContactPoint(data.hullLocation, boatLengthM);
    const rendered = describeHullLocation(local, boatLengthM);

    if (rendered !== data.hullLocation) {
      throw new Error(
        `Hull location "${data.hullLocation}" is not one the simulator produces; the nearest contact point reads as "${rendered}".`,
      );
    }

    const index = data.objectIndex ?? scope.incidents.size + 1;
    const atMs = scope.seededAtMs + (data.atOffsetMs ?? index * 2000);

    // The app's own filter and derivation: severity, damage, hull location and
    // the description all come out of `register`, not out of the recipe.
    const incident = scope.impactTracker.register(
      {
        otherName: colliderName(data.surface, data.surfaceLabel, index),
        closingSpeedMps: data.closingSpeedKnots * KNOTS_TO_METERS_PER_SECOND,
        world: data.world ?? { x: local.x, z: local.z },
        local,
        atMs,
      },
      boatLengthM,
    );

    if (!incident) {
      throw new Error(
        `The simulator discarded a ${data.closingSpeedKnots} kt contact on the ${data.surfaceLabel}: below the harmless-speed floor, or inside the per-object cooldown.`,
      );
    }

    if (incident.surfaceLabel !== data.surfaceLabel) {
      throw new Error(
        `The simulator labels a "${data.surface}" impact "${incident.surfaceLabel}", not "${data.surfaceLabel}".`,
      );
    }

    const key = String(incident.id);
    scope.incidents.set(key, incident);

    return { id: `${ctx.testRunId}:incident:${key}`, testRunId: ctx.testRunId, incidentId: incident.id };
  },
  teardown: (record) => {
    const scope = testRunScope(record.testRunId);
    scope.incidents.delete(String(record.incidentId));
    pruneTestRunScope(record.testRunId);
  },
});
