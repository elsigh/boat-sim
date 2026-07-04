import { offset, walkwayWithFingers } from "./builders";
import type { MarinaLayout } from "./types";

// Roche Harbor Marina, San Juan Island. Geometry from OSM survey outlines and
// the resort dock map: a ~305 m Main Promenade bearing 319° with permanent
// docks C-F (SW side) and H-I-J (NE side), the G dock crossing at the NW end,
// and an L-shaped guest dock wrapping the NE/E edge. The village, Hotel de
// Haro, and the fixed pier sit at the SE corner; the entrance is NW, west of
// Pearl Island. Local frame: +z north, origin mid-basin.

const dockC = walkwayWithFingers({
  id: "roche-c",
  center: [29.5, -49.5],
  bearingDeg: 228.7,
  lengthM: 110,
  fingerLengthM: 15.2,
  fingerSpacingM: 12,
  sides: ["left", "right"],
});
const dockD = walkwayWithFingers({
  id: "roche-d",
  center: [-7.5, -6],
  bearingDeg: 228.3,
  lengthM: 111,
  fingerLengthM: 12.8,
  fingerSpacingM: 11,
  sides: ["left", "right"],
});
const dockE = walkwayWithFingers({
  id: "roche-e",
  center: [-37, 29],
  bearingDeg: 228.6,
  lengthM: 112,
  fingerLengthM: 11,
  fingerSpacingM: 10.5,
  sides: ["left", "right"],
});
const dockF = walkwayWithFingers({
  id: "roche-f",
  center: [-78, 75.5],
  bearingDeg: 229.8,
  lengthM: 110,
  fingerLengthM: 17.1,
  fingerSpacingM: 12.5,
  sides: ["left", "right"],
});
const dockGSouthwest = walkwayWithFingers({
  id: "roche-g-sw",
  center: [-133, 138],
  bearingDeg: 228.7,
  lengthM: 110,
  fingerLengthM: 24,
  fingerSpacingM: 14,
  sides: ["left", "right"],
});
const dockGNortheast = walkwayWithFingers({
  id: "roche-g-ne",
  center: [-60.5, 201.5],
  bearingDeg: 48.9,
  lengthM: 83,
  fingerLengthM: 21,
  fingerSpacingM: 13.5,
  sides: ["left", "right"],
});
const dockH = walkwayWithFingers({
  id: "roche-h",
  center: [-9, 143.5],
  bearingDeg: 48.4,
  lengthM: 83,
  fingerLengthM: 19.8,
  fingerSpacingM: 12.5,
  sides: ["left", "right"],
});
const dockI = walkwayWithFingers({
  id: "roche-i",
  center: [39, 89],
  bearingDeg: 48.9,
  lengthM: 82,
  fingerLengthM: 19,
  fingerSpacingM: 12.5,
  sides: ["left", "right"],
});
const dockJ = walkwayWithFingers({
  id: "roche-j",
  center: [79.5, 26],
  bearingDeg: 48.2,
  lengthM: 63,
  fingerLengthM: 22,
  fingerSpacingM: 13.5,
  sides: ["left", "right"],
});
const guestLeg1Fingers = walkwayWithFingers({
  id: "roche-guest-leg1",
  center: [195, 1.5],
  bearingDeg: 6.1,
  lengthM: 150,
  walkwayWidthM: 3.5,
  fingerLengthM: 12,
  fingerSpacingM: 12.5,
  sides: ["left"],
});
const guestLeg2Fingers = walkwayWithFingers({
  id: "roche-guest-leg2",
  center: [159.5, 133.5],
  bearingDeg: 322.9,
  lengthM: 144,
  walkwayWidthM: 3.5,
  fingerLengthM: 12,
  fingerSpacingM: 12.5,
  sides: ["left"],
});

const guestSideTieCenter = offset([159.5, 133.5], 52.9, 4.3);
const hSlipCenter = offset(offset([-9, 143.5], 48.4, 10), 138.4, 10.5);

