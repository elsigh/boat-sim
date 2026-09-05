"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { RapierRigidBody } from "@react-three/rapier";
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  RepeatWrapping,
  SRGBColorSpace,
  CatmullRomCurve3,
  Color,
  ExtrudeGeometry,
  Shape,
  TubeGeometry,
  Vector3,
  type Group,
  type Texture,
} from "three";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { sampleWaterHeight } from "@/lib/sim/water-surface";

// Parametric topsides by hull profile family (trawler, express, flybridge, superyacht).
// Everything is driven by hull length and beam, with per-family geometry tweaks. Local frame:
// +z bow, +y up, deck plate top at DECK_Y.

// The hull extrusion's top bevel lands near y=0.52, so the deck sits on it.
const DECK_Y = 0.53;
const HOUSE_TOP_Y = 1.58;
const ROOF_TOP_Y = 1.67;

const COLORS = {
  house: "#f6f3ea",
  roof: "#efece2",
  teak: "#a9885c",
  teakDark: "#775a33",
  glass: "#26343d",
  stainless: "#c9d2d8",
  cushion: "#e8e2d2",
  dinghy: "#b8bdc0",
  dinghyFloor: "#9aa0a4",
  bootStripe: "#1f3a52",
  dark: "#3a3632",
};

function buildHullShape(beamM: number, lengthM: number, scale = 1) {
  const halfBeam = beamM * 0.5 * scale;
  const length = lengthM * 0.95 * scale;
  const shape = new Shape();

  shape.moveTo(0, length * 0.5);
  shape.bezierCurveTo(
    halfBeam * 0.22,
    length * 0.48,
    halfBeam * 0.88,
    length * 0.26,
    halfBeam * 0.92,
    -length * 0.18,
  );
  shape.bezierCurveTo(halfBeam * 0.92, -length * 0.36, halfBeam * 0.88, -length * 0.48, halfBeam * 0.77, -length * 0.5);
  shape.lineTo(-halfBeam * 0.77, -length * 0.5);
  shape.bezierCurveTo(-halfBeam * 0.88, -length * 0.48, -halfBeam * 0.92, -length * 0.36, -halfBeam * 0.92, -length * 0.18);
  shape.bezierCurveTo(
    -halfBeam * 0.88,
    length * 0.26,
    -halfBeam * 0.22,
    length * 0.48,
    0,
    length * 0.5,
  );

  return shape;
}

function createTaperedBoxGeometry({
  aftHalfWidth,
  bowHalfWidth,
  height,
  length,
}: {
  aftHalfWidth: number;
  bowHalfWidth: number;
  height: number;
  length: number;
}) {
  const shape = new Shape();

  shape.moveTo(-aftHalfWidth, -length * 0.5);
  shape.lineTo(aftHalfWidth, -length * 0.5);
  shape.lineTo(bowHalfWidth, length * 0.5);
  shape.lineTo(-bowHalfWidth, length * 0.5);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    steps: 1,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  geometry.computeVertexNormals();

  return geometry;
}

