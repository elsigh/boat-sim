// Marina scenes use a local, roughly to-scale coordinate frame:
// +z is true north, +x is east, units are meters, y = 0 at the waterline.
// Headings are degrees true (0 = north, 90 = east), matching boat telemetry.

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
  kind: "alongside" | "slip";
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
  vhfChannel?: string;
  briefing: string[];
  land: LandMass[];
  trees?: TreeCluster[];
  docks: DockFloat[];
  pilings: PilingRun[];
  berths: Berth[];
  spawns: SpawnPoint[];
  buoys?: Vec2[];
  conditions: MarinaWind;
  /** Suggested approach track per berth, drawn as a wayline. */
  approachLines?: Record<string, Vec2[]>;
};
