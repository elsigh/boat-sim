"use client";

import { useMemo } from "react";
import {
  CatmullRomCurve3,
  Color,
  ExtrudeGeometry,
  Shape,
  TubeGeometry,
  Vector3,
} from "three";

import type { BoatProfile } from "@/lib/boats/catalog";

// Parametric Grand Banks-style topsides. Everything is driven by hull length
// and beam so the second boat profile still renders sensibly. Local frame:
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
  shape.quadraticCurveTo(halfBeam * 0.9, -length * 0.5, 0, -length * 0.5);
  shape.quadraticCurveTo(
    -halfBeam * 0.9,
    -length * 0.5,
    -halfBeam * 0.92,
    -length * 0.18,
  );
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
  geometry.translate(0, height * 0.5, 0);
  geometry.computeVertexNormals();

  return geometry;
}

function useHullGeometry(beamM: number, lengthM: number) {
  return useMemo(() => {
    const geometry = new ExtrudeGeometry(buildHullShape(beamM, lengthM), {
      depth: 1.32,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.12,
      bevelThickness: 0.18,
      steps: 1,
    });

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0.34, 0);
    geometry.computeVertexNormals();

    return geometry;
  }, [beamM, lengthM]);
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

function GrandBanksTopsides({ boat }: { boat: BoatProfile }) {
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
  const coamingGeometry = useMemo(
    () =>
      createTaperedBoxGeometry({
        aftHalfWidth: B * 0.3,
        bowHalfWidth: B * 0.24,
        height: 0.55,
        length: L * 0.22,
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
      <mesh castShadow receiveShadow geometry={coamingGeometry} position={[0, ROOF_TOP_Y, coamingCenterZ]}>
        <meshStandardMaterial color={new Color(COLORS.house)} roughness={0.55} />
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
      <mesh position={[0, DECK_Y + 0.035, L * 0.29]}>
        <boxGeometry args={[0.72, 0.06, 0.8]} />
        <meshStandardMaterial color={new Color(COLORS.roof)} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function BoatVisual({ boat }: { boat: BoatProfile }) {
  const hullGeometry = useHullGeometry(boat.beamM, boat.lengthM);
  const deckGeometry = useHullCapGeometry(boat.beamM, boat.lengthM, 0.9, 0.07, DECK_Y);
  const bootStripeGeometry = useHullCapGeometry(boat.beamM, boat.lengthM, 1.004, 0.14, -0.12);
  const capRailGeometry = useRailGeometry(boat.beamM, boat.lengthM, 0.985, 0.56, 0.05);
  const rubRailGeometry = useRailGeometry(boat.beamM, boat.lengthM, 1.006, 0.02, 0.05);
  const lifelineGeometry = useRailGeometry(boat.beamM, boat.lengthM, 0.955, 1.18, 0.024);
  const stanchions = useStanchionPositions(boat.beamM, boat.lengthM, 0.955);

  return (
    <group>
      <mesh castShadow receiveShadow geometry={hullGeometry}>
        <meshStandardMaterial
          color={new Color(boat.visual.hullColor)}
          metalness={0.05}
          roughness={0.55}
        />
      </mesh>

      <mesh receiveShadow geometry={deckGeometry}>
        <meshStandardMaterial color={new Color(COLORS.teak)} roughness={0.8} />
      </mesh>

      <mesh geometry={bootStripeGeometry}>
        <meshStandardMaterial color={new Color(COLORS.bootStripe)} roughness={0.5} />
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

      {/* swim platform tucked against the transom */}
      <mesh castShadow position={[0, 0.05, -boat.lengthM * 0.475 - 0.28]}>
        <boxGeometry args={[boat.beamM * 0.58, 0.07, 0.85]} />
        <meshStandardMaterial color={new Color(COLORS.teak)} roughness={0.8} />
      </mesh>

      {/* fenders along both rails — this is a docking boat, after all */}
      {[-0.32, -0.05, 0.24].map((zRatio) =>
        [-1, 1].map((side) => (
          <mesh
            key={`fender-${zRatio}-${side}`}
            position={[side * boat.beamM * 0.485, -0.15, boat.lengthM * zRatio]}
          >
            <capsuleGeometry args={[0.14, 0.42, 4, 10]} />
            <meshStandardMaterial color="#f2f4f2" roughness={0.6} />
          </mesh>
        )),
      )}

      <GrandBanksTopsides boat={boat} />
    </group>
  );
}
