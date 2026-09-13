import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, CylinderGeometry,
  Float32BufferAttribute, Path, Quaternion, Shape, ShapeGeometry,
  SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type SmallCraftKind = "power" | "sail";
export type SmallCraftStyle = "express" | "pilothouse" | "flybridge" | "sloop";
export type SmallCraftSpec = { kind: SmallCraftKind; lengthM: number; beamM: number; hullColor: string; accentColor: string };
export type CraftDent = { x: number; z: number; yaw: number; radius: number; severe: boolean };
type V3 = [number, number, number];
export type CraftFinish = "hull" | "white" | "glass" | "metal" | "teak" | "canvas" | "rubber" | "cushion";
export type CraftMesh = { finish: CraftFinish; geometry: BufferGeometry };

export function smallCraftStyle(spec: SmallCraftSpec): SmallCraftStyle {
  if (spec.kind === "sail") return "sloop";
  if (spec.lengthM < 9) return "express";
  // Stable variety: a boat retains its identity after a hit or scene redraw.
  const seed = Math.round(spec.lengthM * 100) + parseInt(spec.hullColor.slice(1), 16);
  return seed % 3 === 0 ? "express" : seed % 3 === 1 ? "pilothouse" : "flybridge";
}

export function smallCraftFreeboard(spec: SmallCraftSpec) {
  return Math.min(1.12, 0.48 + spec.lengthM * (spec.kind === "sail" ? 0.027 : 0.038));
}

/** Fair half-breadths: broad shoulders, a narrowing stern and a fine bow. */
export function smallCraftHalfBeam(spec: SmallCraftSpec, z: number) {
  const u = Math.max(0, Math.min(1, z / spec.lengthM + 0.5));
  const stern = spec.kind === "sail" ? 0.58 : 0.83;
  const width = u < 0.4 ? stern + (1 - stern) * Math.sin(u / 0.4 * Math.PI / 2)
    : Math.cos((u - 0.4) / 0.6 * Math.PI / 2) ** 0.88;
  return spec.beamM * 0.5 * width;
}

function deckHeight(spec: SmallCraftSpec, z: number) {
  const u = z / spec.lengthM;
  return smallCraftFreeboard(spec) + Math.max(0, u) ** 2 * 1.2 + Math.max(0, -u) ** 2 * 0.25;
}

/** Damage marks follow the curved topsides near the waterline. */
export function smallCraftScarSurface(spec: SmallCraftSpec, x: number, z: number) {
  const stern = -spec.lengthM * 0.49;
  const clampedZ = Math.max(stern, Math.min(spec.lengthM * 0.475, z));
  const width = (at: number) => smallCraftHalfBeam(spec, at / 0.98) * 0.91;
  if (z <= stern) return { x: Math.max(-width(stern), Math.min(width(stern), x)), z: stern - 0.025, yaw: Math.PI };
  const side = Math.sign(x || 1), slope = (width(clampedZ + 0.01) - width(clampedZ - 0.01)) / 0.02;
  return { x: side * (width(clampedZ) + 0.025), z: clampedZ, yaw: Math.atan2(side, -slope) };
}

