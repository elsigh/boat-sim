export type NavigationCaution = {
  id: string;
  name: string;
  chartIds: string[];
  lat: number;
  lon: number;
  radiusEastM: number;
  radiusNorthM: number;
  rotationDeg: number;
  source: string;
};

/**
 * Static navigation cautions supported by an authoritative location but not
 * claiming precise real-time boundaries. Rip extent varies with current,
 * wind, and sea state; the plotter shows the place to expect it.
 */
export const NAVIGATION_CAUTIONS: NavigationCaution[] = [
  {
    id: "spieden-east-tide-rips",
    name: "Tide rips",
    chartIds: ["roche-harbor-marina", "reid-harbor-anchorage"],
    lat: 48.627830505371094,
    lon: -123.11164855957031,
    radiusEastM: 700,
    radiusNorthM: 380,
    rotationDeg: 5,
    source: "NOAA current station PUG1719 — Spieden Channel, north of Limestone Point",
  },
];
