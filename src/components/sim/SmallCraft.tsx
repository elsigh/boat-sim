"use client";

// Cheap parametric neighbor boats — a marina's worth of these renders at once,
// so each one is a handful of boxes and cylinders, no extrusions. Local frame
// matches the player boat: +z bow, y = 0 at the waterline.

export type SmallCraftKind = "power" | "sail";

export type SmallCraftSpec = {
  kind: SmallCraftKind;
  lengthM: number;
  beamM: number;
  hullColor: string;
  accentColor: string;
};

export const SMALL_CRAFT_HULL_COLORS = [
  "#f4f1e8",
  "#e8e4d8",
  "#dfe3e4",
  "#22384c",
  "#2f4a3d",
  "#6d1f24",
  "#f0ead9",
  "#3a3f45",
];

export const SMALL_CRAFT_ACCENT_COLORS = [
  "#1f3a52",
  "#7a2c2c",
  "#2c5d4f",
  "#8a7a63",
  "#39536b",
];

export function SmallCraft({ spec }: { spec: SmallCraftSpec }) {
  const { kind, lengthM: length, beamM: beam, hullColor, accentColor } = spec;
  const freeboard = kind === "sail" ? 0.75 : 0.85;

  return (
    <group>
      {/* hull: main box with a tapered bow wedge */}
      <mesh castShadow position={[0, freeboard * 0.5 - 0.25, -length * 0.08]}>
        <boxGeometry args={[beam, freeboard, length * 0.78]} />
        <meshStandardMaterial color={hullColor} roughness={0.55} />
      </mesh>
      <mesh
        castShadow
        position={[0, freeboard * 0.5 - 0.25, length * 0.33]}
        rotation={[0, Math.PI / 4, 0]}
      >
        <boxGeometry args={[beam * 0.707, freeboard, beam * 0.707]} />
        <meshStandardMaterial color={hullColor} roughness={0.55} />
      </mesh>

      {/* rub rail stripe */}
      <mesh position={[0, freeboard - 0.28, -length * 0.08]}>
        <boxGeometry args={[beam * 1.02, 0.07, length * 0.78]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} />
      </mesh>

      {kind === "power" ? (
        <>
          {/* cabin and windshield */}
          <mesh castShadow position={[0, freeboard + 0.32, length * 0.06]}>
            <boxGeometry args={[beam * 0.72, 0.72, length * 0.34]} />
            <meshStandardMaterial color="#f2efe6" roughness={0.6} />
          </mesh>
          <mesh position={[0, freeboard + 0.42, length * 0.235]} rotation={[-0.35, 0, 0]}>
            <boxGeometry args={[beam * 0.62, 0.42, 0.05]} />
            <meshStandardMaterial color="#26343d" metalness={0.4} roughness={0.15} />
          </mesh>
          <mesh castShadow position={[0, freeboard + 0.78, -length * 0.02]}>
            <boxGeometry args={[beam * 0.78, 0.08, length * 0.42]} />
            <meshStandardMaterial color="#e9e5da" roughness={0.55} />
          </mesh>
          {/* radar post */}
          <mesh position={[0, freeboard + 1.12, -length * 0.1]}>
            <cylinderGeometry args={[0.03, 0.04, 0.6, 6]} />
            <meshStandardMaterial color="#c9d2d8" metalness={0.7} roughness={0.35} />
          </mesh>
        </>
      ) : (
        <>
          {/* low trunk cabin */}
          <mesh castShadow position={[0, freeboard + 0.16, length * 0.08]}>
            <boxGeometry args={[beam * 0.66, 0.4, length * 0.36]} />
            <meshStandardMaterial color="#efece2" roughness={0.6} />
          </mesh>
          {/* mast with a hint of a boom, sails flaked away */}
          <mesh castShadow position={[0, freeboard + length * 0.62, length * 0.12]}>
            <cylinderGeometry args={[0.045, 0.07, length * 1.24, 8]} />
            <meshStandardMaterial color="#d9dcdf" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh
            castShadow
            position={[0, freeboard + 0.62, -length * 0.09]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.05, 0.05, length * 0.42, 6]} />
            <meshStandardMaterial color="#d9dcdf" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, freeboard + 0.62, -length * 0.09]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, length * 0.4, 6]} />
            <meshStandardMaterial color="#3c5a72" roughness={0.8} />
          </mesh>
        </>
      )}

      {/* fenders — everyone in the marina hangs them */}
      {[-0.24, 0.12].map((zRatio) =>
        [-1, 1].map((side) => (
          <mesh
            key={`fender-${zRatio}-${side}`}
            position={[side * beam * 0.52, 0.05, length * zRatio]}
          >
            <capsuleGeometry args={[0.11, 0.3, 4, 8]} />
            <meshStandardMaterial color="#eef0ee" roughness={0.65} />
          </mesh>
        )),
      )}
    </group>
  );
}