function useHullGeometry(beamM: number, lengthM: number) {
  return useMemo(() => {
    const outline = buildHullShape(beamM, lengthM).getPoints(48);
    const rings = [
      { y: 0.51, width: 1, length: 1 },
      { y: -0.64, width: 0.86, length: 0.98 },
      { y: -0.78, width: 0.83, length: 0.975 },
      { y: -1.08, width: 0.72, length: 0.94 },
    ];
    const positions: number[] = [];
    const indices: number[] = [];
    const geometry = new BufferGeometry();
    for (const ring of rings) {
      for (const point of outline) positions.push(point.x * ring.width, ring.y, point.y * ring.length);
    }
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const start = indices.length;
      for (let i = 0; i < outline.length - 1; i++) {
        const a = ring * outline.length + i;
        const b = a + outline.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
      geometry.addGroup(start, indices.length - start, ring === 1 ? 1 : ring === 2 ? 2 : 0);
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [beamM, lengthM]);
}

function useTeakTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const colors = ["#ac8658", "#b38d60", "#a98052", "#b18a5b", "#b79064", "#a78055", "#b99265", "#ad8557"];
    for (let plank = 0; plank < 8; plank++) {
      ctx.fillStyle = colors[plank];
      ctx.fillRect(plank * 32, 0, 32, 512);
      ctx.fillStyle = "#4f4435";
      ctx.fillRect(plank * 32, 0, 1.5, 512);
      for (let grain = 0; grain < 8; grain++) {
        ctx.strokeStyle = `rgba(71, 44, 20, ${0.025 + (grain % 3) * 0.015})`;
        ctx.beginPath();
        ctx.moveTo(plank * 32 + grain * 4, 0);
        ctx.bezierCurveTo(plank * 32 + grain * 4 + 3, 170, plank * 32 + grain * 4 - 2, 340, plank * 32 + grain * 4, 512);
        ctx.stroke();
      }
      ctx.fillStyle = "#6b5137";
      ctx.fillRect(plank * 32, (plank % 3) * 160 + 25, 32, 1);
    }
    const map = new CanvasTexture(canvas);
    map.wrapS = map.wrapT = RepeatWrapping;
    // Extruded deck UVs are metres; each repeat contains eight 12 cm planks.
    map.repeat.set(1 / 0.96, 1 / 2.8);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Flat cap of the hull outline, used for the teak deck and boot stripe. */
function useHullCapGeometry(
  beamM: number,
  lengthM: number,
  scale: number,
  depth: number,
  topY: number,
) {
  return useMemo(() => {
    const geometry = new ExtrudeGeometry(buildHullShape(beamM, lengthM, scale), {
      depth,
      bevelEnabled: false,
      steps: 1,
    });

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, topY, 0);
    geometry.computeVertexNormals();

    return geometry;
  }, [beamM, lengthM, scale, depth, topY]);
}

function useRailGeometry(
  beamM: number,
  lengthM: number,
  scale: number,
  y: number,
  radius: number,
) {
  return useMemo(() => {
    const points = buildHullShape(beamM, lengthM, scale)
      .getPoints(60)
      .map((point) => new Vector3(point.x, y, point.y));
    const curve = new CatmullRomCurve3(points, true);

    return new TubeGeometry(curve, 120, radius, 6, true);
  }, [beamM, lengthM, scale, y, radius]);
}

function useStanchionPositions(beamM: number, lengthM: number, scale: number) {
  return useMemo(() => {
    const points = buildHullShape(beamM, lengthM, scale).getPoints(60);

    return points.filter((_, index) => index % 5 === 0);
  }, [beamM, lengthM, scale]);
}

function TrawlerTopsides({ boat, teakTexture }: { boat: BoatProfile; teakTexture: Texture }) {
  const L = boat.lengthM;
  const B = boat.beamM;

  const salonGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.36,
        bowHalfWidth: B * 0.3,
        height: HOUSE_TOP_Y - DECK_Y,
        length: L * 0.34,
      }),
    [B, L],
  );
  const trunkGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.3,
        bowHalfWidth: B * 0.17,
        height: 0.42,
        length: L * 0.25,
      }),
    [B, L],
  );
  const roofGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.375,
        bowHalfWidth: B * 0.315,
        height: ROOF_TOP_Y - HOUSE_TOP_Y,
        length: L * 0.56,
      }),
    [B, L],
  );
  const salonCenterZ = -L * 0.09;
  const salonLength = L * 0.34;
  const salonFrontZ = salonCenterZ + salonLength * 0.5;
  const sideWindowAngle = Math.atan((B * 0.36 - B * 0.3) / salonLength);
  const roofCenterZ = -L * 0.19;
  const coamingCenterZ = -L * 0.13;
  const archZ = -L * 0.255;
  const archLegTilt = 0.62;
  const dinghyZ = -L * 0.375;
  const postZ = -L * 0.445;

  return (
    <group>
      {/* salon deckhouse */}
      <mesh castShadow receiveShadow geometry={salonGeometry} position={[0, DECK_Y, salonCenterZ]}>
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.6} />
      </mesh>

      {/* salon window band */}
      {[-1, 1].map((side) => (
        <mesh
          key={`salon-window-${side}`}
          position={[side * (B * 0.331 + 0.012), 1.22, salonCenterZ]}
          rotation={[0, -side * sideWindowAngle, 0]}
        >
          <boxGeometry args={[0.04, 0.48, salonLength * 0.88]} />
          <meshStandardMaterial color={new Color(COLORS.glass)} metalness={0.4} roughness={0.15} />
        </mesh>
      ))}
      <mesh position={[0, 1.22, salonFrontZ - 0.01]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[B * 0.55, 0.46, 0.04]} />
        <meshStandardMaterial color={new Color(COLORS.glass)} metalness={0.4} roughness={0.15} />
      </mesh>
      {[-1, 1].flatMap((side) => [-0.3, -0.1, 0.1, 0.3].map((offset) => (
        <mesh key={`window-mullion-${side}-${offset}`} position={[side * (B * (0.33 - offset * 0.06) + 0.03), 1.22, salonCenterZ + salonLength * offset]} rotation={[0, -side * sideWindowAngle, 0]}>
          <boxGeometry args={[0.035, 0.5, 0.04]} />
          <meshStandardMaterial color={COLORS.house} roughness={0.42} />
        </mesh>
      )))}
      {/* brow over the front windows */}
      <mesh castShadow position={[0, 1.54, salonFrontZ + 0.1]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[B * 0.63, 0.05, 0.42]} />
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.55} />
      </mesh>
      {/* aft salon door */}
      <mesh position={[0, 0.94, salonCenterZ - salonLength * 0.5 - 0.01]}>
        <boxGeometry args={[0.9, 0.78, 0.04]} />
        <meshStandardMaterial color={new Color(COLORS.glass)} metalness={0.4} roughness={0.15} />
      </mesh>

      {/* forward trunk cabin */}
      <mesh
        castShadow
        receiveShadow
        geometry={trunkGeometry}
        position={[0, DECK_Y, L * 0.205]}
      >
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.6} />
      </mesh>

      {/* europa roof over salon and aft deck */}
      <mesh castShadow receiveShadow geometry={roofGeometry} position={[0, HOUSE_TOP_Y, roofCenterZ]}>
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.5} />
      </mesh>

      {/* aft roof support posts */}
      {[-1, 1].map((side) => (
        <mesh key={`post-${side}`} castShadow position={[side * B * 0.33, (DECK_Y + HOUSE_TOP_Y) / 2, postZ]}>
          <cylinderGeometry args={[0.035, 0.035, HOUSE_TOP_Y - DECK_Y, 8]} />
          <meshStandardMaterial color={new Color(COLORS.stainless)} metalness={0.75} roughness={0.3} />
        </mesh>
      ))}

      {/* flybridge coaming with venturi windshield */}
      <mesh receiveShadow position={[0, ROOF_TOP_Y + 0.025, coamingCenterZ]}>
        <boxGeometry args={[B * 0.49, 0.035, L * 0.21]} />
        <meshStandardMaterial map={teakTexture} roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`coaming-${side}`} castShadow position={[side * B * 0.265, ROOF_TOP_Y + 0.24, coamingCenterZ]} rotation={[0, side * Math.atan(B * 0.06 / (L * 0.22)), 0]}>
          <boxGeometry args={[0.085, 0.48, L * 0.22]} />
          <meshStandardMaterial color={COLORS.house} roughness={0.45} />
        </mesh>
      ))}
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.24, coamingCenterZ - L * 0.11]}>
        <boxGeometry args={[B * 0.59, 0.48, 0.09]} />
        <meshStandardMaterial color={COLORS.house} roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.22, coamingCenterZ + L * 0.11]}>
        <boxGeometry args={[B * 0.49, 0.44, 0.085]} />
        <meshStandardMaterial color={COLORS.house} roughness={0.45} />
      </mesh>
      <mesh position={[0, ROOF_TOP_Y + 0.66, coamingCenterZ + L * 0.105]} rotation={[-0.32, 0, 0]}>
        <boxGeometry args={[B * 0.44, 0.32, 0.04]} />
        <meshStandardMaterial
          color={new Color(COLORS.glass)}
          metalness={0.4}
          roughness={0.12}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* helm console and wheel */}
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.42, coamingCenterZ + L * 0.045]}>
        <boxGeometry args={[0.95, 0.68, 0.5]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
      </mesh>
      <mesh position={[0, ROOF_TOP_Y + 0.62, coamingCenterZ + L * 0.045 - 0.3]} rotation={[1.15, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.035, 16]} />
        <meshStandardMaterial color={new Color(COLORS.dark)} roughness={0.5} />
      </mesh>

      {/* flybridge bench seat */}
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.34, coamingCenterZ - L * 0.082]}>
        <boxGeometry args={[B * 0.42, 0.3, 0.55]} />
        <meshStandardMaterial color={new Color(COLORS.cushion)} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.55, coamingCenterZ - L * 0.1]}>
        <boxGeometry args={[B * 0.42, 0.38, 0.08]} />
        <meshStandardMaterial color={new Color(COLORS.cushion)} roughness={0.85} />
      </mesh>

      {/* radar arch */}
      {[-1, 1].map((side) => (
        <mesh
          key={`arch-leg-${side}`}
          castShadow
          position={[side * B * 0.23, ROOF_TOP_Y + 0.62, archZ]}
          rotation={[0, 0, side * archLegTilt]}
        >
          <cylinderGeometry args={[0.05, 0.06, 1.5, 8]} />
          <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
        </mesh>
      ))}
      <mesh castShadow position={[0, ROOF_TOP_Y + 1.26, archZ]}>
        <boxGeometry args={[B * 0.26, 0.13, 0.2]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, ROOF_TOP_Y + 1.45, archZ]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[0.27, 16, 12]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.45} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`antenna-${side}`} position={[side * 0.42, ROOF_TOP_Y + 1.72, archZ]}>
          <cylinderGeometry args={[0.015, 0.015, 0.85, 6]} />
          <meshStandardMaterial color={new Color(COLORS.stainless)} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* dinghy on the boat deck */}
      <group position={[0, ROOF_TOP_Y, dinghyZ]}>
        {[-1, 1].map((side) => (
          <mesh key={`pontoon-${side}`} castShadow position={[side * 0.48, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.17, 1.9, 4, 10]} />
            <meshStandardMaterial color={new Color(COLORS.dinghy)} roughness={0.7} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0.34, 1.05]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.16, 0.75, 4, 10]} />
          <meshStandardMaterial color={new Color(COLORS.dinghy)} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.85, 0.18, 2.1]} />
          <meshStandardMaterial color={new Color(COLORS.dinghyFloor)} roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.42, -1.12]}>
          <boxGeometry args={[0.2, 0.34, 0.14]} />
          <meshStandardMaterial color={new Color(COLORS.dark)} roughness={0.6} />
        </mesh>
      </group>

      {/* windlass and foredeck hatch */}
      <mesh castShadow position={[0, DECK_Y + 0.14, L * 0.395]}>
        <boxGeometry args={[0.36, 0.26, 0.46]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, DECK_Y + 0.3, L * 0.395]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.1, 12]} />
        <meshStandardMaterial color={new Color(COLORS.stainless)} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, DECK_Y + 0.46, L * 0.29]}>
        <boxGeometry args={[0.72, 0.06, 0.8]} />
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.5} />
      </mesh>
    </group>
  );
}

