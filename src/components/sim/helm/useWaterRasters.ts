"use client";

import { useEffect, useState } from "react";

import { chartDepthMeters, type ChartData } from "@/lib/charts";
import { CHART_PALETTES, type ChartMode } from "@/lib/charts/palette";

type WaterRasters = Record<ChartMode, string>;
const rasters = new WeakMap<ChartData, Map<number, WaterRasters>>();

function rgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255] as const;
}

/** Both colour tables share one survey pass. Switching mode never encodes PNGs. */
function buildRasters(chart: ChartData, safeDepthM: number): WaterRasters | null {
  const cached = rasters.get(chart)?.get(safeDepthM);
  if (cached) return cached;

  const { cols, rows } = chart.depth;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const tables = (["day", "night"] as const).map((mode) => ({
    mode,
    bands: CHART_PALETTES[mode].depthBands.map(rgb),
    image: context.createImageData(cols, rows),
  }));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = -chart.halfWidthM + (col + 0.5) * chart.depth.cellXM;
      const z = chart.halfHeightM - (row + 0.5) * chart.depth.cellZM;
      const depth = chartDepthMeters(chart, x, z);
      if (depth <= 0) continue;

      const band = depth < safeDepthM ? 0 : depth < safeDepthM * 2.5 ? 1 : depth < safeDepthM * 6 ? 2 : 3;
      const index = (row * cols + col) * 4;
      for (const { bands, image } of tables) {
        const [r, g, b] = bands[Math.min(bands.length - 1, band)];
        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = 255;
      }
    }
  }

  const result = {} as WaterRasters;
  for (const { mode, image } of tables) {
    context.putImageData(image, 0, 0);
    result[mode] = canvas.toDataURL("image/png");
    // Decode the alternate palette before the first click, too.
    const preload = new Image();
    preload.src = result[mode];
    void preload.decode().catch(() => {});
  }

  const byDepth = rasters.get(chart) ?? new Map<number, WaterRasters>();
  // Bound retained images if future controls allow arbitrary draft settings.
  if (byDepth.size >= 4) byDepth.delete(byDepth.keys().next().value!);
  byDepth.set(safeDepthM, result);
  rasters.set(chart, byDepth);
  return result;
}

export function useWaterRasters(chart: ChartData, safeDepthM: number) {
  // Canvas only exists on the client; null keeps the first render hydration-safe.
  const [ready, setReady] = useState<{
    chart: ChartData;
    safeDepthM: number;
    images: WaterRasters | null;
  } | null>(null);

  useEffect(() => {
    setReady({ chart, safeDepthM, images: buildRasters(chart, safeDepthM) });
  }, [chart, safeDepthM]);

  return ready?.chart === chart && ready.safeDepthM === safeDepthM ? ready.images : null;
}
