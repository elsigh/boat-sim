import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { chartDepthMeters } from "./index";
import { pointInRing, ringBounds } from "./geometry";
import type { ChartData, ChartPoint } from "./types";

/** Height follows the survey, meeting the existing shoreline at beach level. */
export function terrainHeightAt(chart: ChartData, x: number, z: number) {
  let shoreDistanceSq = Infinity;
  for (const ring of chart.land) {
    for (let i = 0; i < ring.points.length; i++) {
      const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      shoreDistanceSq = Math.min(shoreDistanceSq, (x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2);
    }
  }
  return Math.max(0.55, Math.min(-chartDepthMeters(chart, x, z), 0.55 + Math.sqrt(shoreDistanceSq) * 0.7));
}

// Clip an already-triangulated land polygon to small grid cells. This preserves
// every shoreline and lagoon, including concave bays, while adding interior
// vertices for the hills. An unclipped heightfield would fill the marina in.
function clip(points: ChartPoint[], axis: 0 | 1, edge: number, greater: boolean): ChartPoint[] {
  const out: ChartPoint[] = [];
  if (!points.length) return out;
  let a = points[points.length - 1];
  for (const b of points) {
    const insideA = greater ? a[axis] >= edge : a[axis] <= edge;
    const insideB = greater ? b[axis] >= edge : b[axis] <= edge;
    if (insideA !== insideB) {
      const t = (edge - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    if (insideB) out.push(b);
    a = b;
  }
  return out;
}

export function buildTerrainRelief(chart: ChartData, cellM = 28) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const vertices = new Map<string, number>();
  const lowColor = new Color("#687156"), highColor = new Color("#485c48"), color = new Color();
  const addVertex = ([x, z]: ChartPoint) => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    const y = terrainHeightAt(chart, x, z);
    positions.push(x, y, z);
    // Muted grass on lower slopes, darker woodland higher up.
    const high = Math.min(1, y / 75);
    color.copy(lowColor).lerp(highColor, high);
    colors.push(color.r, color.g, color.b);
    vertices.set(key, index);
    return index;
  };
  for (const ring of chart.land.filter((r) => !r.hole)) {
    const outer = ring.points.map(([x, z]) => new Vector2(x, z));
    const holes = chart.land.filter((h) => h.hole && pointInRing(ring.points, ...h.points[0]))
      .map((h) => h.points.map(([x, z]) => new Vector2(x, z)));
    const faces = ShapeUtils.triangulateShape(outer, holes);
    const points = [...outer, ...holes.flat()].map((p): ChartPoint => [p.x, p.y]);
    for (const face of faces) {
      const triangle = face.map((index) => points[index]);
      const bounds = ringBounds(triangle);
      for (let x = Math.floor(bounds.minX / cellM) * cellM; x < bounds.maxX; x += cellM) {
        for (let z = Math.floor(bounds.minZ / cellM) * cellM; z < bounds.maxZ; z += cellM) {
          let piece = clip(triangle, 0, x, true);
          piece = clip(piece, 0, x + cellM, false);
          piece = clip(piece, 1, z, true);
          piece = clip(piece, 1, z + cellM, false);
          if (piece.length < 3) continue;
          for (let i = 1; i < piece.length - 1; i++) {
            const [a, b, c] = [piece[0], piece[i], piece[i + 1]];
            const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (Math.abs(cross) < 0.001) continue;
            // XZ is a left-handed plane as seen from above: reverse CCW faces.
            const ids = [addVertex(a), addVertex(b), addVertex(c)];
            indices.push(...(cross > 0 ? ids.reverse() : ids));
          }
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
