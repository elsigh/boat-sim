"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { type MutableRefObject, useRef } from "react";
import type { Line2 } from "three-stdlib";

import type { Berth } from "@/lib/marinas/types";

type BerthBearingLineProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  berth: Berth | null;
};

/**
 * A live dashed line from the boat to the target berth, so veering off the
 * suggested track always leaves you a pointer back to the goal.
 */
export function BerthBearingLine({ bodyRef, berth }: BerthBearingLineProps) {
  const lineRef = useRef<Line2 | null>(null);

  useFrame(() => {
    const line = lineRef.current;
    const body = bodyRef.current;

    if (!line || !body || !berth) {
      return;
    }

    const translation = body.translation();
    const distance = Math.hypot(
      berth.center[0] - translation.x,
      berth.center[1] - translation.z,
    );

    // Hide once you're basically in the berth; the berth marker takes over.
    if (distance < berth.lengthM * 0.75) {
      line.visible = false;
      return;
    }

    line.visible = true;
    line.geometry.setPositions([
      translation.x,
      0.12,
      translation.z,
      berth.center[0],
      0.12,
      berth.center[1],
    ]);
    line.computeLineDistances();
  });

  if (!berth) {
    return null;
  }

  return (
    <Line
      ref={lineRef}
      points={[
        [0, -10, 0],
        [0, -10, 1],
      ]}
      color="#a5f3fc"
      lineWidth={1.6}
      dashed
      dashSize={1.4}
      gapSize={1}
      transparent
      opacity={0.72}
      visible={false}
    />
  );
}
