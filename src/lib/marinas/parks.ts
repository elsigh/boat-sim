import { offset } from "./builders";
import type { MarinaLayout } from "./types";

// State-park stops: simple pier-and-float structures per WA State Parks and
// OSM outlines, plus one buoy-only anchorage. Floats are the standard 8'
// (2.4 m) park floats.

const fossilDock2Center = offset([-60, 20], 130, 170);
const fossilBerthCenter = offset(fossilDock2Center, 220, 4);

export const SUCIA_FOSSIL_BAY: MarinaLayout = {
  id: "fossil-bay-anchorage",
  name: "Sucia Island — Fossil Bay",
  briefing: [
    "Two park floats on the north shore near the bay head; the bay opens ESE.",
    "First-come moorage — land gently, these floats are lightly built.",
    "Reefs lie near South Finger Island on the way in.",
  ],
  land: [
    {
      id: "north-shore",
      position: [0, 75],
      size: [90, 400],
      rotationDeg: 130,
      heightM: 4,
      color: "#5a6350",
    },
    {
      id: "south-finger",
      position: [-40, -160],
      size: [70, 380],
      rotationDeg: 130,
      heightM: 3.2,
      color: "#5f6852",
    },
  ],
  trees: [
    { center: [0, 95], radiusM: 70, count: 34 },
    { center: [-50, -170], radiusM: 60, count: 26 },
  ],
  docks: [
    {
      id: "fossil-pier-1",
      position: offset([-60, 20], 40, 20),
      size: [2.5, 40],
      rotationDeg: 40,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "fossil-float-1",
      position: [-60, 20],
      size: [2.4, 48],
      rotationDeg: 130,
    },
    {
      id: "fossil-pier-2",
      position: offset(fossilDock2Center, 40, 20),
      size: [2.5, 40],
      rotationDeg: 40,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "fossil-float-2",
      position: fossilDock2Center,
      size: [2.4, 48],
      rotationDeg: 130,
    },
  ],
  pilings: [
    { id: "fossil-p1", from: offset([-60, 20], 130, -24), to: offset([-60, 20], 130, 24), count: 3 },
    { id: "fossil-p2", from: offset(fossilDock2Center, 130, -24), to: offset(fossilDock2Center, 130, 24), count: 3 },
  ],
  berths: [
    {
      id: "fossil-float-tie",
      label: "Outer park float · side-tie",
      kind: "alongside",
      center: fossilBerthCenter,
      headingDeg: 310,
      lengthM: 17,
      widthM: 5,
      dockSide: "starboard",
    },
  ],
  spawns: [
    {
      id: "arrive-fossil",
      label: "Arrive from Rosario Strait → park float",
      kind: "arrival",
      position: [180, -150],
      yawDeg: 310,
      berthId: "fossil-float-tie",
    },
    {
      id: "depart-fossil",
      label: "Depart park float",
      kind: "departure",
      position: fossilBerthCenter,
      yawDeg: 310,
      berthId: "fossil-float-tie",
    },
  ],
  buoys: [
    [40, -60],
    [90, -95],
    [0, -90],
    [-40, -50],
    [130, -120],
  ],
  conditions: {
    windKnots: 6,
    windTowardDeg: 315,
    currentKnots: 0.4,
    currentTowardDeg: 270,
    summary: "Light SE flow up the bay; ebb sets west outside.",
  },
  approachLines: {
    "fossil-float-tie": [
      [180, -150],
      [110, -90],
      [40, -35],
      [67.4, -92.1],
    ],
  },
};

export const STUART_REID_HARBOR: MarinaLayout = {
  id: "reid-harbor-anchorage",
  name: "Stuart Island — Reid Harbor",
  briefing: [
    "Single 29 m park float near the head of the long, narrow harbor.",
    "Arrive by noon for dock space; excellent mud bottom if you anchor instead.",
  ],
  land: [
    {
      id: "north-shore",
      position: [20, 90],
      size: [120, 400],
      rotationDeg: 115,
      heightM: 5,
      color: "#57614c",
    },
    {
      id: "south-shore",
      position: [-30, -95],
      size: [100, 380],
      rotationDeg: 115,
      heightM: 4.5,
      color: "#5c6650",
    },
    {
      id: "harbor-head",
      position: [-170, 10],
      size: [120, 120],
      rotationDeg: 25,
      heightM: 4,
      color: "#5a644e",
    },
  ],
  trees: [
    { center: [30, 110], radiusM: 80, count: 36 },
    { center: [-40, -110], radiusM: 70, count: 30 },
    { center: [-170, 15], radiusM: 45, count: 20 },
  ],
  docks: [
    {
      id: "reid-pier",
      position: offset([0, 0], 25, 22),
      size: [2.5, 44],
      rotationDeg: 25,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "reid-float",
      position: [0, 0],
      size: [2.4, 29],
      rotationDeg: 115,
    },
  ],
  pilings: [
    { id: "reid-p", from: offset([0, 0], 115, -15), to: offset([0, 0], 115, 15), count: 3 },
  ],
  berths: [
    {
      id: "reid-float-tie",
      label: "Park float · side-tie",
      kind: "alongside",
      center: [-1.6, -3.4],
      headingDeg: 295,
      lengthM: 17,
      widthM: 5,
      dockSide: "starboard",
    },
  ],
  spawns: [
    {
      id: "arrive-reid",
      label: "Arrive up-harbor → park float",
      kind: "arrival",
      position: [170, -55],
      yawDeg: 295,
      berthId: "reid-float-tie",
    },
    {
      id: "depart-reid",
      label: "Depart park float",
      kind: "departure",
      position: [-1.6, -3.4],
      yawDeg: 295,
      berthId: "reid-float-tie",
    },
  ],
  buoys: [
    [60, -25],
    [100, -5],
    [140, -35],
    [40, -45],
  ],
  conditions: {
    windKnots: 5,
    windTowardDeg: 295,
    currentKnots: 0.3,
    currentTowardDeg: 115,
    summary: "Light air funneling along the harbor axis; weak tidal stream.",
  },
  approachLines: {
    "reid-float-tie": [
      [170, -55],
      [90, -30],
      [30, -12],
      [-1.6, -3.4],
    ],
  },
};

