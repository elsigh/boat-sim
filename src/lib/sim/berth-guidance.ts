import type { Berth } from "@/lib/marinas/types";
import type { DockingTelemetry } from "@/lib/sim/boat-physics";

const KNOTS_TO_METERS_PER_SECOND = 0.514444;

export type BerthGuidance = {
  rangeM: number;
  /** Meters the boat still needs to travel along the berth heading (+ = ahead). */
  alongM: number;
  /** Lateral offset from the berth centerline (+ = boat is starboard of it). */
  acrossM: number;
  /** Signed shortest angle from berth heading to boat heading. */
  headingErrorDeg: number;
  /** Speed toward the berth center (+ = closing). */
  closureKnots: number;
  docked: boolean;
};

function normalizeSignedDegrees(value: number) {
  const wrapped = ((value % 360) + 540) % 360;
  return wrapped - 180;
}

export function computeBerthGuidance(
  telemetry: DockingTelemetry,
  berth: Berth,
): BerthGuidance {
  const deltaX = berth.center[0] - telemetry.worldX;
  const deltaZ = berth.center[1] - telemetry.worldZ;
  const rangeM = Math.hypot(deltaX, deltaZ);

  const headingRad = (berth.headingDeg * Math.PI) / 180;
  const forwardX = Math.sin(headingRad);
  const forwardZ = Math.cos(headingRad);
  const rightX = Math.cos(headingRad);
  const rightZ = -Math.sin(headingRad);

  const alongM = deltaX * forwardX + deltaZ * forwardZ;
  // Delta points boat->berth, so the boat sits on the opposite side of it.
  const acrossM = -(deltaX * rightX + deltaZ * rightZ);
  const headingErrorDeg = normalizeSignedDegrees(telemetry.headingDeg - berth.headingDeg);

  const closureMetersPerSecond =
    rangeM > 0.05
      ? (telemetry.worldVelocityX * deltaX + telemetry.worldVelocityZ * deltaZ) / rangeM
      : 0;
  const closureKnots = closureMetersPerSecond / KNOTS_TO_METERS_PER_SECOND;

  const docked =
    Math.abs(alongM) <= berth.lengthM * 0.28 &&
    Math.abs(acrossM) <= Math.max(0.65, berth.widthM * 0.2) &&
    Math.abs(headingErrorDeg) <= (berth.headingToleranceDeg ?? 10) &&
    telemetry.speedKnots <= 0.4 &&
    Math.abs(telemetry.yawRateDegPerSecond) <= 2.5;

  return {
    rangeM,
    alongM,
    acrossM,
    headingErrorDeg,
    closureKnots,
    docked,
  };
}
