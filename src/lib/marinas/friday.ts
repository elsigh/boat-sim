import { offset, walkwayWithFingers } from "./builders";
import type { MarinaLayout } from "./types";

// Port of Friday Harbor. Geometry from the Port's Moffatt & Nichol dock map
// and OSM survey outlines: four floating concrete breakwaters (A north,
// B northeast, C east, D southeast) enclose parallel finger docks on a
// 044°/224° axis. Guests over 45' side-tie on the southern breakwaters or
// inside Breakwater A. The WSF ferry terminal is ~120 m southeast of D —
// expect wakes along the outer faces. Local frame: +z north, origin mid-basin.

const dockH = walkwayWithFingers({
  id: "fh-h",
  center: [-71.5, 142.6],
  bearingDeg: 44,
  lengthM: 154,
  fingerLengthM: 11.5,
  fingerSpacingM: 10.5,
  sides: ["left", "right"],
});
const dockG = walkwayWithFingers({
  id: "fh-g",
  center: [-39.1, 111.3],
  bearingDeg: 44,
  lengthM: 138,
  fingerLengthM: 11.5,
  fingerSpacingM: 10.5,
  sides: ["left", "right"],
});
const dockF = walkwayWithFingers({
  id: "fh-f",
  center: [-4.6, 77.9],
  bearingDeg: 44,
  lengthM: 142,
  fingerLengthM: 11.5,
  fingerSpacingM: 10.5,
  sides: ["left", "right"],
});
const dockE = walkwayWithFingers({
  id: "fh-e",
  center: [31.4, 43.2],
  bearingDeg: 44,
  lengthM: 152,
  fingerLengthM: 11.5,
  fingerSpacingM: 10.5,
  sides: ["left", "right"],
});
const dockCFingers = walkwayWithFingers({
  id: "fh-c-dock",
  center: [63, 12.6],
  bearingDeg: 44,
  lengthM: 208,
  fingerLengthM: 11.5,
  fingerSpacingM: 10.5,
  sides: ["left"],
});

const breakwaterCBerthCenter = offset([126.8, -85], 275, 4.3);
const breakwaterABerthCenter = offset([24, 179.5], 204, 4.3);
const mDockBerthCenter = offset([65, -10], 240, 4.1);

