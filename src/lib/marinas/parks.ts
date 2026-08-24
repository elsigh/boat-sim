import type { MarinaLayout, Vec2 } from "./types";

// State-park and DNR stops. Coordinates are chart-frame metres about each
// scene origin (scripts/charts/scenes.py); shoreline and depths come from the
// generated chart, so only the floats, buoys and exercises live here.
//
// Park floats are the standard 8 ft (2.4 m) sections. Where OSM already maps
// the dock — Sucia does — the chart draws it and there's nothing to author.

// --- Sucia Island: Fossil Bay ------------------------------------------------

const FOSSIL_BERTH: Vec2 = [-528, -60];

export const SUCIA_FOSSIL_BAY: MarinaLayout = {
  id: "fossil-bay-anchorage",
  name: "Sucia Island — Fossil Bay",
  briefing: [
    "Two park floats on the north shore near the head of the bay; the bay opens ESE.",
    "First-come moorage — land gently, these floats are lightly built.",
    "Thin water at the head: the survey shows 6-8 ft alongside, less at a big low.",
    "Reefs off South Finger Island on the way in — favour the middle of the entrance.",
  ],
  docks: [],
  pilings: [],
  berths: [
    {
      id: "fossil-float-tie",
      label: "Outer park float · side-tie",
      kind: "alongside",
      center: FOSSIL_BERTH,
      headingDeg: 128,
      lengthM: 17,
      widthM: 5,
      dockSide: "port",
      notes: "Bow out toward the entrance so you can leave without turning in the shallows.",
    },
    {
      id: "fossil-anchorage",
      label: "Mid-bay anchorage",
      kind: "buoy",
      center: [-202, -255],
      headingDeg: 128,
      headingToleranceDeg: 180,
      lengthM: 22,
      widthM: 12,
      dockSide: "port",
      notes: "Good mud. Swing room is the constraint, not holding.",
    },
  ],
  spawns: [
    {
      id: "arrive-fossil-passage",
      label: "Rosario Strait → park float",
      kind: "arrival",
      position: [220, -900],
      yawDeg: 300,
      berthId: "fossil-float-tie",
      range: "passage",
      brief: "Up from the strait, into the bay past the Finger Islands, then alongside.",
    },
    {
      id: "arrive-fossil",
      label: "Bay entrance → park float",
      kind: "arrival",
      position: [-120, -280],
      yawDeg: 305,
      berthId: "fossil-float-tie",
      range: "approach",
    },
    {
      id: "depart-fossil",
      label: "Depart the park float",
      kind: "departure",
      position: FOSSIL_BERTH,
      yawDeg: 128,
      berthId: "fossil-float-tie",
      range: "close",
    },
  ],
  buoys: [
    [-300, -140],
    [-250, -180],
    [-190, -215],
    [-140, -255],
  ],
  conditions: {
    windKnots: 6,
    windTowardDeg: 315,
    currentKnots: 0.4,
    currentTowardDeg: 270,
    summary: "Light SE flow up the bay; the ebb sets west outside.",
  },
  approachLines: {},
};

// --- Stuart Island: Reid Harbor ----------------------------------------------

const REID_FLOAT: Vec2 = [-733, 1830];
const REID_BERTH: Vec2 = [-736, 1822];

