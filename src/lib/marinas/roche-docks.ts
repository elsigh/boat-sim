import type { DockFloat, Vec2 } from "./types";

// OSM provides the promenade, dock axes and end ties, but omits the fingers.
// Stations and nominal finger lengths follow Roche's published 2025 marina map.
// Placement is a scaled reconstruction, not a berth survey. Chart frame: +x east.
const rows: Array<{ name: string; from: Vec2; to: Vec2; bays: number; length: number; sides?: number[] }> = [
  { name: "A", from: [276, -111.4], to: [185.5, -155.1], bays: 10, length: 10 },
  { name: "B", from: [249.7, -68.2], to: [160.7, -102.8], bays: 7, length: 11 },
  { name: "C", from: [211.2, 3.4], to: [128.1, -69.5], bays: 8, length: 15.2, sides: [-1] },
  { name: "D", from: [174.4, 46.9], to: [91, -26.5], bays: 9, length: 12.8 },
  { name: "E", from: [144.7, 82.3], to: [60.8, 8.7], bays: 10, length: 11 },
  { name: "F", from: [103.9, 127.5], to: [19.3, 56.5], bays: 8, length: 17 },
  { name: "G-west", from: [48.1, 189.9], to: [-19, 132], bays: 7, length: 24.4, sides: [-1] },
  { name: "G-east", from: [48.1, 189.9], to: [111.1, 245.5], bays: 5, length: 21.3, sides: [1] },
  { name: "H", from: [99.6, 132.1], to: [162.4, 186.9], bays: 6, length: 19.8 },
  { name: "I", from: [148.1, 78.6], to: [210.1, 132.8], bays: 6, length: 18.3 },
  { name: "J", from: [196.3, 21], to: [243.5, 62.9], bays: 4, length: 21.3 },
  { name: "Guest-south", from: [327.6, -56.3], to: [343.3, 92], bays: 11, length: 17 },
  { name: "Guest-north", from: [343.3, 92], to: [255.8, 206.9], bays: 10, length: 17 },
];

export const ROCHE_FINGERS: DockFloat[] = rows.flatMap((row) => {
  const dx = row.to[0] - row.from[0], dz = row.to[1] - row.from[1];
  const length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
  return Array.from({ length: row.bays - 1 }, (_, i) => (row.sides ?? [-1, 1]).map((side): DockFloat => ({
    id: `roche-${row.name}-finger-${i + 1}-${side}`,
    position: [row.from[0] + dx * (i + 1) / row.bays + nx * side * row.length / 2,
      row.from[1] + dz * (i + 1) / row.bays + nz * side * row.length / 2],
    size: [1.2, row.length], rotationDeg: Math.atan2(nx, nz) * 180 / Math.PI,
    kind: "float", color: "#ad9b7e",
  }))).flat();
});

// I-9: odd-numbered face, between the second and third finger stations.
const iDock = rows.find((r) => r.name === "I")!;
const ix = iDock.to[0] - iDock.from[0], iz = iDock.to[1] - iDock.from[1];
const iLength = Math.hypot(ix, iz);
export const ROCHE_I9: Vec2 = [
  iDock.from[0] + ix * 2.72 / iDock.bays - iz / iLength * 10.95,
  iDock.from[1] + iz * 2.72 / iDock.bays + ix / iLength * 10.95,
];
export const ROCHE_SLIP_HEADING = Math.atan2(iz, -ix) * 180 / Math.PI;
