"use client";

import { CoefficientCombineRule, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  ConeGeometry,
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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { buildTerrainRelief, terrainHeightAt } from "@/lib/charts/terrain-relief";
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
  surveyedRelief?: boolean;
  clearings?: Array<{ x: number; z: number; radius: number }>;
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
export function ChartTerrain({ chart, reliefM = 26, surveyedRelief = false, clearings }: ChartTerrainProps) {
  const solids = useMemo(() => chart.land.filter((ring) => !ring.hole), [chart.land]);
  const holes = useMemo(() => chart.land.filter((ring) => ring.hole), [chart.land]);
  const solidRings = useMemo(() => solids.map((ring) => ring.points), [solids]);

  const pieces = useMemo(() => {
    if (surveyedRelief) return [{ key: "surveyed-relief", geometry: buildTerrainRelief(chart), big: true }];
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
  }, [holes, reliefM, solids, surveyedRelief, chart]);
  useEffect(() => () => pieces.forEach((piece) => piece.geometry.dispose()), [pieces]);

  const wall = useMemo(
    () => buildWallMesh(solidRings),
    [solidRings],
  );
  const trees = useMemo(() => scatterTrees(chart, surveyedRelief ? { density: 1 / 150, max: 10000, maxPerRing: 8000 } : undefined)
    .filter((tree) => !clearings?.some((c) => Math.hypot(tree.x - c.x, tree.z - c.z) < c.radius))
    .map((tree) => ({ ...tree, groundY: surveyedRelief ? terrainHeightAt(chart, tree.x, tree.z) : 3 })),
  [chart, surveyedRelief, clearings]);

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
            color={surveyedRelief ? "#ffffff" : piece.big ? "#57624a" : "#6b6f56"}
            vertexColors={surveyedRelief}
            roughness={0.97}
            side={DoubleSide}
          />
        </mesh>
      ))}

      <ShorelineBand rings={solidRings} />
      <InstancedConifers points={trees} detailed={surveyedRelief} />
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
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#9a9179" roughness={0.99} />
    </mesh>
  );
}

function InstancedConifers({ points, detailed }: { points: Array<{ x: number; z: number; scale: number; groundY: number }>; detailed: boolean }) {
  const meshRef = useRef<InstancedMesh | null>(null);
  const geometry = useMemo(() => {
    if (!detailed) return new ConeGeometry(2.6, 11, 6);
    // Overlapping branch tiers soften the silhouette while keeping one draw.
    const tiers = [[3.3, 6.7, -1.6], [2.65, 6.0, 0.7], [1.8, 4.8, 3.1]].map(([radius, height, y], i) => {
      const part = new ConeGeometry(radius, height, 9);
      part.rotateY(i * 0.7);
      part.translate(0, y, 0);
      return part;
    });
    const merged = mergeGeometries(tiers)!;
    tiers.forEach((part) => part.dispose());
    return merged;
  }, [detailed]);
  useEffect(() => () => geometry.dispose(), [geometry]);

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
      const height = (detailed ? 17 : 11) * tree.scale;
      translation.set(tree.x, tree.groundY + height * 0.5, tree.z);
      scale.set(tree.scale * (detailed ? 1.45 : 1), height / 11, tree.scale * (detailed ? 1.45 : 1));
      matrix.compose(translation, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (detailed) color.set(["#355445", "#405c45", "#4d634a", "#3b584b", "#48624b"][index % 5]);
      else color.setHSL(0.32, 0.26, 0.12 + (index % 7) * 0.011);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [points, detailed]);

  if (points.length === 0) {
    return null;
  }

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, points.length]} castShadow>
      <meshStandardMaterial color={detailed ? "#ffffff" : "#2c4a31"} roughness={0.96} />
    </instancedMesh>
  );
}