export const STUART_REID_HARBOR: MarinaLayout = {
  id: "reid-harbor-anchorage",
  name: "Stuart Island — Reid Harbor",
  briefing: [
    "Reid Harbor is a long, narrow, well-protected inlet on the south side of Stuart Island.",
    "In from Spieden Channel: round the west end of Spieden, head north, then west into the entrance.",
    "Gossip Island and Cemetery Island stand in the entrance — leave them to starboard coming in.",
    "One 22 m park float near the head, plus DNR buoys down the middle. Arrive by noon in summer for dock space.",
    "Excellent mud bottom in 25-30 ft if you anchor instead; the harbour goes glassy at night.",
  ],
  docks: [
    {
      id: "reid-park-float",
      position: REID_FLOAT,
      size: [2.4, 22],
      rotationDeg: 108,
      color: "#a89680",
    },
    {
      id: "reid-park-pier",
      position: [-728, 1843],
      size: [2, 26],
      rotationDeg: 113,
      kind: "pier",
      color: "#7d7264",
    },
  ],
  pilings: [
    {
      id: "reid-float-pilings",
      from: [-746, 1834],
      to: [-720, 1826],
      count: 3,
      radiusM: 0.22,
    },
  ],
  berths: [
    {
      id: "reid-float-tie",
      label: "Park float · side-tie",
      kind: "alongside",
      center: REID_BERTH,
      headingDeg: 108,
      lengthM: 17,
      widthM: 5,
      dockSide: "port",
      notes: "Bow out toward the entrance. The float is short — leave room for the boat behind you.",
    },
    {
      id: "reid-buoy",
      label: "DNR mooring buoy",
      kind: "buoy",
      center: [-1250, 1760],
      headingDeg: 108,
      headingToleranceDeg: 180,
      lengthM: 22,
      widthM: 12,
      dockSide: "port",
      notes: "Come up into the wind, hold the boat over the buoy, and let someone reach it with a hook.",
    },
  ],
  spawns: [
    {
      id: "arrive-reid-passage",
      label: "Spieden Channel → Reid Harbor float",
      kind: "arrival",
      position: [900, -2000],
      yawDeg: 315,
      berthId: "reid-float-tie",
      range: "passage",
      brief:
        "Two and a half miles: up from Spieden Channel, north past Gull Reef, then west into the harbour.",
    },
    {
      id: "arrive-reid",
      label: "Harbour entrance → park float",
      kind: "arrival",
      position: [-500, 1150],
      yawDeg: 300,
      berthId: "reid-float-tie",
      range: "approach",
      brief: "Off the entrance with Gossip Island ahead. Turn in and run the length of the harbour.",
    },
    {
      id: "arrive-reid-buoy",
      label: "Pick up a DNR buoy",
      kind: "arrival",
      position: [-800, 1620],
      yawDeg: 300,
      berthId: "reid-buoy",
      range: "approach",
    },
    {
      id: "depart-reid",
      label: "Depart the park float",
      kind: "departure",
      position: REID_BERTH,
      yawDeg: 104,
      berthId: "reid-float-tie",
      range: "close",
    },
  ],
  buoys: [
    [-1700, 1840],
    [-1550, 1810],
    [-1400, 1790],
    [-1250, 1760],
    [-1100, 1720],
    [-950, 1680],
    [-800, 1620],
  ],
  conditions: {
    windKnots: 5,
    windTowardDeg: 110,
    currentKnots: 0.2,
    currentTowardDeg: 100,
    summary: "Light westerly down the harbour; the rips are outside, in Spieden Channel.",
  },
  approachLines: {},
};

// --- Jones Island: North Cove ------------------------------------------------

const JONES_FLOAT: Vec2 = [-170, -180];
const JONES_BERTH: Vec2 = [-161, -180];

