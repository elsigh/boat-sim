"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group, Vector2 } from "three";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { sampleWaterHeight, WATER_LEVEL } from "@/lib/sim/water-surface";

// A solid pear-shaped pot float: the lower third sits below the water,
// leaving a conspicuous orange shoulder and a short line attachment above it.
const FLOAT_PROFILE = [
  [0, -0.26], [0.13, -0.23], [0.25, -0.12], [0.32, 0.04],
  [0.34, 0.18], [0.31, 0.32], [0.24, 0.43], [0.13, 0.51],
  [0.075, 0.54], [0.075, 0.62], [0, 0.62],
].map(([radius, height]) => new Vector2(radius, height));

export function CrabPotBuoy({ x, z, environment }: {
  x: number;
  z: number;
  environment: SimulationEnvironment;
}) {
  const floatRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const buoy = floatRef.current;
    if (!buoy) return;
    const time = clock.elapsedTime;
    const phase = x * 0.17 + z * 0.11;
    // The parent hazard group is 2 cm above world zero.
    buoy.position.y = WATER_LEVEL - 0.02 + sampleWaterHeight(x, z, time, environment);
    buoy.rotation.x = Math.sin(time * 1.4 + phase) * 0.075;
    buoy.rotation.z = Math.cos(time * 1.1 + phase) * 0.09;
  });

  return (
    <group ref={floatRef} name="crab-pot-buoy">
      <mesh castShadow>
        <latheGeometry args={[FLOAT_PROFILE, 20]} />
        <meshStandardMaterial color="#ff6508" emissive="#ff4800" emissiveIntensity={0.1} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.574, 0]}>
        <cylinderGeometry args={[0.079, 0.079, 0.06, 16]} />
        <meshStandardMaterial color="#fff5dc" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.663, 0]}>
        <torusGeometry args={[0.045, 0.014, 6, 12]} />
        <meshStandardMaterial color="#49392a" roughness={0.8} />
      </mesh>
    </group>
  );
}
