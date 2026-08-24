"use client";

import { CoefficientCombineRule, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from "three";

import type { ChartData, ChartPoint } from "@/lib/charts";
import { pointInRing, ringBounds, scatterTrees } from "@/lib/charts/geometry";

const CONTACT_FRICTION = 0.35;
const CONTACT_RESTITUTION = 0;

// The DEM shoreline is a hard edge, so the land carries a shallow skirt below
// the waterline instead of a wall dropping straight out of view.
const BEACH_DROP_M = 1.6;
const WALL_ABOVE_M = 4;
const WALL_BELOW_M = 3;

type ChartTerrainProps = {
  chart: ChartData;
  /** Rough island heights are enough — the camera never gets above them. */
  reliefM?: number;
};

/**
 * Shape coordinates run (x, -z) so that a single `rotateX(-90°)` lands the
 * extrusion in the XZ plane the right way round, with thickness in +y.
 */
function toShapePoints(points: ChartPoint[]) {
  return points.map(([x, z]) => new Vector2(x, -z));
}

function ringHeight(areaM2: number, spread: number, reliefM: number) {
  return Math.min(reliefM, 2 + Math.sqrt(areaM2) * 0.16 + spread * 0.004);
}

/**
 * A cheap collision shell: a vertical wall standing on each shoreline ring.
 * Two triangles per edge is a fraction of the cost of colliding against the
 * full extruded island, and hitting the beach is all we need it to do.
 */
function buildWallMesh(rings: ChartPoint[][]) {
  let edgeCount = 0;

  for (const ring of rings) {
    edgeCount += ring.length;
  }

  const positions = new Float32Array(edgeCount * 4 * 3);
  const indices = new Uint32Array(edgeCount * 6);
  let vertex = 0;
  let index = 0;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const base = vertex / 3;

      positions[vertex++] = ax;
      positions[vertex++] = -WALL_BELOW_M;
      positions[vertex++] = az;
      positions[vertex++] = bx;
      positions[vertex++] = -WALL_BELOW_M;
      positions[vertex++] = bz;
      positions[vertex++] = bx;
      positions[vertex++] = WALL_ABOVE_M;
      positions[vertex++] = bz;
      positions[vertex++] = ax;
      positions[vertex++] = WALL_ABOVE_M;
      positions[vertex++] = az;

      indices[index++] = base;
      indices[index++] = base + 1;
      indices[index++] = base + 2;
      indices[index++] = base;
      indices[index++] = base + 2;
      indices[index++] = base + 3;
    }
  }

  return { positions, indices };
}

/**
 * The land itself: real shoreline rings extruded into low islands, with
 * collision so running aground actually stops the boat.
 */
export function ChartTerrain({ chart, reliefM = 26 }: ChartTerrainProps) {
  const solids = useMemo(() => chart.land.filter((ring) => !ring.hole), [chart.land]);
  const holes = useMemo(() => chart.land.filter((ring) => ring.hole), [chart.land]);

  const pieces = useMemo(() => {
    return solids.map((ring, index) => {
      const bounds = ringBounds(ring.points);
      const shape = new Shape(toShapePoints(ring.points));

      for (const hole of holes) {
        const [hx, hz] = hole.points[0];

        if (
          hx < bounds.minX ||
          hx > bounds.maxX ||
          hz < bounds.minZ ||
          hz > bounds.maxZ ||
          !pointInRing(ring.points, hx, hz)
        ) {
          continue;
        }

        shape.holes.push(new Path(toShapePoints(hole.points)));
      }

      const spread = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
      const height = ringHeight(ring.areaM2, spread, reliefM);

      const geometry = new ExtrudeGeometry(shape, {
        depth: height + BEACH_DROP_M,
        bevelEnabled: true,
        bevelThickness: 1.4,
        bevelSize: 2.6,
        bevelSegments: 1,
        curveSegments: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -BEACH_DROP_M, 0);
      geometry.computeVertexNormals();

      return {
        key: `land-${index}`,
        geometry,
        big: ring.areaM2 > 6000,
      };
    });
  }, [holes, reliefM, solids]);

  const wall = useMemo(
    () => buildWallMesh(solids.map((ring) => ring.points)),
    [solids],
  );
  const trees = useMemo(() => scatterTrees(chart), [chart]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} name="terrain">
        <TrimeshCollider
          name="land:shoreline"
          args={[wall.positions, wall.indices]}
          friction={CONTACT_FRICTION}
          frictionCombineRule={CoefficientCombineRule.Min}
          restitution={CONTACT_RESTITUTION}
          restitutionCombineRule={CoefficientCombineRule.Min}
        />
      </RigidBody>

      {pieces.map((piece) => (
        <mesh key={piece.key} geometry={piece.geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={piece.big ? "#57624a" : "#6b6f56"}
            roughness={0.97}
            side={DoubleSide}
          />
        </mesh>
      ))}

      <ShorelineBand rings={solids.map((ring) => ring.points)} />
      <InstancedConifers points={trees} />
    </group>
  );
}

/** A pale gravel band right at the waterline, the way a beach reads from above. */
function ShorelineBand({ rings }: { rings: ChartPoint[][] }) {
  const geometry = useMemo(() => {
    const shapes = rings.map((points) => new Shape(toShapePoints(points)));
    const merged = new ExtrudeGeometry(shapes, {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.3,
      bevelSize: 3.4,
      bevelSegments: 1,
      curveSegments: 1,
    });
    merged.rotateX(-Math.PI / 2);
    merged.translate(0, -0.34, 0);
    merged.computeVertexNormals();
    return merged;
  }, [rings]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#9a9179" roughness={0.99} />
    </mesh>
  );
}

function InstancedConifers({ points }: { points: Array<{ x: number; z: number; scale: number }> }) {
  const meshRef = useRef<InstancedMesh | null>(null);

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

    points.forEach((tree, index) => {
      const height = 11 * tree.scale;
      translation.set(tree.x, 3 + height * 0.4, tree.z);
      scale.set(tree.scale, tree.scale, tree.scale);
      matrix.compose(translation, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      color.setHSL(0.33, 0.3, 0.12 + (index % 7) * 0.011);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [points]);

  if (points.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, points.length]} castShadow>
      <coneGeometry args={[2.6, 11, 6]} />
      <meshStandardMaterial color="#2c4a31" roughness={0.96} />
    </instancedMesh>
  );
}
