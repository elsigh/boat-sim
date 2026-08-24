import type { MarinaLayout, Vec2 } from "./types";

// Squalicum Harbor, Bellingham — NW Explorations' charter base.
//
// Coordinates are chart-frame metres about 48.7535 N, 122.5060 W. The
// shoreline, the dredged basins and every finger float come from the
// generated chart (NOAA DEM + OSM), so what lives here is the exercise: which
// float you're tying to, where you start, and what the wind does to you on the
// way in.

const NWE_FLOAT: Vec2 = [32, 437];
const NWE_BERTH: Vec2 = [34, 440];
const FUEL_BERTH: Vec2 = [-273, 167];
const PUMPOUT_BERTH: Vec2 = [-264, 208];

export const SQUALICUM_HARBOR: MarinaLayout = {
  id: "bellingham-marina",
  name: "Squalicum Harbor — Gate 3 (NW Explorations)",
  vhfChannel: "16 / harbor office",
  briefing: [
    "Bonum Vitae side-ties on the Gate 3 visitor float, directly below the NW Explorations office.",
    "In from Bellingham Bay: leave the breakwater to port and run the entrance channel on about 035T.",
    "Inside the basin the fairways are narrow — idle speed, and remember the boat carries way.",
    "Summer mornings are calm; the S-SW sea breeze fills to 10-15 kt by afternoon and sets you onto the float.",
  ],
  docks: [
    // The NWE visitor float sits inboard of the mapped reciprocal float and
    // isn't in OSM, so it's authored here.
    {
      id: "nwe-visitor-float",
      position: NWE_FLOAT,
      size: [3, 82],
      rotationDeg: 125,
      color: "#b3a189",
    },
  ],
  pilings: [
    {
      id: "nwe-pilings",
      from: [-1, 415],
      to: [65, 459],
      count: 6,
      radiusM: 0.24,
    },
  ],
  berths: [
    {
      id: "nwe-side-tie",
      label: "NWE visitor float · side-tie",
      kind: "alongside",
      center: NWE_BERTH,
      headingDeg: 305,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "port",
      notes: "Port-side-to below the NWE office. The afternoon breeze sets you on — use it.",
    },
    {
      id: "east-slip",
      label: "Inner basin · 56' slip",
      kind: "slip",
      center: [72, 199],
      headingDeg: 35,
      lengthM: 17.5,
      widthM: 5.4,
      dockSide: "starboard",
      notes: "Bow-in between fingers. Set up early; there's no room to correct once you're committed.",
    },
    {
      id: "fuel-dock",
      label: "Fuel dock · side-tie",
      kind: "alongside",
      center: FUEL_BERTH,
      headingDeg: 195,
      lengthM: 20,
      widthM: 6,
      dockSide: "starboard",
      notes: "Queue outside if it's occupied; mind the set onto the face.",
    },
    {
      id: "pumpout-side",
      label: "Pumpout · side-tie",
      kind: "alongside",
      center: PUMPOUT_BERTH,
      headingDeg: 215,
      lengthM: 16,
      widthM: 6,
      dockSide: "port",
      notes: "Slow approach — crosswind pushes you into the face.",
    },
  ],
  spawns: [
    {
      id: "arrive-nwe-bay",
      label: "Bellingham Bay → Gate 3 side-tie",
      kind: "arrival",
      position: [-880, -680],
      yawDeg: 35,
      berthId: "nwe-side-tie",
      range: "passage",
      brief: "A mile out in the bay. Find the entrance, run the channel, then work up the fairway.",
    },
    {
      id: "arrive-nwe",
      label: "Off the breakwater → Gate 3 side-tie",
      kind: "arrival",
      position: [-380, -80],
      yawDeg: 35,
      berthId: "nwe-side-tie",
      range: "approach",
      brief: "Just outside the entrance — straight into the fairway work.",
    },
    {
      id: "depart-nwe",
      label: "Depart Gate 3 side-tie",
      kind: "departure",
      position: NWE_BERTH,
      yawDeg: 305,
      berthId: "nwe-side-tie",
      range: "close",
    },
    {
      id: "arrive-east-slip",
      label: "Inner basin → 56' slip",
      kind: "arrival",
      position: [-200, 60],
      yawDeg: 35,
      berthId: "east-slip",
      range: "approach",
    },
    {
      id: "arrive-fuel",
      label: "Arrive → fuel dock",
      kind: "arrival",
      position: [-420, 20],
      yawDeg: 20,
      berthId: "fuel-dock",
      range: "approach",
    },
    {
      id: "arrive-pumpout",
      label: "Arrive → pumpout",
      kind: "arrival",
      position: [-380, 60],
      yawDeg: 35,
      berthId: "pumpout-side",
      range: "approach",
    },
  ],
  conditions: {
    windKnots: 12,
    windTowardDeg: 30,
    currentKnots: 0.3,
    currentTowardDeg: 340,
    summary: "SW sea breeze 12 kt — a typical summer afternoon. Negligible current inside.",
  },
  approachLines: {},
};
