// Chart colours are not a styling choice.
//
// Every marine plotter — Garmin, Raymarine, Furuno, OpenCPN — draws from the
// IHO S-52 presentation library, which defines the colour tables a chart is
// allowed to use and gives them in day, dusk and night variants. That's why a
// Garmin looks like a paper chart: buff land, white deep water, blue shallows,
// magenta route. The boat's helm decides the bezel around the screen; it does
// not get to decide what a depth area looks like.

export type ChartMode = "day" | "night";

export type ChartPalette = {
  /**
   * Depth shading, shallowest first. The first band is everything shallower
   * than the safe depth, and the last is open water.
   */
  depthBands: string[];
  land: string;
  landEdge: string;
  /** Piers, floats, breakwaters. */
  structure: string;
  contour: string;
  contourDeep: string;
  sounding: string;
  label: string;
  /** Halo painted behind label text so it survives a busy background. */
  labelHalo: string;
  track: string;
  route: string;
  ownShip: string;
  ownShipEdge: string;
  ais: string;
  /** Beyond the surveyed window. Deliberately not a water colour. */
  noData: string;
  /** Background for chips laid over the chart, and their text. */
  overlay: string;
  overlayText: string;
};

const DAY: ChartPalette = {
  // White offshore, stepping up through blue into the shoal band — the
  // shallow-water shading a plotter draws below your safe depth setting.
  depthBands: ["#79c2e0", "#a7d9ef", "#d8effa", "#ffffff"],
  land: "#f3e3a2",
  landEdge: "#8d7c3e",
  structure: "#6f7782",
  contour: "rgba(70,108,136,0.60)",
  contourDeep: "rgba(70,108,136,0.32)",
  sounding: "#3b5566",
  label: "#243d4c",
  labelHalo: "#ffffff",
  track: "#1c4f7c",
  route: "#e0009b",
  ownShip: "#f7fbfd",
  ownShipEdge: "#16242e",
  ais: "#12924c",
  noData: "#dcdcd6",
  overlay: "rgba(255,255,255,0.84)",
  overlayText: "#243d4c",
};

const NIGHT: ChartPalette = {
  depthBands: ["#1d5f7d", "#154a63", "#0c3245", "#04131c"],
  land: "#4a4327",
  landEdge: "#8a7c4a",
  structure: "#5d646c",
  contour: "rgba(140,190,220,0.36)",
  contourDeep: "rgba(140,190,220,0.18)",
  sounding: "#7f9aad",
  label: "#bad0de",
  labelHalo: "#04131c",
  track: "#7fd8ff",
  route: "#ff5ad0",
  ownShip: "#ffe6b8",
  ownShipEdge: "#04131c",
  ais: "#3ddc7f",
  noData: "#14161a",
  overlay: "rgba(4,10,14,0.62)",
  overlayText: "#cfe0ea",
};

export const CHART_PALETTES: Record<ChartMode, ChartPalette> = {
  day: DAY,
  night: NIGHT,
};

export function chartPalette(mode: ChartMode): ChartPalette {
  return CHART_PALETTES[mode];
}