function ExpressTopsides({ boat }: { boat: BoatProfile }) {
  const L = boat.lengthM;
  const B = boat.beamM;

  // Lower, sleeker house; longer foredeck; minimal arch; no flybridge bench.
  const coachGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.32,
        bowHalfWidth: B * 0.22,
        height: 0.52,
        length: L * 0.28,
      }),
    [B, L],
  );
  const windscreenZ = -L * 0.04;
  const hardtopGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.34,
        bowHalfWidth: B * 0.28,
        height: 0.12,
        length: L * 0.32,
      }),
    [B, L],
  );
  return (
    <group>
      {/* low coachroof */}
      <mesh castShadow receiveShadow geometry={coachGeometry} position={[0, DECK_Y + 0.28, -L * 0.04]}>
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.6} />
      </mesh>
      {/* wrap windscreen */}
      <mesh position={[0, DECK_Y + 0.48, windscreenZ]} rotation={[-0.22, 0, 0]}>
        <boxGeometry args={[B * 0.62, 0.28, 0.04]} />
        <meshStandardMaterial color={new Color(COLORS.glass)} metalness={0.5} roughness={0.12} />
      </mesh>
      {/* hardtop */}
      <mesh castShadow receiveShadow geometry={hardtopGeometry} position={[0, DECK_Y + 0.62, -L * 0.10]}>
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.5} />
      </mesh>
      {/* radar mast stub */}
      <mesh castShadow position={[0, DECK_Y + 0.86, -L * 0.14]}>
        <boxGeometry args={[B * 0.18, 0.08, 0.16]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
      </mesh>
    </group>
  );
}

