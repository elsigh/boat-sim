import { chartDepthMeters, getWorldChart } from "@/lib/charts";
import { sceneDocks } from "@/lib/marinas/scene";
import type { DockFloat, MarinaLayout, Vec2 } from "@/lib/marinas/types";

// Depths come from the NOAA NCEI DEM baked into src/lib/charts. Structures
// still shave the reading down, because the sounder should get nervous when
// you tuck in beside a float even where the survey says there's water.

const STRUCTURE_CLEARANCE_M = 2.2;
const STRUCTURE_REACH_M = 12;
const MIN_DEPTH_M = 0.3;

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function rotatePoint(point: Vec2, center: Vec2, rotationDeg: number): Vec2 {
  const r = degToRad(rotationDeg);
  const sin = Math.sin(r);
  const cos = Math.cos(r);
  const dx = point[0] - center[0];
  const dz = point[1] - center[1];
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

function distanceToRotatedRect(point: Vec2, rectCenter: Vec2, size: Vec2, rotationDeg: number) {
  const local = rotatePoint(point, rectCenter, rotationDeg);
  const hx = size[0] * 0.5;
  const hz = size[1] * 0.5;
  const dx = Math.max(Math.abs(local[0]) - hx, 0);
  const dz = Math.max(Math.abs(local[1]) - hz, 0);
  return Math.hypot(dx, dz);
}

function distanceToDock(point: Vec2, dock: DockFloat) {
  return distanceToRotatedRect(point, dock.position, dock.size, dock.rotationDeg ?? 0);
}

/** Fallback for scenes with no chart: shallow near structures, deeper away. */
function estimateFromStructures(layout: MarinaLayout, point: Vec2): number {
  const minDepthM = 2.4;
  const slopePerM = 0.04;
  const maxDepthM = 35;

  let minDist = Number.POSITIVE_INFINITY;

  for (const land of layout.land ?? []) {
    minDist = Math.min(
      minDist,
      distanceToRotatedRect(point, land.position, land.size, land.rotationDeg ?? 0),
    );
  }

  for (const dock of sceneDocks(layout)) {
    minDist = Math.min(minDist, distanceToDock(point, dock));
  }

  if (!Number.isFinite(minDist)) {
    return maxDepthM;
  }

  return Math.min(maxDepthM, Math.max(minDepthM, minDepthM + minDist * slopePerM));
}

/**
 * Charted depth in metres below the waterline at a render-world point.
 * Never returns less than 0.3 m — a hard zero reads as a broken sounder.
 */
export function estimateDepthMeters(layout: MarinaLayout, point: Vec2): number {
  const chart = getWorldChart(layout.chartId ?? layout.id);

  if (!chart) {
    return estimateFromStructures(layout, point);
  }

  const surveyed = chartDepthMeters(chart, point[0], point[1]);

  // A dredged basin is already as shallow as it gets; the structure term only
  // exists to stop the raster's soft shoreline reading as deep water right up
  // against a float, so it has nothing to do below this depth.
  if (surveyed < 6) {
    return Math.max(MIN_DEPTH_M, surveyed);
  }

  let structurePenalty = 0;

  for (const dock of sceneDocks(layout)) {
    const distance = distanceToDock(point, dock);

    if (distance < STRUCTURE_REACH_M) {
      structurePenalty = Math.max(structurePenalty, 1 - distance / STRUCTURE_REACH_M);
    }
  }

  if (structurePenalty > 0) {
    const shoalTo = STRUCTURE_CLEARANCE_M + (1 - structurePenalty) * 6;
    return Math.max(MIN_DEPTH_M, Math.min(surveyed, Math.max(shoalTo, surveyed * 0.85)));
  }

  return Math.max(MIN_DEPTH_M, surveyed);
}

/** True where the chart says there is land rather than water. */
export function isGroundedAt(layout: MarinaLayout, point: Vec2): boolean {
  const chart = getWorldChart(layout.chartId ?? layout.id);

  if (!chart) {
    return false;
  }

  return chartDepthMeters(chart, point[0], point[1]) <= 0;
}

/** A vessel touches bottom as soon as charted depth reaches its actual draft. */
export function depthGroundsBoat(depthMeters: number, draftMeters: number) {
  return depthMeters <= draftMeters;
}
