import { getWorldChart } from "@/lib/charts";
import type { ChartData } from "@/lib/charts";
import { chartDockSegments } from "@/lib/charts/geometry";

import type { DockFloat, MarinaLayout } from "./types";

// A scene is a marina layout plus its chart. Everything downstream — physics,
// guidance, traffic, the plotter — needs the same combined view of "where the
// docks are", so it gets built once here and cached per layout.

const dockCache = new Map<string, DockFloat[]>();
const boundsCache = new Map<string, SceneBounds>();

export type SceneBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function sceneChart(layout: MarinaLayout): ChartData | null {
  return getWorldChart(layout.chartId ?? layout.id);
}

/**
 * Every float in the scene: the OSM-mapped marina structures from the chart
 * plus whatever the layout adds by hand (park floats, the NWE visitor float).
 */
export function sceneDocks(layout: MarinaLayout): DockFloat[] {
  const cached = dockCache.get(layout.id);

  if (cached) {
    return cached;
  }

  const chart = sceneChart(layout);
  let docks: DockFloat[];

  if (!chart || layout.useChartStructures === false) {
    docks = layout.docks;
  } else {
    const fromChart = chartDockSegments(chart).map<DockFloat>((segment) => ({
      id: segment.id,
      position: segment.center,
      size: segment.size,
      rotationDeg: segment.rotationDeg,
      kind: segment.kind,
      color:
        segment.kind === "breakwater" ? "#6f6b63" : segment.name ? "#b0a189" : "#9c8f7c",
    }));

    docks = [...fromChart, ...layout.docks];
  }

  dockCache.set(layout.id, docks);
  return docks;
}

/** The area the exercises actually occupy: docks, berths and spawn points. */
export function sceneBounds(layout: MarinaLayout, marginM = 120): SceneBounds {
  const key = `${layout.id}:${marginM}`;
  const cached = boundsCache.get(key);

  if (cached) {
    return cached;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const extend = (x: number, z: number, reach = 0) => {
    minX = Math.min(minX, x - reach);
    maxX = Math.max(maxX, x + reach);
    minZ = Math.min(minZ, z - reach);
    maxZ = Math.max(maxZ, z + reach);
  };

  for (const dock of sceneDocks(layout)) {
    extend(dock.position[0], dock.position[1], Math.hypot(dock.size[0], dock.size[1]) * 0.5);
  }

  for (const land of layout.land ?? []) {
    extend(land.position[0], land.position[1], Math.hypot(land.size[0], land.size[1]) * 0.5);
  }

  for (const berth of layout.berths) {
    extend(berth.center[0], berth.center[1], berth.lengthM);
  }

  for (const spawn of layout.spawns) {
    extend(spawn.position[0], spawn.position[1], 40);
  }

  for (const buoy of layout.buoys ?? []) {
    extend(buoy[0], buoy[1], 20);
  }

  if (!Number.isFinite(minX)) {
    const chart = sceneChart(layout);
    const halfW = chart?.halfWidthM ?? 400;
    const halfH = chart?.halfHeightM ?? 400;
    minX = -halfW;
    maxX = halfW;
    minZ = -halfH;
    maxZ = halfH;
  }

  const bounds: SceneBounds = {
    minX: minX - marginM,
    maxX: maxX + marginM,
    minZ: minZ - marginM,
    maxZ: maxZ + marginM,
  };

  boundsCache.set(key, bounds);
  return bounds;
}