function FlybridgeTopsides({ boat }: { boat: BoatProfile }) {
  // Similar to trawler, but broader upper volumes and more forward flybridge.
  const L = boat.lengthM;
  const B = boat.beamM;
  const salonGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.38,
        bowHalfWidth: B * 0.32,
        height: HOUSE_TOP_Y - DECK_Y + 0.06,
        length: L * 0.40,
      }),
    [B, L],
  );
  const roofGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.40,
        bowHalfWidth: B * 0.34,
        height: ROOF_TOP_Y - HOUSE_TOP_Y + 0.06,
        length: L * 0.60,
      }),
    [B, L],
  );
  return (
    <group>
      <mesh castShadow receiveShadow geometry={salonGeometry} position={[0, DECK_Y, -L * 0.11]}>
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.6} />
      </mesh>
      <mesh castShadow receiveShadow geometry={roofGeometry} position={[0, HOUSE_TOP_Y + 0.02, -L * 0.16]}>
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.5} />
      </mesh>
      {/* larger flybridge coaming */}
      <mesh castShadow position={[0, ROOF_TOP_Y + 0.46, -L * 0.18]}>
        <boxGeometry args={[B * 0.54, 0.42, 0.7]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.55} />
      </mesh>
      {/* wrap windshield */}
      <mesh position={[0, ROOF_TOP_Y + 0.78, -L * 0.12]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[B * 0.54, 0.34, 0.04]} />
        <meshStandardMaterial color={new Color(COLORS.glass)} metalness={0.45} roughness={0.12} />
      </mesh>
    </group>
  );
}