export const FRIDAY_HARBOR: MarinaLayout = {
  id: "friday-harbor-marina",
  name: "Port of Friday Harbor",
  vhfChannel: "66A",
  briefing: [
    "Hail the port on VHF 66A when in sight of the marina; guests over 45' get breakwater side-ties.",
    "North entrance is a 44 m gap between Breakwaters A and B; the south entrance is wider, by the fuel pier.",
    "State ferries land just southeast of Breakwater D — mind their wakes on the outer faces.",
    "Inside faces are calm; Brown Island shelters the whole harbor.",
  ],
  land: [
    {
      id: "south-shore",
      position: [-20, -300],
      size: [500, 100],
      heightM: 3.5,
      color: "#5d6450",
    },
    {
      id: "west-shore",
      position: [-190, -40],
      size: [130, 320],
      rotationDeg: 343,
      heightM: 4,
      color: "#586049",
    },
    {
      id: "brown-island",
      position: [330, -30],
      size: [200, 300],
      heightM: 5,
      color: "#556047",
    },
  ],
  trees: [
    { center: [330, -30], radiusM: 85, count: 40 },
    { center: [-200, -60], radiusM: 50, count: 26 },
    { center: [-60, -290], radiusM: 60, count: 22 },
  ],
  docks: [
    {
      id: "breakwater-a",
      position: [24, 179.5],
      size: [5, 92],
      rotationDeg: 114,
      kind: "breakwater",
      color: "#9aa0a3",
    },
    {
      id: "breakwater-b",
      position: [81, 48.5],
      size: [5, 199],
      rotationDeg: 330,
      kind: "breakwater",
      color: "#9aa0a3",
    },
    {
      id: "breakwater-c",
      position: [126.8, -85],
      size: [5, 95],
      rotationDeg: 5,
      kind: "breakwater",
      color: "#9aa0a3",
    },
    {
      id: "breakwater-d",
      position: [91.3, -164.7],
      size: [5, 90],
      rotationDeg: 44,
      kind: "breakwater",
      color: "#9aa0a3",
    },
    {
      id: "m-dock",
      position: [65, -10],
      size: [3, 175],
      rotationDeg: 330,
    },
    {
      id: "walkway-d",
      position: [-67, 12],
      size: [2.5, 190],
      rotationDeg: 322,
    },
    {
      id: "a-dock",
      position: [-60, -120],
      size: [2.5, 86],
      rotationDeg: 309,
    },
    {
      id: "w-dock",
      position: [-90, -155],
      size: [2.5, 81],
      rotationDeg: 314,
    },
    {
      id: "fuel-pier",
      position: [0, -245],
      size: [6, 40],
      rotationDeg: 20,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "fuel-float",
      position: [-7, -222],
      size: [3, 30],
      rotationDeg: 110,
      color: "#b3a189",
    },
    {
      id: "ferry-terminal",
      position: [96, -300],
      size: [24, 90],
      rotationDeg: 350,
      kind: "pier",
      color: "#77685a",
    },
    ...dockH.docks,
    ...dockG.docks,
    ...dockF.docks,
    ...dockE.docks,
    ...dockCFingers.docks,
  ],
  pilings: [
    ...dockH.pilings,
    ...dockG.pilings,
    ...dockF.pilings,
    ...dockE.pilings,
    ...dockCFingers.pilings,
  ],
  berths: [
    {
      id: "breakwater-c-tie",
      label: "Breakwater C · guest side-tie",
      kind: "alongside",
      center: breakwaterCBerthCenter,
      headingDeg: 5,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "starboard",
      notes: "Southern breakwaters are reserved for boats over 45'.",
    },
    {
      id: "breakwater-a-tie",
      label: "Breakwater A · inside face",
      kind: "alongside",
      center: breakwaterABerthCenter,
      headingDeg: 294,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "port",
      notes: "Inside face only — the outside takes a beating from ferry wakes.",
    },
    {
      id: "m-dock-tie",
      label: "M dock · side-tie",
      kind: "alongside",
      center: mDockBerthCenter,
      headingDeg: 330,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "starboard",
      notes: "Long side-tie dock on the east edge of the slip basin.",
    },
  ],
  spawns: [
    {
      id: "arrive-breakwater-c",
      label: "Arrive south entrance → Breakwater C",
      kind: "arrival",
      position: [170, -240],
      yawDeg: 285,
      berthId: "breakwater-c-tie",
    },
    {
      id: "depart-breakwater-c",
      label: "Depart Breakwater C side-tie",
      kind: "departure",
      position: breakwaterCBerthCenter,
      yawDeg: 5,
      berthId: "breakwater-c-tie",
    },
    {
      id: "arrive-breakwater-a",
      label: "Arrive north entrance → Breakwater A",
      kind: "arrival",
      position: [150, 230],
      yawDeg: 245,
      berthId: "breakwater-a-tie",
    },
  ],
  conditions: {
    windKnots: 7,
    windTowardDeg: 180,
    currentKnots: 0.2,
    currentTowardDeg: 315,
    summary: "Light afternoon northerly; sheltered by Brown Island. Ferry wakes outside.",
  },
  approachLines: {
    "breakwater-c-tie": [
      [170, -240],
      [75, -228],
      [45, -190],
      [80, -140],
      [110, -105],
      [122.5, -84.6],
    ],
    "breakwater-a-tie": [
      [150, 230],
      [90, 185],
      [48, 148],
      [28, 158],
      [22.2, 175.6],
    ],
  },
};
