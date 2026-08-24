// Chart data is generated from real survey data — see scripts/charts/.
//
// Frame: metres about the scene origin, x east, z north. This is the same
// "chart frame" the marina layouts are authored in, and it gets mirrored to
// the render world once, at load, in src/lib/marinas/index.ts.

export type ChartPoint = [number, number];

export type ChartOrigin = {
  lat: number;
  lon: number;
};

/** One closed shoreline ring. `hole` rings are lagoons cut out of the land. */
export type ChartLandRing = {
  points: ChartPoint[];
  hole: boolean;
  areaM2: number;
};

/** Depth contour polylines at a single depth. */
export type ChartContour = {
  depthM: number;
  lines: ChartPoint[][];
};

/** Spot depth: [x, z, depthMetres]. */
export type ChartSounding = [number, number, number];

/**
 * Coarse depth raster. `data` is base64 little-endian Int16, row-major,
 * north-up, in decimetres positive-down — so land reads negative.
 */
export type ChartDepthGrid = {
  cols: number;
  rows: number;
  cellXM: number;
  cellZM: number;
  data: string;
};

export type ChartLabel = {
  name: string;
  x: number;
  z: number;
  kind: string;
};

/** A pier, breakwater or marina outline lifted straight out of OSM. */
export type ChartStructure = {
  id: string;
  kind: string;
  name: string | null;
  floating: boolean;
  points: ChartPoint[];
};

export type ChartData = {
  id: string;
  name: string;
  /**
   * True once the chart has been mirrored into the render world frame, where
   * +x is west. See `getWorldChart`.
   */
  mirrored?: boolean;
  origin: ChartOrigin;
  halfWidthM: number;
  halfHeightM: number;
  land: ChartLandRing[];
  contours: ChartContour[];
  soundings: ChartSounding[];
  depth: ChartDepthGrid;
  labels: ChartLabel[];
  structures: ChartStructure[];
};