function SuperyachtTopsides({ boat }: { boat: BoatProfile }) {
  const L = boat.lengthM;
  const B = boat.beamM;
  // Chunkier house volumes, taller boat deck, bigger mast.
  const houseGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.40,
        bowHalfWidth: B * 0.35,
        height: HOUSE_TOP_Y - DECK_Y + 0.18,
        length: L * 0.48,
      }),
    [B, L],
  );
  const boatDeckGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.44,
        bowHalfWidth: B * 0.38,
        height: 0.24,
        length: L * 0.26,
      }),
    [B, L],
  );
  return (
    <group>
      <mesh castShadow receiveShadow geometry={houseGeometry} position={[0, DECK_Y + 0.02, -L * 0.12]}>
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.6} />
      </mesh>
      <mesh castShadow receiveShadow geometry={boatDeckGeometry} position={[0, HOUSE_TOP_Y + 0.24, -L * 0.18]}>
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0, HOUSE_TOP_Y + 0.56, -L * 0.18]}>
        <boxGeometry args={[B * 0.30, 0.16, 0.28]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, HOUSE_TOP_Y + 0.80, -L * 0.18]} scale={[1, 0.75, 1]}>
        <sphereGeometry args={[0.34, 16, 12]} />
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.45} />
      </mesh>
    </group>
  );
}

