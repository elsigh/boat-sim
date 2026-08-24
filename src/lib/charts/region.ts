/**
 * The regional basemap: the whole San Juans under every harbour chart.
 *
 * Each scene's chart is a ~2.5 km window, which is right for judging a slip
 * but means the plotter runs out of world the moment you drag offshore — you
 * end up shoving a still image around inside a grey void. This is one coarse
 * 68 x 44 km chart, built by `scripts/charts/build_region.py` from the same
 * NOAA DEM, that the plotter draws *underneath* the detailed chart.
 *
 * It has no docks, no soundings and only two contour levels. It exists to
 * give the eye somewhere to go.
 *
 * Frames: the region and each scene are separate local ENU grids about
 * different origins, so region metres are not scene metres. Both are
 * equirectangular, though, so the conversion between them is a plain affine —
 * see `regionTransform`, which the plotter applies as one SVG transform
 * rather than rewriting every coordinate.
 */

import { SAN_JUANS_REGION_CHART } from "./generated/san-juans-region";
import type { ChartData } from "./types";

export const REGION_CHART: ChartData = SAN_JUANS_REGION_CHART;

/** Same formula as `metersPerDegree` in ./index, kept local to avoid a cycle. */
function metersPerDegree(latDeg: number) {
  const lat = (latDeg * Math.PI) / 180;
  return {
    perLat:
      111132.92 - 559.82 * Math.cos(2 * lat) + 1.175 * Math.cos(4 * lat) - 0.0023 * Math.cos(6 * lat),
    perLon: 111412.84 * Math.cos(lat) - 93.5 * Math.cos(3 * lat) + 0.118 * Math.cos(5 * lat),
  };
}

export type RegionTransform = {
  /** scene_x = offsetX + scaleX * region_x */
  offsetX: number;
  scaleX: number;
  offsetZ: number;
  scaleZ: number;
  /** Half-extents of the region expressed in the scene's frame. */
  halfWidthM: number;
  halfHeightM: number;
  /** Centre of the region in the scene's frame — it is not the scene origin. */
  centreX: number;
  centreZ: number;
};

const cache = new WeakMap<ChartData, RegionTransform>();

/**
 * Affine taking region-frame metres into `chart`'s frame.
 *
 * Both frames are lon/lat scaled by metres-per-degree at their own origin, so
 * eliminating lon between them gives
 *
 *   x_scene = (lon_region - lon_scene) * perLon_scene
 *           + x_region * (perLon_scene / perLon_region)
 *
 * and likewise for latitude. The scale factors are within 0.3% of 1 across
 * this archipelago, but they are not exactly 1, and over 30 km the difference
 * is about 90 m — enough to put an island in the wrong channel.
 *
 * Mirrored charts (the render-world copies) flip east, so the x half of the
 * transform negates.
 */
export function regionTransform(chart: ChartData): RegionTransform {
  const hit = cache.get(chart);

  if (hit) {
    return hit;
  }

  const scene = metersPerDegree(chart.origin.lat);
  const region = metersPerDegree(REGION_CHART.origin.lat);

  const scaleX = scene.perLon / region.perLon;
  const scaleZ = scene.perLat / region.perLat;
  const offsetEast = (REGION_CHART.origin.lon - chart.origin.lon) * scene.perLon;
  const offsetZ = (REGION_CHART.origin.lat - chart.origin.lat) * scene.perLat;

  const mirror = chart.mirrored ? -1 : 1;
  const transform: RegionTransform = {
    offsetX: mirror * offsetEast,
    scaleX: mirror * scaleX,
    offsetZ,
    scaleZ,
    halfWidthM: REGION_CHART.halfWidthM * scaleX,
    halfHeightM: REGION_CHART.halfHeightM * scaleZ,
    centreX: mirror * offsetEast,
    centreZ: offsetZ,
  };

  cache.set(chart, transform);
  return transform;
}

/** Region point -> scene-frame metres. For labels, which are placed in screen space. */
export function regionToScene(
  transform: RegionTransform,
  x: number,
  z: number,
): [number, number] {
  return [transform.offsetX + transform.scaleX * x, transform.offsetZ + transform.scaleZ * z];
}