export const ROCHE_HARBOR: MarinaLayout = {
  id: "roche-harbor-marina",
  name: "Roche Harbor Marina",
  vhfChannel: "78A",
  briefing: [
    "Enter west of Pearl Island; the shallow channel east of Pearl is foul for a boat this size.",
    "Hail the harbormaster on VHF 78A — dock staff meet you at the slip to catch lines.",
    "Guest moorage is the outer L-shaped dock; big boats side-tie along its outer face.",
    "Watch for Kenmore Air seaplanes taxiing to the float off G dock's outer end.",
  ],
  land: [
    {
      id: "south-shore",
      position: [60, -205],
      size: [560, 60],
      heightM: 3,
      color: "#5d6450",
    },
    {
      id: "village-shore",
      position: [285, -105],
      size: [150, 120],
      rotationDeg: 20,
      heightM: 3.4,
      color: "#6a6a52",
    },
    {
      id: "east-shore",
      position: [285, 10],
      size: [130, 240],
      rotationDeg: 6,
      heightM: 3.2,
      color: "#5c6350",
    },
    {
      id: "west-shore",
      position: [-310, -70],
      size: [120, 280],
      rotationDeg: 10,
      heightM: 3.6,
      color: "#576049",
    },
  ],
  trees: [
    { center: [300, 40], radiusM: 50, count: 30 },
    { center: [-320, -40], radiusM: 45, count: 26 },
    { center: [290, -140], radiusM: 40, count: 20 },
  ],
  docks: [
    {
      id: "main-promenade",
      position: [9, 59],
      size: [4.5, 305],
      rotationDeg: 319,
      color: "#b3a189",
    },
    {
      id: "promenade-shore-connector",
      position: [139, -86.5],
      size: [3, 90],
      rotationDeg: 316.4,
    },
    {
      id: "guest-elbow",
      position: [194.5, -99.5],
      size: [3.5, 56],
      rotationDeg: 344,
    },
    {
      id: "g-end-cross",
      position: [-29, 229],
      size: [2.5, 30],
      rotationDeg: 138.9,
    },
    {
      id: "fuel-pier",
      position: [-235, -113],
      size: [5, 116],
      rotationDeg: 15,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "fuel-float",
      position: [-220, -57.5],
      size: [3, 74],
      rotationDeg: 104.8,
      color: "#b3a189",
    },
    {
      id: "village-pier",
      position: [137, -73],
      size: [30, 45],
      rotationDeg: 6,
      kind: "pier",
      color: "#7d7264",
    },
    {
      id: "a-side-tie",
      position: [6.5, -163.5],
      size: [3, 99],
      rotationDeg: 133.3,
    },
    {
      id: "b-dock",
      position: [71, -99.5],
      size: [3, 107],
      rotationDeg: 68.7,
    },
    ...dockC.docks,
    ...dockD.docks,
    ...dockE.docks,
    ...dockF.docks,
    ...dockGSouthwest.docks,
    ...dockGNortheast.docks,
    ...dockH.docks,
    ...dockI.docks,
    ...dockJ.docks,
    ...guestLeg1Fingers.docks,
    ...guestLeg2Fingers.docks,
  ],
  pilings: [
    ...dockC.pilings,
    ...dockD.pilings,
    ...dockE.pilings,
    ...dockF.pilings,
    ...dockGSouthwest.pilings,
    ...dockGNortheast.pilings,
    ...dockH.pilings,
    ...dockI.pilings,
    ...dockJ.pilings,
    ...guestLeg1Fingers.pilings,
    ...guestLeg2Fingers.pilings,
  ],
  berths: [
    {
      id: "guest-side-tie",
      label: "Guest dock · outer face side-tie",
      kind: "alongside",
      center: guestSideTieCenter,
      headingDeg: 142.9,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "starboard",
      notes: "Starboard-side-to along the guest dock's outer face, as assigned on 78A.",
    },
    {
      id: "h-slip",
      label: "H dock · 65' slip",
      kind: "slip",
      center: hSlipCenter,
      headingDeg: 318.4,
      lengthM: 19.8,
      widthM: 6,
      dockSide: "port",
      notes: "Bow-in from the H-I fairway; staff will take your lines.",
    },
  ],
  spawns: [
    {
      id: "arrive-guest",
      label: "Arrive from entrance → guest side-tie",
      kind: "arrival",
      position: [30, 310],
      yawDeg: 143,
      berthId: "guest-side-tie",
    },
    {
      id: "depart-guest",
      label: "Depart guest side-tie",
      kind: "departure",
      position: guestSideTieCenter,
      yawDeg: 142.9,
      berthId: "guest-side-tie",
    },
    {
      id: "arrive-h-slip",
      label: "Arrive → H dock slip",
      kind: "arrival",
      position: [60, 290],
      yawDeg: 150,
      berthId: "h-slip",
    },
  ],
  conditions: {
    windKnots: 8,
    windTowardDeg: 135,
    currentKnots: 0.2,
    currentTowardDeg: 90,
    summary: "Light NW afternoon breeze funneling in from the entrance; near-calm inside.",
  },
  approachLines: {
    "guest-side-tie": [
      [30, 310],
      [85, 235],
      [130, 180],
      [155, 150],
      [162.9, 136.1],
    ],
    "h-slip": [
      [60, 290],
      [100, 220],
      [70, 165],
      [38, 131],
      [5.5, 142.2],
    ],
  },
};
