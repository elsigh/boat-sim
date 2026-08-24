"use client";

import { Line, Text } from "@react-three/drei";
import {
  CoefficientCombineRule,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from "@react-three/rapier";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

import { getWorldChart } from "@/lib/charts";
import { sceneDocks } from "@/lib/marinas/scene";
import type {
  Berth,
  DockFloat,
  MarinaLayout,
  PilingRun,
  TreeCluster,
  Vec2,
} from "@/lib/marinas/types";

import { ChartTerrain } from "./ChartTerrain";

const CONTACT_FRICTION = 0.01;
const CONTACT_RESTITUTION = 0;
// Real floating docks carry ~0.5 m of freeboard; the deck has to read as a
// structure you could step onto, not a raft awash at the waterline.
const DOCK_DECK_TOP_Y = 0.58;
const DOCK_COLLIDER_HALF_HEIGHT = 1.2;
const PILING_HEIGHT = 4.3;

type MarinaProps = {
  layout: MarinaLayout;
  selectedBerthId: string | null;
  docked: boolean;
};

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pilingPositions(run: PilingRun): Vec2[] {
  if (run.count <= 1) {
    return [run.from];
  }

  return Array.from({ length: run.count }, (_, index) => {
    const t = index / (run.count - 1);
    return [
      run.from[0] + (run.to[0] - run.from[0]) * t,
      run.from[1] + (run.to[1] - run.from[1]) * t,
    ];
  });
}

function cleatPositionsForDock(dock: DockFloat) {
  const [width, length] = dock.size;
  const rotation = degToRad(dock.rotationDeg ?? 0);
  const spacing = 3.2;
  const count = Math.max(2, Math.floor(length / spacing));
  const positions: Array<{ x: number; z: number; rotation: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const along = -length * 0.5 + (index + 0.5) * (length / count);

    for (const side of [-1, 1]) {
      const localX = side * (width * 0.5 - 0.12);
      const x =
        dock.position[0] + localX * Math.cos(rotation) + along * Math.sin(rotation);
      const z =
        dock.position[1] - localX * Math.sin(rotation) + along * Math.cos(rotation);

      positions.push({ x, z, rotation });
    }
  }

  return positions;
}

function InstancedPilings({ runs }: { runs: PilingRun[] }) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const positions = useMemo(
    () =>
      runs.flatMap((run) =>
        pilingPositions(run).map((position) => ({
          position,
          radius: run.radiusM ?? 0.2,
        })),
      ),
    [runs],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const translation = new Vector3();

    positions.forEach((piling, index) => {
      translation.set(piling.position[0], PILING_HEIGHT * 0.5 - 0.7, piling.position[1]);
      scale.set(piling.radius / 0.2, 1, piling.radius / 0.2);
      matrix.compose(translation, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [positions]);

  if (positions.length === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[0.2, 0.22, PILING_HEIGHT, 10]} />
      <meshStandardMaterial color="#4d3d30" roughness={0.92} />
    </instancedMesh>
  );
}

function InstancedCleats({ docks }: { docks: DockFloat[] }) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const cleats = useMemo(() => docks.flatMap(cleatPositionsForDock), [docks]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3(1, 1, 1);
    const translation = new Vector3();
    const axis = new Vector3(0, 1, 0);

    cleats.forEach((cleat, index) => {
      translation.set(cleat.x, DOCK_DECK_TOP_Y + 0.05, cleat.z);
      quaternion.setFromAxisAngle(axis, cleat.rotation);
      matrix.compose(translation, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cleats]);

  if (cleats.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cleats.length]} castShadow>
      <boxGeometry args={[0.3, 0.1, 0.12]} />
      <meshStandardMaterial color="#9aa3ab" metalness={0.55} roughness={0.4} />
    </instancedMesh>
  );
}

function InstancedTrees({ clusters }: { clusters: TreeCluster[] }) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const trees = useMemo(() => {
    return clusters.flatMap((cluster, clusterIndex) => {
      const random = mulberry32(1013 + clusterIndex * 97);

      return Array.from({ length: cluster.count }, () => {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * cluster.radiusM;

        return {
          x: cluster.center[0] + Math.cos(angle) * distance,
          z: cluster.center[1] + Math.sin(angle) * distance,
          height: 3.4 + random() * 3.8,
          width: 0.75 + random() * 0.5,
        };
      });
    });
  }, [clusters]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;

    if (!mesh) {
      return;
    }

    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const translation = new Vector3();
    const color = new Color();

    trees.forEach((tree, index) => {
      translation.set(tree.x, 2 + tree.height * 0.5, tree.z);
      scale.set(tree.width, tree.height / 4.6, tree.width);
      matrix.compose(translation, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      color.setHSL(0.34, 0.34, 0.16 + (index % 5) * 0.014);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [trees]);

  if (trees.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, trees.length]} castShadow>
      <coneGeometry args={[1.5, 4.6, 7]} />
      <meshStandardMaterial color="#2e4d33" roughness={0.95} />
    </instancedMesh>
  );
}

function DockVisual({ dock }: { dock: DockFloat }) {
  const [width, length] = dock.size;
  const deckColor = dock.color ?? (dock.kind === "pier" ? "#8a7a63" : "#a89680");
  const deckHeight = dock.kind === "breakwater" ? 0.85 : 0.48;
  const deckY = DOCK_DECK_TOP_Y - deckHeight * 0.5;

  return (
    <group
      position={[dock.position[0], 0, dock.position[1]]}
      rotation={[0, degToRad(dock.rotationDeg ?? 0), 0]}
    >
      <mesh castShadow receiveShadow position={[0, deckY, 0]}>
        <boxGeometry args={[width, deckHeight, length]} />
        <meshStandardMaterial color={deckColor} roughness={0.88} />
      </mesh>
      {/* flotation skirt */}
      <mesh position={[0, deckY - deckHeight * 0.5 - 0.09, 0]}>
        <boxGeometry args={[width * 0.94, 0.2, length * 0.985]} />
        <meshStandardMaterial color="#3c342c" roughness={0.95} />
      </mesh>
      {/* bull rails along the long edges */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[side * (width * 0.5 - 0.07), DOCK_DECK_TOP_Y + 0.075, 0]}
        >
          <boxGeometry args={[0.11, 0.15, length * 0.99]} />
          <meshStandardMaterial color="#6f5b44" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function BerthMarker({
  berth,
  active,
  docked,
}: {
  berth: Berth;
  active: boolean;
  docked: boolean;
}) {
  const accent = docked && active ? "#7dffb1" : active ? "#5de7ff" : "#8fb4c4";
  const fillOpacity = active ? 0.16 : 0.05;
  const outline = useMemo(() => {
    const halfWidth = berth.widthM * 0.5;
    const halfLength = berth.lengthM * 0.5;

    return [
      new Vector3(-halfWidth, 0, -halfLength),
      new Vector3(halfWidth, 0, -halfLength),
      new Vector3(halfWidth, 0, halfLength),
      new Vector3(-halfWidth, 0, halfLength),
      new Vector3(-halfWidth, 0, -halfLength),
    ];
  }, [berth.lengthM, berth.widthM]);

  return (
    <group
      position={[berth.center[0], 0.05, berth.center[1]]}
      rotation={[0, degToRad(berth.headingDeg), 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[berth.widthM, berth.lengthM]} />
        <meshBasicMaterial color={accent} opacity={fillOpacity} transparent />
      </mesh>
      <Line
        points={outline}
        color={accent}
        lineWidth={active ? 2.4 : 1.2}
        transparent
        opacity={active ? 0.95 : 0.5}
        dashed={!active}
        dashSize={0.7}
        gapSize={0.4}
      />
      {/* bow direction chevron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, berth.lengthM * 0.32]}>
        <circleGeometry args={[0.55, 3]} />
        <meshBasicMaterial color={accent} opacity={active ? 0.85 : 0.35} transparent />
      </mesh>
      <Text
        color={active ? "#e6fbff" : "#9fc2cf"}
        fontSize={1.15}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, Math.PI]}
        position={[0, 0.02, -berth.lengthM * 0.5 - 1.4]}
        fillOpacity={active ? 0.95 : 0.6}
      >
        {berth.label}
      </Text>
    </group>
  );
}

export function Marina({ layout, selectedBerthId, docked }: MarinaProps) {
  const chart = useMemo(() => getWorldChart(layout.chartId ?? layout.id), [layout]);

  const docks = useMemo(() => sceneDocks(layout), [layout]);

  return (
    <group>
      {chart ? <ChartTerrain chart={chart} /> : null}

      {/* one static body carries every collider in the marina */}
      <RigidBody type="fixed" colliders={false}>
        {docks.map((dock) => (
          <CuboidCollider
            key={`collider-${dock.id}`}
            name={`dock:${dock.id}`}
            args={[dock.size[0] * 0.5, DOCK_COLLIDER_HALF_HEIGHT, dock.size[1] * 0.5]}
            position={[dock.position[0], DOCK_COLLIDER_HALF_HEIGHT - 0.3, dock.position[1]]}
            rotation={[0, degToRad(dock.rotationDeg ?? 0), 0]}
            friction={CONTACT_FRICTION}
            frictionCombineRule={CoefficientCombineRule.Min}
            restitution={CONTACT_RESTITUTION}
            restitutionCombineRule={CoefficientCombineRule.Min}
          />
        ))}
        {layout.pilings.flatMap((run) =>
          pilingPositions(run).map((position, index) => (
            <CylinderCollider
              key={`piling-${run.id}-${index}`}
              name={`piling:${run.id}-${index}`}
              args={[PILING_HEIGHT * 0.5, run.radiusM ?? 0.2]}
              position={[position[0], PILING_HEIGHT * 0.5 - 0.7, position[1]]}
              friction={CONTACT_FRICTION}
              frictionCombineRule={CoefficientCombineRule.Min}
              restitution={CONTACT_RESTITUTION}
              restitutionCombineRule={CoefficientCombineRule.Min}
            />
          )),
        )}
        {(layout.land ?? []).map((land) => (
          <CuboidCollider
            key={`land-${land.id}`}
            name={`land:${land.id}`}
            args={[land.size[0] * 0.5, Math.max(2, (land.heightM ?? 2.5) * 0.5) + 1, land.size[1] * 0.5]}
            position={[land.position[0], (land.heightM ?? 2.5) * 0.5, land.position[1]]}
            rotation={[0, degToRad(land.rotationDeg ?? 0), 0]}
            friction={CONTACT_FRICTION}
            frictionCombineRule={CoefficientCombineRule.Min}
            restitution={CONTACT_RESTITUTION}
            restitutionCombineRule={CoefficientCombineRule.Min}
          />
        ))}
      </RigidBody>

      {(layout.land ?? []).map((land) => (
        <group
          key={`land-visual-${land.id}`}
          position={[land.position[0], 0, land.position[1]]}
          rotation={[0, degToRad(land.rotationDeg ?? 0), 0]}
        >
          <mesh castShadow receiveShadow position={[0, (land.heightM ?? 2.5) * 0.5 - 0.5, 0]}>
            <boxGeometry args={[land.size[0], land.heightM ?? 2.5, land.size[1]]} />
            <meshStandardMaterial color={land.color ?? "#57604f"} roughness={0.96} />
          </mesh>
          {/* shoreline apron just above the waterline */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[land.size[0] + 1.6, 0.14, land.size[1] + 1.6]} />
            <meshStandardMaterial color="#77705f" roughness={0.98} />
          </mesh>
        </group>
      ))}

      {docks.map((dock) => (
        <DockVisual key={`dock-${dock.id}`} dock={dock} />
      ))}

      <InstancedPilings runs={layout.pilings} />
      <InstancedCleats docks={docks} />
      <InstancedTrees clusters={layout.trees ?? []} />

      {(layout.buoys ?? []).map((buoy, index) => (
        <group key={`buoy-${index}`} position={[buoy[0], 0, buoy[1]]}>
          <mesh castShadow position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.38, 12, 10]} />
            <meshStandardMaterial color="#eef1ee" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
            <meshStandardMaterial color="#c9cdc9" roughness={0.5} />
          </mesh>
        </group>
      ))}

      {layout.berths.map((berth) => (
        <BerthMarker
          key={berth.id}
          berth={berth}
          active={berth.id === selectedBerthId}
          docked={docked}
        />
      ))}
    </group>
  );
}
