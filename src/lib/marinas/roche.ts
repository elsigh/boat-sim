import type { MarinaLayout, Vec2 } from "./types";
import { ROCHE_FINGERS, ROCHE_I9, ROCHE_SLIP_HEADING } from "./roche-docks";

// Roche Harbor Marina, San Juan Island.
//
// Chart-frame metres about 48.6095 N, 123.1570 W. OSM maps the whole marina —
// A through J docks, the spine, the seaplane dock — so the chart draws it and
// the layout adds the missing fingers from the published marina plan.

const I_DOCK_BERTH: Vec2 = ROCHE_I9;
const H_DOCK_BERTH: Vec2 = [167.1, 191.0];

export const ROCHE_HARBOR: MarinaLayout = {
  id: "roche-harbor-marina",
  name: "Roche Harbor Marina",
  defaultSpawnId: "arrive-roche",
  vhfChannel: "78A",
  briefing: [
    "Call the harbourmaster on 78A before you're inside — they assign the slip and they mean it.",
    "In from Spieden Channel: leave Pearl Island to starboard and come down the marked channel.",
    "The fairways between docks are narrower than they look from outside. Idle in, and set up early.",
    "Afternoon westerly funnels across the fairways and will set you down onto the boat to leeward.",
    "Slip I-9 is on the odd-numbered face of I Dock. Turn across the fairway and bow in toward the walkway.",
  ],
  docks: ROCHE_FINGERS,
  pilings: [],
  berths: [
    {
      id: "roche-i9",
      label: "I Dock · slip I-9",
      kind: "slip",
      center: I_DOCK_BERTH,
      headingDeg: ROCHE_SLIP_HEADING,
      lengthM: 18.3,
      widthM: 6.0,
      dockSide: "port",
      notes: "Bow in toward the spine. Get the boat straight before you commit to the fairway.",
    },
    {
      id: "roche-h-dock",
      label: "H Dock · end tie",
      kind: "alongside",
      center: H_DOCK_BERTH,
      headingDeg: ROCHE_SLIP_HEADING,
      lengthM: 17,
      widthM: 5.2,
      dockSide: "starboard",
      notes: "Come alongside the outer end of H Dock, with the dock to starboard.",
    },
  ],
  spawns: [
    {
      id: "arrive-roche-passage",
      label: "Spieden Channel → Roche Harbor",
      kind: "arrival",
      position: [-620, 1180],
      yawDeg: 150,
      berthId: "roche-i9",
      range: "passage",
      brief: "Down past Pearl Island, into the harbour, and find I Dock.",
    },
    {
      id: "arrive-roche",
      label: "Harbour entrance → slip I-9",
      kind: "arrival",
      position: [-141, 619],
      yawDeg: 160,
      berthId: "roche-i9",
      range: "approach",
    },
    {
      id: "arrive-roche-h",
      label: "Harbour entrance → H Dock end tie",
      kind: "arrival",
      position: [-141, 619],
      yawDeg: 160,
      berthId: "roche-h-dock",
      range: "approach",
    },
    {
      id: "depart-roche",
      label: "Depart slip I-9",
      kind: "departure",
      position: I_DOCK_BERTH,
      yawDeg: ROCHE_SLIP_HEADING,
      berthId: "roche-i9",
      range: "close",
    },
  ],
  conditions: {
    windKnots: 9,
    windTowardDeg: 100,
    currentKnots: 0.3,
    currentTowardDeg: 160,
    summary: "Westerly 9 kt across the fairways; little current inside the harbour.",
  },
  approachLines: {},
};
