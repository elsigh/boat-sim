import { chartDepthMeters } from "../charts";
import { sceneChart, type SceneBounds } from "../marinas/scene";
import type { MarinaLayout, SpawnPoint, Vec2 } from "../marinas/types";

export type Hazard = { id: number; x: number; z: number; kind: "crab" | "log" | "kelp" };

const HAZARD_COUNT = 20;
const CORRIDOR_WIDTH_M = 520;
const HARBOR_CLEARANCE_M = 400;
const POT_MAX_DEPTH_M = 28;
const MIN_WATER_M = 4;
const CLEARANCE_PROBE_M = 18;

/** A generous clear area around the basin, moorings and near-harbor approach.
 * All coordinates are in the layout's mirrored world frame. Passage starts
 * deliberately do not extend this area into the offshore part of a voyage. */
export function harborHazardBounds(layout: MarinaLayout): SceneBounds | null {
  const points: Vec2[] = [
    ...layout.berths.map((berth) => berth.center),
    ...layout.spawns.filter((spawn) => spawn.range !== "passage").map((spawn) => spawn.position),
    ...(layout.buoys ?? []),
    ...(sceneChart(layout)?.structures.filter((structure) => structure.kind === "marina")
      .flatMap((structure) => structure.points) ?? []),
  ];
  // Park docks and other authored floats may extend beyond the berth center.
  for (const dock of layout.docks) {
    const reach = Math.hypot(...dock.size) / 2;
    points.push([dock.position[0] - reach, dock.position[1] - reach],
      [dock.position[0] + reach, dock.position[1] + reach]);
  }
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map(([x]) => x)) - HARBOR_CLEARANCE_M,
    maxX: Math.max(...points.map(([x]) => x)) + HARBOR_CLEARANCE_M,
    minZ: Math.min(...points.map(([, z]) => z)) - HARBOR_CLEARANCE_M,
    maxZ: Math.max(...points.map(([, z]) => z)) + HARBOR_CLEARANCE_M,
  };
}

function insideBounds(bounds: SceneBounds, x: number, z: number) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
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

/** Fixed offshore hazards, with harbor exclusions applied before rendering. */
export function placeHazards(layout: MarinaLayout, activeSpawn: SpawnPoint | null | undefined, seed: number): Hazard[] {
  const chart = sceneChart(layout);
  const harbor = harborHazardBounds(layout);
  const berth = layout.berths.find((entry) => entry.id === activeSpawn?.berthId) ?? layout.berths[0];
  const berthCenter = berth?.center ?? [0, 0];
  const start = activeSpawn?.position ?? berthCenter;
  const random = mulberry32(seed);
  const placed: Hazard[] = [];
  let id = 1;
  let attempts = 0;

  while (placed.length < HAZARD_COUNT && attempts < HAZARD_COUNT * 40) {
    attempts += 1;
    const t = random();
    const x = start[0] + (berthCenter[0] - start[0]) * t + (random() - 0.5) * CORRIDOR_WIDTH_M;
    const z = start[1] + (berthCenter[1] - start[1]) * t + (random() - 0.5) * CORRIDOR_WIDTH_M;

    // The coarse depth raster needs clearance probes to avoid placing floating
    // objects on shoreline cells that average out to shallow water.
    if (chart && ![
      [0, 0], [CLEARANCE_PROBE_M, 0], [-CLEARANCE_PROBE_M, 0],
      [0, CLEARANCE_PROBE_M], [0, -CLEARANCE_PROBE_M],
    ].every(([dx, dz]) => chartDepthMeters(chart, x + dx, z + dz) >= MIN_WATER_M)) continue;

    if (Math.hypot(x - berthCenter[0], z - berthCenter[1]) < 35) continue;
    const depth = chart ? chartDepthMeters(chart, x, z) : 10;
    const roll = random();
    let kind: Hazard["kind"] = roll < 0.6 ? "crab" : roll < 0.85 ? "kelp" : "log";
    if (kind !== "log" && depth > POT_MAX_DEPTH_M) {
      if (random() > 0.25) continue;
      kind = "log";
    }
    placed.push({ id: id++, x, z, kind });
  }

  // Do not refill the quota after filtering: that would crowd all twenty
  // hazards into the remaining water just beyond the harbor entrance.
  return harbor ? placed.filter(({ x, z }) => !insideBounds(harbor, x, z)) : placed;
}