export function BoatVisual({
  boat,
  turboActive,
  bodyRef,
  environment,
  grounded = false,
}: {
  boat: BoatProfile;
  turboActive: boolean;
  bodyRef?: MutableRefObject<RapierRigidBody | null>;
  environment?: SimulationEnvironment;
  grounded?: boolean;
}) {
  const visualRef = useRef<Group | null>(null);
  const hullGeometry = useHullGeometry(boat.beamM, boat.lengthM);
  const gunwaleGeometry = useHullCapGeometry(boat.beamM, boat.lengthM, 1, 0.035, 0.515);
  const deckGeometry = useHullCapGeometry(boat.beamM, boat.lengthM, 0.9, 0.07, DECK_Y);
  const teakTexture = useTeakTexture();
  const motionPosition = useMemo(() => new Vector3(), []);
  const capRailGeometry = useRailGeometry(boat.beamM, boat.lengthM, 0.985, 0.56, 0.05);
  const rubRailGeometry = useRailGeometry(boat.beamM, boat.lengthM, 1.006, 0.02, 0.05);
  const lifelineGeometry = useRailGeometry(boat.beamM, boat.lengthM, 0.955, 1.18, 0.024);
  const stanchions = useStanchionPositions(boat.beamM, boat.lengthM, 0.955);
  const fenderStations = useMemo(() => {
    const outline = buildHullShape(boat.beamM, boat.lengthM).getPoints(100).filter((p) => p.x > 0);
    return [-0.32, -0.05, 0.24].map((ratio) => {
      const z = boat.lengthM * ratio;
      const nearest = outline.reduce((best, p) => Math.abs(p.y - z) < Math.abs(best.y - z) ? p : best);
      return { z, x: nearest.x * 0.94 + 0.12 };
    });
  }, [boat.beamM, boat.lengthM]);

  useFrame((state, delta) => {
    const visual = visualRef.current;

    if (!visual) {
      return;
    }

    const smoothing = 1 - Math.exp(-Math.min(delta, 0.1) * 3);
    let targetPitch = turboActive ? -0.16 : 0;
    let targetLift = turboActive ? 0.42 : 0;
    let targetRoll = 0;
    const body = bodyRef ? liveRigidBody(bodyRef) : null;
    if (body && environment && !grounded) {
      visual.getWorldPosition(motionPosition);
      const rotation = body.rotation();
      const yaw = 2 * Math.atan2(rotation.y, rotation.w);
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      const halfLength = boat.lengthM * 0.35;
      const halfBeam = boat.beamM * 0.4;
      const wave = (x: number, z: number) => sampleWaterHeight(x, z, state.clock.elapsedTime, environment);
      const { x, z } = motionPosition;
      targetLift += wave(x, z) * 0.45;
      targetPitch += Math.max(-0.025, Math.min(0.025, (wave(x - dx * halfLength, z - dz * halfLength) - wave(x + dx * halfLength, z + dz * halfLength)) / (halfLength * 2)));
      targetRoll = Math.max(-0.025, Math.min(0.025, (wave(x + dz * halfBeam, z - dx * halfBeam) - wave(x - dz * halfBeam, z + dx * halfBeam)) / (halfBeam * 2)));
      const velocity = body.linvel();
      const surge = (velocity.x - environment.currentVelocity.x) * dx + (velocity.z - environment.currentVelocity.z) * dz;
      targetPitch -= Math.min(0.032, Math.max(0, surge) ** 2 * 0.0005);
    }
    visual.rotation.x += (targetPitch - visual.rotation.x) * smoothing;
    visual.rotation.z += (targetRoll - visual.rotation.z) * smoothing;
    visual.position.y += (targetLift - visual.position.y) * smoothing;
  });

  return (
    <group ref={visualRef}>
      <mesh castShadow receiveShadow geometry={hullGeometry}>
        <meshStandardMaterial
          attach="material-0"
          color={boat.visual.hullColor}
          metalness={0.06}
          roughness={0.32}
        />
        <meshStandardMaterial attach="material-1" color={COLORS.bootStripe} roughness={0.35} />
        <meshStandardMaterial attach="material-2" color="#253b3a" roughness={0.78} />
      </mesh>

      <mesh castShadow receiveShadow geometry={gunwaleGeometry}>
        <meshStandardMaterial color={boat.visual.hullColor} roughness={0.4} />
      </mesh>
      <mesh receiveShadow geometry={deckGeometry}>
        <meshStandardMaterial map={teakTexture} roughness={0.72} />
      </mesh>

      <mesh castShadow geometry={capRailGeometry}>
        <meshStandardMaterial color={new Color(COLORS.teakDark)} roughness={0.65} />
      </mesh>

      <mesh geometry={rubRailGeometry}>
        <meshStandardMaterial color={new Color(COLORS.teakDark)} roughness={0.7} />
      </mesh>

      <mesh geometry={lifelineGeometry}>
        <meshStandardMaterial
          color={new Color(COLORS.stainless)}
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>
      {stanchions.map((point, index) => (
        <mesh key={`stanchion-${index}`} position={[point.x, (DECK_Y + 1.18) / 2, point.y]}>
          <cylinderGeometry args={[0.02, 0.02, 1.18 - DECK_Y, 6]} />
          <meshStandardMaterial
            color={new Color(COLORS.stainless)}
            metalness={0.85}
            roughness={0.25}
          />
        </mesh>
      ))}

      {/* Paired sidelights: red to port (+x), green to starboard (-x). */}
      {[-1, 1].map((side) => (
        <group key={`nav-${side}`} position={[side * boat.beamM * 0.34, 1.37, boat.lengthM * 0.065]}>
          <mesh><boxGeometry args={[0.12, 0.12, 0.22]} /><meshStandardMaterial color="#22302f" roughness={0.4} /></mesh>
          <mesh position={[side * 0.065, 0, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial color={side > 0 ? "#d75443" : "#48bb83"} emissive={side > 0 ? "#b82214" : "#15985a"} emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
      {[-0.36, 0.31].flatMap((z) => [-1, 1].map((side) => (
        <group key={`cleat-${z}-${side}`} position={[side * boat.beamM * (z > 0 ? 0.22 : 0.37), DECK_Y + 0.045, boat.lengthM * z]}>
          <mesh><boxGeometry args={[0.1, 0.035, 0.32]} /><meshStandardMaterial color={COLORS.stainless} metalness={0.8} roughness={0.28} /></mesh>
          <mesh position={[0, 0.07, 0]}><boxGeometry args={[0.06, 0.05, 0.38]} /><meshStandardMaterial color={COLORS.stainless} metalness={0.8} roughness={0.28} /></mesh>
        </group>
      )))}

      {/* swim platform tucked against the transom */}
      <mesh castShadow position={[0, 0.05, -boat.lengthM * 0.475 - 0.28]}>
        <boxGeometry args={[boat.beamM * 0.58, 0.07, 0.85]} />
        <meshStandardMaterial map={teakTexture} roughness={0.72} />
      </mesh>

      {/* fenders along both rails — this is a docking boat, after all */}
      {fenderStations.flatMap(({ x, z }, index) => [-1, 1].map((side) => (
        <group key={`fender-${index}-${side}`} position={[side * x, 0, z]}>
          <mesh position={[0, 0.37, 0]}><cylinderGeometry args={[0.009, 0.009, 0.34, 5]} /><meshStandardMaterial color="#b4a58a" roughness={0.95} /></mesh>
          <mesh position={[0, -0.15, 0]}><capsuleGeometry args={[0.14, 0.42, 4, 10]} /><meshStandardMaterial color="#f2f4f2" roughness={0.6} /></mesh>
        </group>
      )))}

      {boat.visual.hullProfile === "express" ? (
        <ExpressTopsides boat={boat} />
      ) : boat.visual.hullProfile === "flybridge" ? (
        <FlybridgeTopsides boat={boat} />
      ) : boat.visual.hullProfile === "superyacht" ? (
        <SuperyachtTopsides boat={boat} />
      ) : (
        <TrawlerTopsides boat={boat} teakTexture={teakTexture} />
      )}
    </group>
  );
}