function surface(rows: V3[][], close = false) {
  const positions = rows.flat(2), uvs: number[] = [], indices: number[] = [], count = rows[0].length;
  for (let row = 0; row < rows.length; row++) for (let col = 0; col < count; col++) {
    uvs.push(col / Math.max(1, count - 1), row / Math.max(1, rows.length - 1));
    if (row === rows.length - 1 || (!close && col === count - 1)) continue;
    const a = row * count + col, b = row * count + (col + 1) % count;
    indices.push(a, b, a + count, b, b + count, a + count);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function outline(spec: SmallCraftSpec): V3[] {
  const points: V3[] = [];
  for (const side of [1, -1]) for (let i = 0; i <= 28; i++) {
    const z = ((side === 1 ? i : 28 - i) / 28 - 0.5) * spec.lengthM;
    points.push([side * smallCraftHalfBeam(spec, z), deckHeight(spec, z), z]);
  }
  return points;
}

/** Small fittings are merged by material: eight draws for a detailed vessel.
 * Ordinary triangles preserve the existing collision-fracture pipeline. */
export function createSmallCraftModel(spec: SmallCraftSpec, moored = true, dents: readonly CraftDent[] = []): CraftMesh[] {
  const L = spec.lengthM, B = spec.beamM, deck = smallCraftFreeboard(spec), style = smallCraftStyle(spec), sail = style === "sloop";
  const parts = new Map<CraftFinish, BufferGeometry[]>();
  const add = (finish: CraftFinish, geometry: BufferGeometry) => {
    const list = parts.get(finish) ?? [], flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.clearGroups(); list.push(flat); parts.set(finish, list);
  };
  const box = (finish: CraftFinish, size: V3, at: V3, rotation: V3 = [0, 0, 0], radius = 0.045) => {
    const g = radius === 0 ? new BoxGeometry(...size)
      : new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(n => n * 0.24)));
    g.rotateX(rotation[0]); g.rotateY(rotation[1]); g.rotateZ(rotation[2]); g.translate(...at); add(finish, g);
  };
  const rod = (finish: CraftFinish, a: V3, b: V3, radius = 0.022, topRadius = radius) => {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from);
    if (delta.lengthSq() < 0.000001) return;
    const g = new CylinderGeometry(topRadius, radius, delta.length(), 6, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
    const center = from.add(to).multiplyScalar(0.5);
    g.translate(center.x, center.y, center.z); add(finish, g);
  };
  const tube = (finish: CraftFinish, points: V3[], radius = 0.022, closed = false) => {
    add(finish, new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p)), closed, "centripetal"),
      Math.max(1, points.length - 1), radius, 5, closed));
  };
  const sphere = (finish: CraftFinish, at: V3, scale: V3) => {
    const g = new SphereGeometry(1, 12, 8); g.scale(...scale); g.translate(...at); add(finish, g);
  };
  const plankFloor = (width: number, length: number, y: number, z: number) => {
    box("teak", [width, 0.055, length], [0, y, z]);
    for (let x = -width / 2 + 0.12; x < width / 2; x += 0.16) box("rubber", [0.009, 0.003, length * 0.94], [x, y + 0.029, z], [0, 0, 0], 0);
  };
  const seat = (x: number, y: number, z: number, width: number) => {
    box("white", [width, 0.32, 0.48], [x, y + 0.16, z]);
    box("cushion", [width * 0.96, 0.12, 0.5], [x, y + 0.36, z], [0, 0, 0], 0.06);
    box("cushion", [width, 0.40, 0.12], [x, y + 0.54, z - 0.22]);
  };
  const helm = (x: number, y: number, z: number) => {
    box("white", [0.48, 0.66, 0.3], [x, y + 0.33, z], [-0.12, 0, 0]);
    box("glass", [0.31, 0.18, 0.024], [x, y + 0.59, z - 0.18], [-0.18, 0, 0]);
    const wheel = new TorusGeometry(0.16, 0.015, 5, 16); wheel.rotateX(0.36); wheel.translate(x, y + 0.46, z - 0.24); add("metal", wheel);
  };

  // Flared topsides, bilges, submerged keel and raked stem under a rising sheer.
  const edge = outline(spec), draft = Math.min(1.8, L * (sail ? 0.11 : 0.065));
  add("hull", surface([
    edge,
    edge.map(([x, , z]): V3 => [x * 0.98, deckHeight(spec, z) * 0.40, z * 0.994]),
    edge.map(([x, , z]): V3 => [x * 0.88, -0.08, z * 0.98]),
    edge.map(([x, , z]): V3 => [x * 0.57, -draft * 0.65, z * 0.94]),
    edge.map(([x, , z]): V3 => [x * 0.025, -draft, z * 0.85]),
  ], true));
  const keel = new ShapeGeometry(new Shape(edge.map(([x, , z]) => new Vector2(x * 0.025, z * 0.85))));
  keel.rotateX(Math.PI / 2); keel.translate(0, -draft, 0); add("hull", keel);
  add("rubber", surface([
    edge.map(([x, , z]): V3 => [x * 0.905, 0.025, z * 0.984]),
    edge.map(([x, , z]): V3 => [x * 0.885, -0.075, z * 0.981]),
  ], true));
  tube("rubber", edge.map(([x, y, z]) => [x * 1.006, y - 0.05, z]), 0.029, true);
  tube(sail ? "teak" : "metal", edge, 0.018, true);

  // Side decks surround a genuinely recessed, furnished cockpit.
  const deckShape = new Shape(edge.map(([x, , z]) => new Vector2(x, -z)));
  const cockpitAft = -L * 0.435, cockpitFore = -L * (sail ? 0.17 : 0.16), cockpitWidth = B * (sail ? 0.39 : 0.56);
  const hole = new Path();
  hole.moveTo(-cockpitWidth / 2, -cockpitAft); hole.lineTo(cockpitWidth / 2, -cockpitAft);
  hole.lineTo(cockpitWidth / 2, -cockpitFore); hole.lineTo(-cockpitWidth / 2, -cockpitFore); hole.closePath();
  deckShape.holes.push(hole);
  const deckGeometry = new ShapeGeometry(deckShape); deckGeometry.rotateX(-Math.PI / 2);
  const deckPositions = deckGeometry.getAttribute("position");
  for (let i = 0; i < deckPositions.count; i++) deckPositions.setY(i, deckHeight(spec, deckPositions.getZ(i)) + 0.012);
  deckGeometry.computeVertexNormals(); add("white", deckGeometry);
  const cockpitZ = (cockpitAft + cockpitFore) / 2, cockpitLength = cockpitFore - cockpitAft, floorY = deck - 0.28;
  plankFloor(cockpitWidth, cockpitLength, floorY, cockpitZ);
  for (const side of [-1, 1]) box("white", [0.12, 0.42, cockpitLength], [side * (cockpitWidth / 2 + 0.02), deck - 0.10, cockpitZ]);
  for (const z of [cockpitAft, cockpitFore]) box("white", [cockpitWidth + 0.12, 0.42, 0.10], [0, deck - 0.10, z]);

  // Rounded, tapered deckhouse with a swept windshield, a continuous glazed
  // band, white mullions and a fitted roof overhang.
  const cabin = (width: number, length: number, height: number, y: number, z: number, rake = 0.30) => {
    const perimeter: V3[] = [], corner = Math.min(0.15, width * 0.08);
    for (const [cx, cz, start] of [[width / 2 - corner, length / 2 - corner, 0],
      [-width / 2 + corner, length / 2 - corner, Math.PI / 2],
      [-width / 2 + corner, -length / 2 + corner, Math.PI],
      [width / 2 - corner, -length / 2 + corner, Math.PI * 1.5]]) {
      for (let i = 0; i <= 3; i++) {
        const a = start + i / 3 * Math.PI / 2;
        perimeter.push([cx + Math.cos(a) * corner, 0, cz + Math.sin(a) * corner]);
      }
    }
    const at = (p: V3, t: number, expand = 1): V3 => {
      const fore = p[2] / length + 0.5;
      return [p[0] * (1 - 0.13 * fore) * (1 - 0.10 * t) * expand, y + height * t, z + p[2] - height * rake * t * fore];
    };
    const ring = (t: number, expand = 1) => perimeter.map(p => at(p, t, expand)).reverse();
    add("white", surface([ring(0), ring(0.40)], true));
    add("glass", surface([ring(0.40), ring(0.91)], true));
    add("white", surface([ring(0.91), ring(1)], true));
    const roofRing = ring(1.02, 1.05);
    const roof = new ShapeGeometry(new Shape(roofRing.map(([x, , az]) => new Vector2(x, -az))));
    roof.rotateX(-Math.PI / 2); roof.translate(0, y + height * 1.02, 0); add("white", roof);
    add("white", surface([ring(0.98, 1.05), roofRing], true));
    for (const side of [-1, 1]) for (const fraction of [-0.40, -0.12, 0.18, 0.39]) {
      rod("white", at([side * width / 2, 0, length * fraction], 0.4), at([side * width / 2, 0, length * fraction], 0.92), 0.038);
    }
    for (const fraction of [-0.25, 0.25]) rod("white", at([width * fraction, 0, length / 2], 0.4), at([width * fraction, 0, length / 2], 0.93), 0.027);
    tube("white", ring(0.4), 0.02, true); tube("white", ring(0.92), 0.02, true);
    return y + height * 1.02;
  };
  const canopy = (width: number, length: number, y: number, z: number, footY: number) => {
    const rows: V3[][] = [];
    for (let j = 0; j <= 2; j++) rows.push(Array.from({ length: 13 }, (_, i): V3 => {
      const x = (i / 12 - 0.5) * width;
      return [x, y + (1 - (x / (width / 2)) ** 2) * 0.16, z + (j / 2 - 0.5) * length];
    }));
    add("canvas", surface(rows));
    for (const row of [rows[0], rows[2]]) {
      tube("metal", row, 0.014);
      for (const side of [-1, 1]) rod("metal", [side * width / 2, y, row[0][2]], [side * width * 0.44, footY, row[0][2] + 0.1], 0.018);
    }
  };

  // Tubular pulpits, lifelines, stanchions and cleats follow the actual sheer.
  const railStart = sail ? -0.45 : -0.11;
  for (const side of [-1, 1]) {
    const rail: V3[] = [];
    for (let i = 0; i <= 18; i++) {
      const z = L * (railStart + (0.48 - railStart) * i / 18);
      rail.push([side * smallCraftHalfBeam(spec, z) * 0.95, deckHeight(spec, z) + 0.57, z]);
      if (i % 3 === 0) rod("metal", [rail[i][0], deckHeight(spec, z), z], rail[i], 0.018);
    }
    tube("metal", rail, sail ? 0.011 : 0.023);
    if (sail) tube("metal", rail.map(([x, y, z]) => [x, y - 0.27, z]), 0.008);
    tube("metal", [rail[18], [0, deckHeight(spec, L * 0.50) + 0.57, L * 0.51]], 0.022);
    for (const fraction of [-0.4, 0.28]) {
      const z = L * fraction, x = side * smallCraftHalfBeam(spec, z) * 0.84, y = deckHeight(spec, z);
      rod("metal", [x, y, z], [x, y + 0.075, z], 0.025);
      rod("metal", [x, y + 0.08, z - 0.10], [x, y + 0.08, z + 0.10], 0.025);
    }
  }

  if (sail) {
    cabin(B * 0.58, L * 0.40, 0.43, deck - 0.035, L * 0.06, 0.65);
    for (const z of [0.02, 0.18, 0.31]) box("glass", [B * 0.20, 0.045, L * 0.055], [0, deck + (z === 0.31 ? 0.17 : 0.43), L * z]);
    for (const side of [-1, 1]) {
      rod("teak", [side * B * 0.21, deck + 0.46, -L * 0.04], [side * B * 0.18, deck + 0.46, L * 0.20], 0.025);
      box("teak", [B * 0.13, 0.065, cockpitLength * 0.93], [side * B * 0.265, deck + 0.04, cockpitZ]);
      rod("metal", [side * B * 0.29, deck + 0.15, -L * 0.16], [side * B * 0.29, deck + 0.31, -L * 0.16], 0.075, 0.055);
      tube("metal", [[side * B * 0.31, deck + 0.60, -L * 0.44], [side * B * 0.29, deck + 0.60, -L * 0.48], [0, deck + 0.60, -L * 0.49]], 0.023);
    }
    box("rubber", [B * 0.22, 0.38, 0.03], [0, deck + 0.13, -L * 0.145]);
    helm(0, floorY, -L * 0.34);
    canopy(B * 0.57, L * 0.12, deck + 0.80, -L * 0.12, deck + 0.04);
    // Tapered spar, spreaders, shrouds, forestay, backstay and furled genoa.
    const mastZ = L * 0.105, mastTop = deck + L * 1.18;
    rod("metal", [0, deck + 0.28, mastZ], [0, mastTop, mastZ], 0.066, 0.035);
    for (const height of [0.46, 0.72]) {
      const y = deck + L * height, reach = B * (height === 0.46 ? 0.29 : 0.21);
      rod("metal", [-reach, y, mastZ], [reach, y, mastZ], 0.022);
      for (const side of [-1, 1]) {
        rod("metal", [side * B * 0.43, deck, mastZ - L * 0.025], [side * reach, y, mastZ], 0.008);
        rod("metal", [side * reach, y, mastZ], [0, mastTop, mastZ], 0.008);
      }
    }
    rod("metal", [0, deck + 0.10, L * 0.475], [0, mastTop - 0.12, mastZ], 0.009);
    rod("white", [0, deck + 0.20, L * 0.47], [0, mastTop - 0.35, mastZ + 0.012], 0.04, 0.024);
    rod("metal", [0, deck + 0.12, -L * 0.47], [0, mastTop - 0.08, mastZ], 0.008);
    const boomY = deck + 0.92;
    rod("metal", [0, boomY, mastZ], [0, boomY - 0.06, -L * 0.31], 0.044);
    const cover = new CapsuleGeometry(0.14, L * 0.37, 3, 8); cover.rotateX(Math.PI / 2); cover.scale(0.85, 1, 1);
    cover.translate(0, boomY + 0.10, -L * 0.10); add("canvas", cover);
    for (const fraction of [-0.27, -0.16, -0.05, 0.06]) rod("teak", [-0.12, boomY + 0.20, L * fraction], [0.12, boomY + 0.20, L * fraction], 0.012);
    rod("metal", [0, boomY, -L * 0.27], [0, mastTop * 0.61, mastZ], 0.007);
  } else {
    const houseHeight = style === "express" ? 0.47 : Math.min(1.75, B * 0.43);
    const houseZ = style === "express" ? L * 0.16 : L * 0.065, houseLength = L * (style === "express" ? 0.30 : 0.41);
    const roof = style === "pilothouse"
      ? cabin(B * 0.67, L * 0.30, houseHeight * 0.78, deck - 0.04, L * 0.005, 0.14)
      : cabin(B * 0.67, houseLength, houseHeight, deck - 0.04, houseZ, 0.42);
    // A raised wheelhouse ahead of the lower salon breaks up the trawler's
    // roofline and leaves a walkable side deck around both houses.
    if (style === "pilothouse") cabin(B * 0.63, L * 0.17, houseHeight * 0.86, deck + 0.16, L * 0.16, 0.20);
    seat(0, floorY, -L * 0.405, B * 0.52);
    plankFloor(B * 0.72, L * 0.065, deck * 0.30, -L * 0.495);
    for (const side of [-1, 1]) {
      rod("metal", [side * B * 0.32, deck * 0.30, -L * 0.47], [side * B * 0.32, deck + 0.42, -L * 0.44], 0.022);
      for (const fraction of [0.12, 0.23, 0.32]) {
        const z = fraction * L, x = side * smallCraftHalfBeam(spec, z) * 0.977;
        box("glass", [0.026, 0.16, L * 0.034], [x, deckHeight(spec, z) * 0.64, z], [0, side * 0.25, 0]);
      }
    }
    box("glass", [B * 0.22, 0.04, L * 0.07], [0, deckHeight(spec, L * 0.36) + 0.04, L * 0.36]);
    if (style === "express") {
      const lower: V3[] = [], upper: V3[] = [];
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16 - 0.5) * B * 0.70, z = L * (0.018 - 0.09 * (Math.abs(x) / (B * 0.35)) ** 2);
        lower.push([x, deck + 0.22, z]); upper.push([x * 0.90, deck + 0.85, z - 0.25]);
      }
      add("glass", surface([lower, upper])); tube("metal", upper, 0.024); tube("white", lower, 0.035);
      for (const i of [0, 8, 16]) rod("metal", lower[i], upper[i], 0.021);
      for (const side of [-1, 1]) seat(side * B * 0.18, deck - 0.08, -L * 0.12, B * 0.25);
      helm(-B * 0.18, deck - 0.08, -L * 0.035);
      canopy(B * 0.70, L * 0.20, deck + 1.38, -L * 0.15, deck + 0.04);
    } else {
      box("glass", [B * 0.30, houseHeight * 0.75, 0.025], [0, deck + houseHeight * 0.40, houseZ - houseLength / 2 - 0.012]);
      if (style === "flybridge") {
        cabin(B * 0.52, L * 0.18, 0.42, roof + 0.04, L * 0.055, 0.60);
        helm(-B * 0.12, roof + 0.08, L * 0.025);
        seat(-B * 0.12, roof + 0.05, -L * 0.035, B * 0.23);
        seat(B * 0.15, roof + 0.05, -L * 0.06, B * 0.24);
        canopy(B * 0.61, L * 0.20, roof + 1.25, -L * 0.02, roof + 0.02);
      }
      const radarY = roof + (style === "flybridge" ? 1.42 : 0.30);
      rod("metal", [0, roof, -L * 0.13], [0, radarY + 0.30, -L * 0.13], 0.044);
      sphere("white", [0, radarY + 0.27, -L * 0.13], [0.23, 0.15, 0.23]);
      rod("metal", [-B * 0.23, roof, -L * 0.09], [-B * 0.23, radarY + 0.85, -L * 0.09], 0.012, 0.005);
      if (style === "pilothouse") for (const side of [-1, 1]) tube("teak", [[side * B * 0.31, roof + 0.04, L * 0.02], [side * B * 0.32, roof + 0.04, -L * 0.09]], 0.027);
    }
    box("metal", [0.11, 0.07, L * 0.065], [0, deckHeight(spec, L * 0.47) + 0.035, L * 0.465]);
    rod("metal", [-0.10, deckHeight(spec, L * 0.39) + 0.12, L * 0.39], [0.10, deckHeight(spec, L * 0.39) + 0.12, L * 0.39], 0.07);
  }

  // Underway craft stow the dock fenders.
  if (moored) for (const side of [-1, 1]) for (const fraction of [-0.27, 0.10]) {
    const z = fraction * L, x = side * (smallCraftHalfBeam(spec, z) + 0.10), y = deckHeight(spec, z);
    rod("canvas", [side * smallCraftHalfBeam(spec, z) * 0.96, y + 0.40, z], [x, 0.35, z], 0.009);
    const fender = new CapsuleGeometry(Math.min(0.14, B * 0.034), 0.34, 3, 8); fender.translate(x, 0.16, z); add("white", fender);
    sphere("rubber", [x, 0.39, z], [0.06, 0.025, 0.06]);
  }

  const severe = dents.some(d => d.severe);
  return [...parts].map(([finish, geometries]) => {
    const geometry = mergeGeometries(geometries)!;
    for (const source of geometries) source.dispose();
    if (dents.length) {
      const p = geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        for (const dent of dents) {
          const weight = Math.max(0, 1 - Math.hypot(x - dent.x, z - dent.z) / (dent.radius * 1.6)) * Math.max(0, 1 - Math.abs(y - 0.15) / (deck + 0.8));
          x -= Math.sin(dent.yaw) * weight * 0.42; z -= Math.cos(dent.yaw) * weight * 0.42; y -= weight * 0.16;
        }
        if (sail && y > deck + 1.3) x += (y - deck - 1.3) * (severe ? 0.43 : 0.08);
        p.setXYZ(i, x, y, z);
      }
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { finish, geometry };
  });
}
