// Marina scenes use the chart frame: +z is true north, +x is east, units are
// metres, y = 0 at the waterline, and the origin is the scene origin declared
// in scripts/charts/scenes.py. Headings are degrees true (0 = north, 90 = east).
//
// The shoreline, depths and most dock structures come from the generated chart
// (src/lib/charts). What lives here is the stuff a chart can't tell you: which
// berth you're aiming for, where an exercise starts, what the wind is doing,
// and the local knowledge you'd get from someone who's been in before.

export type Vec2 = [number, number];

export type LandMass = {
  id: string;
  position: Vec2;
  size: Vec2;
  rotationDeg?: number;
  heightM?: number;
  color?: string;
};

export type TreeCluster = {
  center: Vec2;
  radiusM: number;
  count: number;
};

export type DockFloat = {
  id: string;
  position: Vec2;
  /** [width across, length along] before rotation; length runs along +z. */
  size: Vec2;
  rotationDeg?: number;
  color?: string;
  /** Wider main walkways get slightly taller freeboard. */
  kind?: "float" | "pier" | "breakwater";
};

export type PilingRun = {
  id: string;
  from: Vec2;
  to: Vec2;
  count: number;
  radiusM?: number;
};

export type Berth = {
  id: string;
  label: string;
  kind: "alongside" | "slip" | "buoy";
  /** Desired boat-center position when docked. */
  center: Vec2;
  /** Desired final heading when docked. */
  headingDeg: number;
  lengthM: number;
  widthM: number;
  /** Which side of the boat lies against the dock. */
  dockSide: "port" | "starboard";
  /** Allowed heading error when judging "docked" (default 10; 180 for buoys). */
  headingToleranceDeg?: number;
  notes?: string;
};

export type SpawnPoint = {
  id: string;
  label: string;
  kind: "arrival" | "departure";
  position: Vec2;
  yawDeg: number;
  /** Berth this spawn is meant to practice against. */
  berthId: string;
  /**
   * Roughly how far out this exercise starts. "passage" spawns put you a mile
   * or more offshore on the real approach; "close" spawns drop you just
   * outside the berth for repetition work.
   */
  range?: "close" | "approach" | "passage";
  /** One-line description of what the run in actually involves. */
  brief?: string;
};

export type MarinaWind = {
  windKnots: number;
  /** Direction the wind blows toward, degrees true (a NW wind blows toward 135). */
  windTowardDeg: number;
  currentKnots: number;
  currentTowardDeg: number;
  summary: string;
};

export type MarinaLayout = {
  id: string;
  name: string;
  /** Chart to draw the shoreline, depths and OSM structures from. Defaults to `id`. */
  chartId?: string;
  /** Set false for scenes where OSM dock geometry is wrong or unwanted. */
  useChartStructures?: boolean;
  vhfChannel?: string;
  briefing: string[];
  /**
   * Hand-authored above-water structures the chart doesn't carry — rock
   * breakwaters, boathouse rows and the like. The natural shoreline comes
   * from the chart, so this stays short.
   */
  land?: LandMass[];
  trees?: TreeCluster[];
  /** Hand-authored floats: park docks and anything OSM is missing. */
  docks: DockFloat[];
  pilings: PilingRun[];
  berths: Berth[];
  spawns: SpawnPoint[];
  buoys?: Vec2[];
  conditions: MarinaWind;
  /** Suggested approach track per berth, drawn as a wayline. */
  approachLines?: Record<string, Vec2[]>;
};
