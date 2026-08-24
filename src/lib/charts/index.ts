import { CHARTS } from "./generated";
import type { ChartData, ChartDepthGrid, ChartPoint } from "./types";

export type {
  ChartContour,
  ChartData,
  ChartDepthGrid,
  ChartLabel,
  ChartLandRing,
  ChartPoint,
  ChartSounding,
  ChartStructure,
} from "./types";

export { CHARTS };

export function getChart(sceneId: string | null | undefined): ChartData | null {
  if (!sceneId) {
    return null;
  }

  return CHARTS[sceneId] ?? null;
}

// --- render-world mirror ----------------------------------------------------
//
// Layouts are authored east-positive but the render world is right-handed with
// +y up and +z north, which makes +x point WEST on screen. Rather than sprinkle
// sign flips through every consumer, mirror the whole chart once per scene and
// hand out the mirrored copy.

const worldCharts = new Map<string, ChartData>();

function mirrorPoints(points: ChartPoint[]): ChartPoint[] {
  // Reversing the order as well as the sign keeps the winding direction, which
  // matters for polygon triangulation in the 3D scene.
  const out: ChartPoint[] = new Array(points.length);

  for (let i = 0; i < points.length; i += 1) {
    const [x, z] = points[points.length - 1 - i];
    out[i] = [-x, z];
  }

  return out;
}

function mirrorDepthGrid(grid: ChartDepthGrid): ChartDepthGrid {
  const source = decodeGrid(grid);
  const flipped = new Int16Array(source.length);

  for (let row = 0; row < grid.rows; row += 1) {
    const base = row * grid.cols;

    for (let col = 0; col < grid.cols; col += 1) {
      flipped[base + col] = source[base + (grid.cols - 1 - col)];
    }
  }

  const mirrored: ChartDepthGrid = { ...grid, data: "" };
  decodedGrids.set(mirrored, flipped);
  return mirrored;
}

/** The chart in render-world coordinates (+x west), built and cached on demand. */
export function getWorldChart(sceneId: string | null | undefined): ChartData | null {
  if (!sceneId) {
    return null;
  }

  const cached = worldCharts.get(sceneId);

  if (cached) {
    return cached;
  }

  const chart = getChart(sceneId);

  if (!chart) {
    return null;
  }

  const mirrored: ChartData = {
    ...chart,
    mirrored: true,
    land: chart.land.map((ring) => ({ ...ring, points: mirrorPoints(ring.points) })),
    contours: chart.contours.map((contour) => ({
      ...contour,
      lines: contour.lines.map(mirrorPoints),
    })),
    soundings: chart.soundings.map(([x, z, depth]) => [-x, z, depth]),
    depth: mirrorDepthGrid(chart.depth),
    labels: chart.labels.map((label) => ({ ...label, x: -label.x })),
    structures: chart.structures.map((structure) => ({
      ...structure,
      points: mirrorPoints(structure.points),
    })),
  };

  worldCharts.set(sceneId, mirrored);
  return mirrored;
}

// --- depth raster -----------------------------------------------------------

const decodedGrids = new WeakMap<ChartDepthGrid, Int16Array>();

function decodeGrid(grid: ChartDepthGrid): Int16Array {
  const cached = decodedGrids.get(grid);

  if (cached) {
    return cached;
  }

  const binary =
    typeof atob === "function"
      ? atob(grid.data)
      : Buffer.from(grid.data, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const values = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  decodedGrids.set(grid, values);
  return values;
}

function sampleCell(values: Int16Array, grid: ChartDepthGrid, col: number, row: number) {
  const c = Math.min(grid.cols - 1, Math.max(0, col));
  const r = Math.min(grid.rows - 1, Math.max(0, row));
  return values[r * grid.cols + c] / 10;
}

/**
 * Depth in metres at a chart-frame point, positive down. Land comes back
 * negative (i.e. the terrain height above the waterline), which callers can
 * use directly as a grounding test.
 */
export function chartDepthMeters(chart: ChartData, x: number, z: number): number {
  const { depth } = chart;
  const values = decodeGrid(depth);

  // grid is north-up: row 0 is the top (max z)
  const u = (x + chart.halfWidthM) / depth.cellXM - 0.5;
  const v = (chart.halfHeightM - z) / depth.cellZM - 0.5;

  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const fx = u - c0;
  const fz = v - r0;

  const d00 = sampleCell(values, depth, c0, r0);
  const d10 = sampleCell(values, depth, c0 + 1, r0);
  const d01 = sampleCell(values, depth, c0, r0 + 1);
  const d11 = sampleCell(values, depth, c0 + 1, r0 + 1);

  const top = d00 + (d10 - d00) * fx;
  const bottom = d01 + (d11 - d01) * fx;
  return top + (bottom - top) * fz;
}

export function isInsideChart(chart: ChartData, x: number, z: number, margin = 0): boolean {
  return (
    Math.abs(x) <= chart.halfWidthM - margin && Math.abs(z) <= chart.halfHeightM - margin
  );
}

// --- projection -------------------------------------------------------------

function metersPerDegree(latDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  const perLat =
    111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat) - 0.0023 * Math.cos(6 * lat);
  const perLon =
    111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat) + 0.118 * Math.cos(5 * lat);
  return { perLat, perLon };
}

/** Chart-frame metres -> WGS84. Handles mirrored (render-world) charts. */
export function chartToGeo(chart: ChartData, x: number, z: number) {
  const { perLat, perLon } = metersPerDegree(chart.origin.lat);
  const east = chart.mirrored ? -x : x;
  return {
    lat: chart.origin.lat + z / perLat,
    lon: chart.origin.lon + east / perLon,
  };
}

/** WGS84 -> chart-frame metres. Handles mirrored (render-world) charts. */
export function geoToChart(chart: ChartData, lat: number, lon: number): ChartPoint {
  const { perLat, perLon } = metersPerDegree(chart.origin.lat);
  const east = (lon - chart.origin.lon) * perLon;
  return [chart.mirrored ? -east : east, (lat - chart.origin.lat) * perLat];
}
