import type { ChartData, ChartPoint, ChartStructure } from "./types";

/**
 * A dock segment ready to render: one straight run of decking with a width,
 * a centre and a bearing. OSM maps marina floats as bare polylines, so we
 * fatten each segment into a plank.
 */
export type DockSegment = {
  id: string;
  center: ChartPoint;
  /** [width across, length along] before rotation. */
  size: ChartPoint;
  rotationDeg: number;
  kind: "float" | "pier" | "breakwater";
  name: string | null;
};

const MAIN_WALKWAY_M = 2.6;
const FINGER_M = 1.3;
const PIER_M = 3.4;
const BREAKWATER_M = 7.0;

function segmentLength(a: ChartPoint, b: ChartPoint) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function totalLength(points: ChartPoint[]) {
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += segmentLength(points[i - 1], points[i]);
  }

  return total;
}

function widthFor(structure: ChartStructure, runLength: number) {
  if (structure.kind === "breakwater") {
    return BREAKWATER_M;
  }

  if (structure.kind === "groyne") {
    return 2.2;
  }

  // Named docks are the main walkways you'd tie to; short unnamed spurs are
  // finger floats between slips.
  if (structure.name) {
    return runLength > 60 ? MAIN_WALKWAY_M + 0.6 : MAIN_WALKWAY_M;
  }

  if (runLength < 26) {
    return FINGER_M;
  }

  return runLength > 90 ? PIER_M : MAIN_WALKWAY_M;
}

function kindFor(structure: ChartStructure): DockSegment["kind"] {
  if (structure.kind === "breakwater") {
    return "breakwater";
  }

  return structure.floating ? "float" : "pier";
}

/**
 * Convert the chart's OSM structures into renderable dock segments. Marina
 * boundary polygons are skipped — they're administrative outlines, not decking.
 */
export function chartDockSegments(chart: ChartData): DockSegment[] {
  const segments: DockSegment[] = [];

  for (const structure of chart.structures) {
    if (structure.kind === "marina" || structure.points.length < 2) {
      continue;
    }

    const runLength = totalLength(structure.points);

    if (runLength < 4) {
      continue;
    }

    const width = widthFor(structure, runLength);
    const kind = kindFor(structure);

    for (let i = 1; i < structure.points.length; i += 1) {
      const a = structure.points[i - 1];
      const b = structure.points[i];
      const length = segmentLength(a, b);

      if (length < 1.5) {
        continue;
      }

      const dx = b[0] - a[0];
      const dz = b[1] - a[1];

      segments.push({
        id: `${structure.id}-${i}`,
        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        // add a touch of overlap so corners don't show gaps
        size: [width, length + width * 0.5],
        rotationDeg: (Math.atan2(dx, dz) * 180) / Math.PI,
        kind,
        name: structure.name,
      });
    }
  }

  return segments;
}

// --- land -------------------------------------------------------------------

export function ringBounds(points: ChartPoint[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, maxX, minZ, maxZ };
}

export function pointInRing(points: ChartPoint[], x: number, z: number) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];

    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ScatterPoint = {
  x: number;
  z: number;
  scale: number;
};

/**
 * Scatter trees over the land rings. Points are rejected unless they sit
 * inside a solid ring, outside every hole, and far enough from the water that
 * a conifer wouldn't be standing in it.
 */
export function scatterTrees(
  chart: ChartData,
  { density = 1 / 1400, max = 1400, seed = 91, shoreSetbackM = 14 } = {},
): ScatterPoint[] {
  const random = mulberry32(seed);
  const solids = chart.land.filter((ring) => !ring.hole && ring.areaM2 > 900);
  const holes = chart.land.filter((ring) => ring.hole);
  const points: ScatterPoint[] = [];

  for (const ring of solids) {
    const bounds = ringBounds(ring.points);
    const wanted = Math.min(420, Math.round(ring.areaM2 * density));
    let attempts = 0;

    for (let placed = 0; placed < wanted && attempts < wanted * 14; attempts += 1) {
      const x = bounds.minX + random() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + random() * (bounds.maxZ - bounds.minZ);

      if (!pointInRing(ring.points, x, z)) {
        continue;
      }

      if (holes.some((hole) => pointInRing(hole.points, x, z))) {
        continue;
      }

      // cheap shoreline setback: reject anything close to a ring vertex
      let tooClose = false;

      for (const [vx, vz] of ring.points) {
        if (Math.abs(vx - x) < shoreSetbackM && Math.abs(vz - z) < shoreSetbackM) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) {
        continue;
      }

      points.push({ x, z, scale: 0.7 + random() * 0.75 });
      placed += 1;

      if (points.length >= max) {
        return points;
      }
    }
  }

  return points;
}
