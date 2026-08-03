"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Line2 } from "three-stdlib";

import type { Vec2 } from "@/lib/marinas/types";
import { liveRigidBody } from "@/lib/sim/rapier-utils";

type WaylineProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  points: Vec2[];
};

const LINE_Y = 0.14;

/**
 * The suggested approach track, re-anchored to the boat every frame: the
 * first vertex rides with the hull, and the route rejoins the track at
 * whichever waypoint gives the shortest remaining trip — so it never sends
 * the boat backward toward waypoints it has already passed or bypassed.
 */
export function Wayline({ bodyRef, points }: WaylineProps) {
  const solidRef = useRef<Line2 | null>(null);
  const dashedRef = useRef<Line2 | null>(null);

  const initialPoints = useMemo(
    () => points.map(([x, z]) => new Vector3(x, LINE_Y, z)),
    [points],
  );

  // Path length remaining from each waypoint to the berth.
  const remainingFrom = useMemo(() => {
    const remaining = new Array<number>(points.length).fill(0);

    for (let index = points.length - 2; index >= 0; index -= 1) {
      const [x1, z1] = points[index];
      const [x2, z2] = points[index + 1];
      remaining[index] = remaining[index + 1] + Math.hypot(x2 - x1, z2 - z1);
    }

    return remaining;
  }, [points]);

  useFrame(() => {
    const body = liveRigidBody(bodyRef);
    const solid = solidRef.current;
    const dashed = dashedRef.current;

    if (!body || !solid || !dashed || points.length < 2) {
      return;
    }

    const translation = body.translation();

    // Rejoin the track at the waypoint minimizing total remaining distance
    // (boat → waypoint → berth). Passed or bypassed waypoints lose on the
    // detour they'd add, so the line always points onward.
    let rejoinIndex = points.length - 1;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length; index += 1) {
      const [x, z] = points[index];
      const cost =
        Math.hypot(x - translation.x, z - translation.z) + remainingFrom[index];

      if (cost < bestCost) {
        bestCost = cost;
        rejoinIndex = index;
      }
    }

    // Fixed-size buffer: boat first, remaining waypoints, then the berth
    // repeated to pad consumed slots (zero-length segments draw nothing).
    const positions = new Float32Array((points.length + 1) * 3);
    const terminal = points[points.length - 1];

    positions[0] = translation.x;
    positions[1] = LINE_Y;
    positions[2] = translation.z;

    for (let slot = 1; slot <= points.length; slot += 1) {
      const index = Math.min(
        points.length - 1,
        Math.max(rejoinIndex, slot - 1),
      );
      const [x, z] = slot >= points.length ? terminal : points[index];

      positions[slot * 3] = x;
      positions[slot * 3 + 1] = LINE_Y;
      positions[slot * 3 + 2] = z;
    }

    solid.geometry.setPositions(positions);
    dashed.geometry.setPositions(positions);
    dashed.computeLineDistances();
  });

  if (initialPoints.length < 2) {
    return null;
  }

  const terminal = initialPoints[initialPoints.length - 1];

  return (
    <group>
      <Line
        ref={solidRef}
        color="#5ad8f7"
        dashed={false}
        lineWidth={3}
        opacity={0.55}
        points={initialPoints}
        transparent
      />
      <Line
        ref={dashedRef}
        color="#c8f6ff"
        dashed
        dashScale={0.85}
        dashSize={0.8}
        gapSize={0.45}
        lineWidth={1.4}
        opacity={0.85}
        points={initialPoints}
        transparent
      />
      <mesh position={terminal} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.72, 32]} />
        <meshBasicMaterial color="#9ff7ff" opacity={0.95} transparent />
      </mesh>
    </group>
  );
}
