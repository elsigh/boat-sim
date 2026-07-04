import { offset, pilingsAlong, walkwayWithFingers } from "./builders";
import type { MarinaLayout, Vec2 } from "./types";

// Squalicum Harbor, Outer Basin, Gate 3 — NW Explorations' charter base.
// Geometry follows OpenStreetMap float outlines and the Port of Bellingham
// marina map: guest/NWE side-tie floats bear 125°/305° true, the departure
// channel runs 035°/215° to the South Entrance, and a rock breakwater closes
// the southwest side. Local frame: origin near the Gate 3 basin, +z north.

const VISITOR_FLOAT_CENTER: Vec2 = [96, 209];
const FLOAT_BEARING = 125;

const nweBerthCenter = offset(VISITOR_FLOAT_CENTER, 35, 4.3);

const dockA = walkwayWithFingers({
  id: "dock-a",
  center: offset(VISITOR_FLOAT_CENTER, 215, 38),
  bearingDeg: FLOAT_BEARING,
  lengthM: 72,
  fingerLengthM: 12.2,
  sides: ["left", "right"],
});
const dockB = walkwayWithFingers({
  id: "dock-b",
  center: offset(VISITOR_FLOAT_CENTER, 215, 78),
  bearingDeg: FLOAT_BEARING,
  lengthM: 72,
  fingerLengthM: 12.2,
  sides: ["left", "right"],
});
const dockC = walkwayWithFingers({
  id: "dock-c",
  center: offset(VISITOR_FLOAT_CENTER, 215, 120),
  bearingDeg: FLOAT_BEARING,
  lengthM: 79,
  fingerLengthM: 15.5,
  sides: ["left", "right"],
});
const dockD = walkwayWithFingers({
  id: "dock-d",
  center: offset(VISITOR_FLOAT_CENTER, 215, 165),
  bearingDeg: FLOAT_BEARING,
  lengthM: 84,
  fingerLengthM: 15.5,
  sides: ["left", "right"],
});
const eastDock1 = walkwayWithFingers({
  id: "east-dock-1",
  center: [125, -10],
  bearingDeg: FLOAT_BEARING,
  lengthM: 80,
  fingerLengthM: 17.5,
  fingerSpacingM: 11,
  sides: ["left", "right"],
});
const eastDock2 = walkwayWithFingers({
  id: "east-dock-2",
  center: [85, -75],
  bearingDeg: FLOAT_BEARING,
  lengthM: 80,
  fingerLengthM: 17.5,
  fingerSpacingM: 11,
  sides: ["left", "right"],
});

const slipBerthCenter = offset(offset([125, -10], FLOAT_BEARING, 20), 215, 9);