export const JONES_NORTH_COVE: MarinaLayout = {
  id: "jones-north-cove",
  name: "Jones Island — North Cove",
  briefing: [
    "Single park float off the pier at the cove head; the cove opens north.",
    "Marked reef at the NE entrance; unmarked rocks along the SE shore.",
    "Constant summer wakes — fender well.",
  ],
  land: [
    {
      id: "cove-head",
      position: [10, -90],
      size: [260, 90],
      rotationDeg: 100,
      heightM: 4.5,
      color: "#59634d",
    },
    {
      id: "east-shore",
      position: [95, 30],
      size: [70, 200],
      rotationDeg: 10,
      heightM: 4,
      color: "#5d6750",
    },
    {
      id: "west-shore",
      position: [-95, 20],
      size: [70, 190],
      rotationDeg: 350,
      heightM: 4,
      color: "#5b654f",
    },
  ],
  trees: [
    { center: [10, -100], radiusM: 70, count: 30 },
    { center: [100, 40], radiusM: 40, count: 18 },
    { center: [-100, 30], radiusM: 40, count: 18 },
  ],
  docks: [
    {
      id: "jones-pier",
      position: offset([0, -60], 37, 20),
      size: [2.5, 40],
      rotationDeg: 37,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "jones-float",
      position: offset([0, -60], 37, 50),
      size: [2.4, 20],
      rotationDeg: 37,
    },
  ],
  pilings: [
    {
      id: "jones-p",
      from: offset(offset([0, -60], 37, 50), 37, -11),
      to: offset(offset([0, -60], 37, 50), 37, 11),
      count: 2,
    },
  ],
  berths: [
    {
      id: "jones-float-tie",
      label: "Park float · side-tie",
      kind: "alongside",
      center: [27.2, -17.9],
      headingDeg: 217,
      lengthM: 17,
      widthM: 5,
      dockSide: "port",
    },
  ],
  spawns: [
    {
      id: "arrive-jones",
      label: "Arrive from the north → park float",
      kind: "arrival",
      position: [-20, 170],
      yawDeg: 195,
      berthId: "jones-float-tie",
    },
    {
      id: "depart-jones",
      label: "Depart park float",
      kind: "departure",
      position: [27.2, -17.9],
      yawDeg: 217,
      berthId: "jones-float-tie",
    },
  ],
  buoys: [
    [-30, 40],
    [-55, 0],
    [-20, -20],
    [15, 60],
  ],
  conditions: {
    windKnots: 6,
    windTowardDeg: 180,
    currentKnots: 0.5,
    currentTowardDeg: 20,
    summary: "Flood pushes north past the cove mouth; northerly chop in high pressure.",
  },
  approachLines: {
    "jones-float-tie": [
      [-20, 170],
      [0, 80],
      [20, 10],
      [27.2, -17.9],
    ],
  },
};

export const CYPRESS_EAGLE_HARBOR: MarinaLayout = {
  id: "eagle-harbor",
  name: "Cypress Island — Eagle Harbor",
  briefing: [
    "No dock here — pick up one of the free DNR mooring buoys.",
    "Come to a stop with the buoy at the bow; heading doesn't matter, drift does.",
    "Cross Rosario at slack; pack out all waste.",
  ],
  land: [
    {
      id: "south-shore",
      position: [10, -120],
      size: [300, 100],
      rotationDeg: 90,
      heightM: 6,
      color: "#546045",
    },
    {
      id: "west-shore",
      position: [-115, 0],
      size: [90, 260],
      rotationDeg: 10,
      heightM: 7,
      color: "#4f5c42",
    },
    {
      id: "east-point",
      position: [115, -45],
      size: [80, 180],
      rotationDeg: 355,
      heightM: 5,
      color: "#57634a",
    },
  ],
  trees: [
    { center: [-120, 0], radiusM: 60, count: 34 },
    { center: [10, -125], radiusM: 70, count: 34 },
    { center: [120, -50], radiusM: 50, count: 24 },
  ],
  docks: [],
  pilings: [],
  berths: [
    {
      id: "eagle-buoy",
      label: "DNR mooring buoy",
      kind: "alongside",
      center: [0, -30],
      headingDeg: 0,
      headingToleranceDeg: 180,
      lengthM: 20,
      widthM: 14,
      dockSide: "port",
      notes: "Stop the boat with the buoy under the bow.",
    },
  ],
  spawns: [
    {
      id: "arrive-eagle",
      label: "Arrive from Rosario → mooring buoy",
      kind: "arrival",
      position: [60, 160],
      yawDeg: 200,
      berthId: "eagle-buoy",
    },
  ],
  buoys: [
    [0, -30],
    [-35, -45],
    [35, -55],
    [-15, -75],
    [25, -10],
  ],
  conditions: {
    windKnots: 7,
    windTowardDeg: 200,
    currentKnots: 0.4,
    currentTowardDeg: 350,
    summary: "Northerly funneling down Rosario; some swirl off the point.",
  },
  approachLines: {
    "eagle-buoy": [
      [60, 160],
      [30, 80],
      [8, 10],
      [0, -30],
    ],
  },
};
