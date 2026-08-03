"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { type MutableRefObject, useMemo, useRef } from "react";
import type { Group } from "three";
import type { Line2 } from "three-stdlib";

import type { MarinaLayout, Vec2 } from "@/lib/marinas/types";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { buildNavGrid, findWaterPath } from "@/lib/sim/water-nav";

import { deriveMoorings } from "./MooredBoats";

type WaylineProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  layout: MarinaLayout;
  /** Berth center the line should lead to; null hides the line. */
  target: Vec2 | null;
};

const LINE_Y = 0.14;
// Replan once the boat has moved this far from the last planning position.
const REPLAN_DISTANCE_M = 3;

// LineSegmentsGeometry.setPositions must always receive the same vertex
// count the geometry was built with — growing it breaks the renderer's
// cached instance state and the line silently stops drawing. So the buffer
// is fixed-size and unused slots repeat the terminal point (zero-length
// segments draw nothing).
const MAX_LINE_POINTS = 64;
const HIDDEN_POINTS: [number, number, number][] = Array.from(
  { length: MAX_LINE_POINTS },
  (_, index) => [0, -10, index],
);
const scratchPositions = new Float32Array(MAX_LINE_POINTS * 3);

/**
 * The guidance line: the shortest route through open water from the boat to
 * the target berth, replanned as the boat moves. It routes around docks,
 * land, pilings, and moored boats — never across them.
 */
export function Wayline({ bodyRef, layout, target }: WaylineProps) {
  const solidRef = useRef<Line2 | null>(null);
  const dashedRef = useRef<Line2 | null>(null);
  const markerRef = useRef<Group | null>(null);
  const pathRef = useRef<Vec2[] | null>(null);
  const plannedFromRef = useRef<Vec2 | null>(null);
  const plannedTargetRef = useRef<Vec2 | null>(null);

  const grid = useMemo(
    () =>
      buildNavGrid(
        layout,
        deriveMoorings(layout).map((mooring) => ({
          position: mooring.position,
          headingDeg: mooring.headingDeg,
          lengthM: mooring.spec.lengthM,
          beamM: mooring.spec.beamM,
        })),
      ),
    [layout],
  );

  useFrame(() => {
    const solid = solidRef.current;
    const dashed = dashedRef.current;
    const marker = markerRef.current;
    const body = liveRigidBody(bodyRef);

    if (!solid || !dashed) {
      return;
    }

    if (!body || !target) {
      solid.visible = false;
      dashed.visible = false;

      if (marker) {
        marker.visible = false;
      }

      return;
    }

    const translation = body.translation();
    const boat: Vec2 = [translation.x, translation.z];

    const plannedFrom = plannedFromRef.current;
    const plannedTarget = plannedTargetRef.current;
    const targetChanged =
      !plannedTarget ||
      plannedTarget[0] !== target[0] ||
      plannedTarget[1] !== target[1];
    const movedFar =
      !plannedFrom ||
      Math.hypot(boat[0] - plannedFrom[0], boat[1] - plannedFrom[1]) >
        REPLAN_DISTANCE_M;

    if (targetChanged || movedFar || !pathRef.current) {
      pathRef.current = findWaterPath(grid, boat, target);
      plannedFromRef.current = boat;
      plannedTargetRef.current = [target[0], target[1]];
    }

    // No route (should not happen in practice): fall back to bearing only.
    const path = pathRef.current ?? [boat, target];
    const pointCount = Math.min(path.length, MAX_LINE_POINTS - 1);

    // First vertex rides with the hull between replans.
    scratchPositions[0] = boat[0];
    scratchPositions[1] = LINE_Y;
    scratchPositions[2] = boat[1];

    for (let slot = 1; slot < MAX_LINE_POINTS; slot += 1) {
      const [x, z] = path[Math.min(slot - 1, pointCount - 1)];

      scratchPositions[slot * 3] = x;
      scratchPositions[slot * 3 + 1] = LINE_Y;
      scratchPositions[slot * 3 + 2] = z;
    }

    solid.visible = true;
    dashed.visible = true;
    solid.geometry.setPositions(scratchPositions);
    dashed.geometry.setPositions(scratchPositions);
    dashed.computeLineDistances();

    if (marker) {
      marker.visible = true;
      marker.position.set(target[0], LINE_Y, target[1]);
    }
  });

  return (
    <group>
      <Line
        ref={solidRef}
        color="#5ad8f7"
        dashed={false}
        // The path spans the marina and its geometry bounds are never
        // recomputed after setPositions — culling would blank the line.
        frustumCulled={false}
        lineWidth={3}
        opacity={0.55}
        points={HIDDEN_POINTS}
        transparent
      />
      <Line
        ref={dashedRef}
        color="#c8f6ff"
        dashed
        dashScale={0.85}
        dashSize={0.8}
        frustumCulled={false}
        gapSize={0.45}
        lineWidth={1.4}
        opacity={0.85}
        points={HIDDEN_POINTS}
        transparent
      />
      <group ref={markerRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.72, 32]} />
          <meshBasicMaterial color="#9ff7ff" opacity={0.95} transparent />
        </mesh>
      </group>
    </group>
  );
}