export const SQUALICUM_HARBOR: MarinaLayout = {
  id: "bellingham-marina",
  name: "Squalicum Harbor — Gate 3 (NW Explorations)",
  vhfChannel: "16 / harbor office",
  briefing: [
    "Bonum Vitae side-ties on the Gate 3 visitor float, directly below the NW Explorations office.",
    "Departure: back clear, swing the bow to ~215T, and run the channel between the boathouses and the east-basin docks.",
    "South Entrance is a ~47 m gap at the breakwater's SE tip — FL G '3' to starboard on the way out.",
    "Summer mornings are calm; the S-SW sea breeze fills to 10-15 kt by afternoon.",
  ],
  land: [
    {
      id: "ne-shore",
      position: [150.5, 286.8],
      size: [120, 300],
      rotationDeg: FLOAT_BEARING,
      heightM: 3,
      color: "#5c6350",
    },
    {
      id: "east-shore",
      position: [219, 71],
      size: [100, 280],
      rotationDeg: 36,
      heightM: 3,
      color: "#5f6652",
    },
    {
      id: "boathouse-row",
      position: [-15, 40],
      size: [26, 170],
      rotationDeg: 35,
      heightM: 4.5,
      color: "#8a8072",
    },
    {
      id: "breakwater",
      position: [-228, -28],
      size: [14, 390],
      rotationDeg: 312,
      heightM: 2.2,
      color: "#71716a",
    },
    {
      id: "south-spit",
      position: [85, -192],
      size: [24, 280],
      rotationDeg: 90,
      heightM: 1.8,
      color: "#767263",
    },
  ],
  trees: [
    { center: [160, 305], radiusM: 45, count: 28 },
    { center: [240, 110], radiusM: 32, count: 16 },
  ],
  docks: [
    {
      id: "visitor-float",
      position: VISITOR_FLOAT_CENTER,
      size: [3, 85],
      rotationDeg: FLOAT_BEARING,
      color: "#b3a189",
    },
    {
      id: "reciprocal-float",
      position: [107.5, 225.4],
      size: [2.4, 73],
      rotationDeg: FLOAT_BEARING,
    },
    {
      id: "sawtooth-pier",
      position: [154, 118],
      size: [16, 120],
      rotationDeg: 36,
      kind: "pier",
      color: "#7d7264",
    },
    ...dockA.docks,
    ...dockB.docks,
    ...dockC.docks,
    ...dockD.docks,
    ...eastDock1.docks,
    ...eastDock2.docks,
  ],
  pilings: [
    // Pilings hug the float's SW face so the NE berth face stays clear.
    pilingsAlong({
      id: "visitor-pilings",
      center: VISITOR_FLOAT_CENTER,
      bearingDeg: FLOAT_BEARING,
      lengthM: 80,
      offsetM: 1.7,
      count: 6,
    }),
    pilingsAlong({
      id: "sawtooth-pilings-w",
      center: [154, 118],
      bearingDeg: 36,
      lengthM: 114,
      offsetM: -8.6,
      count: 8,
    }),
    ...dockA.pilings,
    ...dockB.pilings,
    ...dockC.pilings,
    ...dockD.pilings,
    ...eastDock1.pilings,
    ...eastDock2.pilings,
  ],
  berths: [
    {
      id: "nwe-side-tie",
      label: "NWE visitor float · side-tie",
      kind: "alongside",
      center: nweBerthCenter,
      headingDeg: 305,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "port",
      notes: "Port-side-to on the Gate 3 visitor float, below the NWE office.",
    },
    {
      id: "east-slip",
      label: "East basin · 56' slip",
      kind: "slip",
      center: slipBerthCenter,
      headingDeg: 35,
      lengthM: 17.5,
      widthM: 5.4,
      dockSide: "starboard",
      notes: "Bow-in between fingers off the east-basin walkway.",
    },
  ],
  spawns: [
    {
      id: "depart-nwe",
      label: "Depart NWE side-tie",
      kind: "departure",
      position: nweBerthCenter,
      yawDeg: 305,
      berthId: "nwe-side-tie",
    },
    {
      id: "arrive-nwe",
      label: "Arrive from the bay → side-tie",
      kind: "arrival",
      position: [-40, -130],
      yawDeg: 32,
      berthId: "nwe-side-tie",
    },
    {
      id: "arrive-east-slip",
      label: "Arrive → east basin slip",
      kind: "arrival",
      position: [-20, -130],
      yawDeg: 35,
      berthId: "east-slip",
    },
  ],
  conditions: {
    windKnots: 12,
    windTowardDeg: 30,
    currentKnots: 0.3,
    currentTowardDeg: 340,
    summary: "SW sea breeze 12 kt (typical summer afternoon); negligible current inside.",
  },
  approachLines: {
    "nwe-side-tie": [
      [-40, -130],
      [0, -70],
      [50, 20],
      [95, 120],
      [125, 168],
      [108, 195],
      [98.5, 212.5],
    ],
    "east-slip": [
      [-20, -130],
      [40, -85],
      [95, -52],
      [136.2, -28.9],
    ],
  },
};
