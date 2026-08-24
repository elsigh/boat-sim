import type { MarinaLayout, Vec2 } from "./types";

// Port of Friday Harbor, San Juan Island.
//
// Chart-frame metres about 48.5375 N, 123.0110 W. The port is mapped in OSM
// down to individual docks and breakwaters, so the chart supplies the marina
// and this file supplies the exercises.

const BREAKWATER_B_BERTH: Vec2 = [-465, 165];
const C_DOCK_BERTH: Vec2 = [-564, 36];

export const FRIDAY_HARBOR: MarinaLayout = {
  id: "friday-harbor-marina",
  name: "Port of Friday Harbor",
  vhfChannel: "66A",
  briefing: [
    "Busiest harbour in the islands. Call 66A for a slip and keep a good lookout — the ferry owns the fairway.",
    "In from San Juan Channel: leave Brown Island to port, then round the breakwater into the basin.",
    "Guest moorage is the long outside face of Breakwater B — deep, easy, and exposed to every wake.",
    "The ferry landing is south of the marina. Stay clear when one is manoeuvring; they don't stop.",
    "Flood sets north through the channel and will carry you past the entrance if you're not tracking it.",
  ],
  docks: [],
  pilings: [],
  berths: [
    {
      id: "friday-guest-tie",
      label: "Breakwater B · guest side-tie",
      kind: "alongside",
      center: BREAKWATER_B_BERTH,
      headingDeg: 330,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "port",
      notes: "Outside face, bow north. Deep water right alongside; expect wake all day.",
    },
    {
      id: "friday-c-dock",
      label: "C Dock · side-tie",
      kind: "alongside",
      center: C_DOCK_BERTH,
      headingDeg: 222,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "starboard",
      notes: "Inside the breakwater and out of the wash — but the fairway in is tight.",
    },
  ],
  spawns: [
    {
      id: "arrive-friday-passage",
      label: "San Juan Channel → guest moorage",
      kind: "arrival",
      position: [780, -420],
      yawDeg: 300,
      berthId: "friday-guest-tie",
      range: "passage",
      brief: "In off the channel past Brown Island, watching for the ferry, then onto the outside face.",
    },
    {
      id: "arrive-friday",
      label: "Off the breakwater → guest side-tie",
      kind: "arrival",
      position: [-200, 0],
      yawDeg: 300,
      berthId: "friday-guest-tie",
      range: "approach",
    },
    {
      id: "arrive-friday-c",
      label: "Into the basin → C Dock",
      kind: "arrival",
      position: [-330, 130],
      yawDeg: 250,
      berthId: "friday-c-dock",
      range: "approach",
    },
    {
      id: "depart-friday",
      label: "Depart guest moorage",
      kind: "departure",
      position: BREAKWATER_B_BERTH,
      yawDeg: 330,
      berthId: "friday-guest-tie",
      range: "close",
    },
  ],
  conditions: {
    windKnots: 10,
    windTowardDeg: 20,
    currentKnots: 0.9,
    currentTowardDeg: 10,
    summary: "SW breeze 10 kt; the flood runs close to a knot through the channel outside.",
  },
  approachLines: {},
};
