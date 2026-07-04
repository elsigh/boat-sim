"use client";

import { Line } from "@react-three/drei";
import { useMemo } from "react";
import { Vector3 } from "three";

import type { Vec2 } from "@/lib/marinas/types";

type WaylineProps = {
  points: Vec2[];
};

export function Wayline({ points }: WaylineProps) {
  const linePoints = useMemo(
    () => points.map(([x, z]) => new Vector3(x, 0.14, z)),
    [points],
  );

  if (linePoints.length < 2) {
    return null;
  }

  const terminal = linePoints[linePoints.length - 1];

  return (
    <group>
      <Line
        color="#5ad8f7"
        dashed={false}
        lineWidth={3}
        opacity={0.55}
        points={linePoints}
        transparent
      />
      <Line
        color="#c8f6ff"
        dashed
        dashScale={0.85}
        dashSize={0.8}
        gapSize={0.45}
        lineWidth={1.4}
        opacity={0.85}
        points={linePoints}
        transparent
      />
      <mesh position={terminal} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.72, 32]} />
        <meshBasicMaterial color="#9ff7ff" opacity={0.95} transparent />
      </mesh>
    </group>
  );
}
