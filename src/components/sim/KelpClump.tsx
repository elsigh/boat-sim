"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferGeometry, Color, CubicBezierCurve3, CurvePath, DoubleSide, Float32BufferAttribute, Group, Vector3 } from "three";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { sampleWaterHeight, WATER_LEVEL } from "@/lib/sim/water-surface";

function createKelpGeometry(phase: number) {
  const path = new CurvePath<Vector3>();
  path.add(new CubicBezierCurve3(
    new Vector3(0.44, 0, 0.78), new Vector3(-0.58, 0, 1.04),
    new Vector3(-0.7, 0, 0.26), new Vector3(0, 0, 0),
  ));
  path.add(new CubicBezierCurve3(
    new Vector3(0, 0, 0), new Vector3(0.7, 0, -0.26),
    new Vector3(0.58, 0, -1.04), new Vector3(-0.44, 0, -0.78),
  ));
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const steps = 48;
  const fronds = [
    { angle: -0.3, length: 1.1, width: 0.078, color: "#56732d", x: -0.09, z: 0.06 },
    { angle: 0.48, length: 0.88, width: 0.065, color: "#68803a", x: 0.1, z: 0.1 },
    { angle: 1.87, length: 1.02, width: 0.075, color: "#415e26", x: 0.03, z: -0.1 },
  ];
  fronds.forEach((frond, strand) => {
    const offset = positions.length / 3;
    const angle = frond.angle + Math.sin(phase * (strand + 1) + strand) * 0.12;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const length = frond.length * (1 + Math.sin(phase + strand * 2) * 0.06);
    const color = new Color(frond.color);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const center = path.getPoint(t), tangent = path.getTangent(t);
      // Tapered tips and gently uneven edges give each S a blade-like outline.
      const width = (0.009 + frond.width * Math.sin(Math.PI * t) ** 0.55)
        * (1 + 0.1 * Math.sin(t * Math.PI * 11 + strand));
      for (const side of [-1, 0, 1]) {
        const x = center.x * length - tangent.z * side * width;
        const z = center.z * length + tangent.x * side * width;
        positions.push(x * cos - z * sin + frond.x,
          strand * 0.009 + (side === 0 ? 0.008 : 0) + Math.sin(t * 17 + strand) * 0.004,
          x * sin + z * cos + frond.z);
        const light = (side === 0 ? 1.08 : 0.86) * (0.95 + 0.05 * Math.sin(t * 9));
        colors.push(color.r * light, color.g * light, color.b * light);
      }
      if (step < steps) {
        for (let side = 0; side < 2; side++) {
          const a = offset + step * 3 + side, b = a + 3;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function KelpClump({ x, z, environment }: {
  x: number;
  z: number;
  environment: SimulationEnvironment;
}) {
  const groupRef = useRef<Group>(null);
  const phase = x * 0.17 + z * 0.11;
  const geometry = useMemo(() => createKelpGeometry(phase), [phase]);
  const size = 0.95 + Math.sin(phase * 2.3) * 0.1;
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const kelp = groupRef.current;
    if (!kelp) return;
    const time = clock.elapsedTime;
    // Water is shaded on a flat plane. Keep these thin ribbons above it so
    // wave troughs cannot clip them into disconnected crescents. Parent: +2 cm.
    const bob = Math.max(-0.008, Math.min(0.008, sampleWaterHeight(x, z, time, environment) * 0.08));
    kelp.position.y = WATER_LEVEL - 0.02 + 0.025 + bob;
    kelp.rotation.y = phase + Math.sin(time * 0.45 + phase) * 0.025;
  });

  return (
    <group ref={groupRef} name="kelp-clump" rotation={[0, phase, 0]}
      position={[0, WATER_LEVEL - 0.02 + 0.025, 0]} scale={[size, 1, size]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors side={DoubleSide} roughness={0.66} />
      </mesh>
    </group>
  );
}