export const JONES_NORTH_COVE: MarinaLayout = {
  id: "jones-north-cove",
  name: "Jones Island — North Cove",
  briefing: [
    "A small state-park cove biting into the north side of Jones Island; it opens due north.",
    "One park float plus a handful of buoys — the cove is tight and fills early in summer.",
    "Deep right up to the shore: 40 ft in the middle of the cove, 15 ft at the float.",
    "Wash from San Juan Channel traffic works its way in; expect the boat to roll at the dock.",
  ],
  docks: [
    {
      id: "jones-park-float",
      position: JONES_FLOAT,
      size: [2.4, 24],
      rotationDeg: 5,
      color: "#a89680",
    },
  ],
  pilings: [
    {
      id: "jones-float-pilings",
      from: [-178, -192],
      to: [-177, -168],
      count: 3,
      radiusM: 0.22,
    },
  ],
  berths: [
    {
      id: "jones-float-tie",
      label: "Park float · side-tie",
      kind: "alongside",
      center: JONES_BERTH,
      headingDeg: 5,
      lengthM: 17,
      widthM: 5,
      dockSide: "port",
      notes: "Bow north, out of the cove. Watch the wash rolling in behind you.",
    },
    {
      id: "jones-buoy",
      label: "Park mooring buoy",
      kind: "buoy",
      center: [-130, -95],
      headingDeg: 0,
      headingToleranceDeg: 180,
      lengthM: 22,
      widthM: 12,
      dockSide: "port",
    },
  ],
  spawns: [
    {
      id: "arrive-jones-passage",
      label: "San Juan Channel → North Cove",
      kind: "arrival",
      position: [200, 620],
      yawDeg: 215,
      berthId: "jones-float-tie",
      range: "passage",
      brief: "In off the channel, round into the cove, and take the float.",
    },
    {
      id: "arrive-jones",
      label: "Cove entrance → park float",
      kind: "arrival",
      position: [-100, 20],
      yawDeg: 190,
      berthId: "jones-float-tie",
      range: "approach",
    },
    {
      id: "depart-jones",
      label: "Depart the park float",
      kind: "departure",
      position: JONES_BERTH,
      yawDeg: 5,
      berthId: "jones-float-tie",
      range: "close",
    },
  ],
  buoys: [
    [-130, -95],
    [-95, -125],
    [-160, -130],
  ],
  conditions: {
    windKnots: 7,
    windTowardDeg: 200,
    currentKnots: 0.6,
    currentTowardDeg: 20,
    summary: "NW breeze into the cove mouth; San Juan Channel runs hard outside.",
  },
  approachLines: {},
};

// --- Cypress Island: Eagle Harbor --------------------------------------------

export const CYPRESS_EAGLE_HARBOR: MarinaLayout = {
  id: "eagle-harbor",
  name: "Cypress Island — Eagle Harbor",
  briefing: [
    "DNR mooring buoys only — no dock, no float, no shore power.",
    "The bight opens east onto Bellingham Channel; the whole bay shoals gently toward the beach.",
    "Pick a buoy, come up into the wind, and hold station while someone gets a line through it.",
    "Rosario Strait traffic sends wash across the entrance all afternoon.",
  ],
  docks: [],
  pilings: [],
  berths: [
    {
      id: "eagle-buoy",
      label: "DNR mooring buoy",
      kind: "buoy",
      center: [287, -65],
      headingDeg: 270,
      headingToleranceDeg: 180,
      lengthM: 22,
      widthM: 12,
      dockSide: "port",
      notes: "Approach into the wind. Stop the boat over the buoy, don't drive past it.",
    },
  ],
  spawns: [
    {
      id: "arrive-eagle-passage",
      label: "Bellingham Channel → mooring buoy",
      kind: "arrival",
      position: [1050, -180],
      yawDeg: 280,
      berthId: "eagle-buoy",
      range: "passage",
      brief: "In from the channel, across the shelf, and onto a buoy.",
    },
    {
      id: "arrive-eagle",
      label: "Bay entrance → mooring buoy",
      kind: "arrival",
      position: [520, -90],
      yawDeg: 285,
      berthId: "eagle-buoy",
      range: "approach",
    },
    {
      id: "depart-eagle",
      label: "Slip the buoy and go",
      kind: "departure",
      position: [287, -65],
      yawDeg: 90,
      berthId: "eagle-buoy",
      range: "close",
    },
  ],
  buoys: [
    [287, -65],
    [205, -12],
    [215, -95],
    [160, -40],
    [285, -110],
  ],
  conditions: {
    windKnots: 8,
    windTowardDeg: 250,
    currentKnots: 0.5,
    currentTowardDeg: 350,
    summary: "Easterly into the bay; the flood sets north through Bellingham Channel outside.",
  },
  approachLines: {},
};
