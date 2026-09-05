"use client";

import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, Quaternion, Vector3 } from "three";
import type { TwinEngineState } from "@/hooks/useEngineState";
import type { BoatProfile } from "@/lib/boats/catalog";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { WATER_LEVEL } from "@/lib/sim/water-surface";

const CAPACITY = 320;
const vertexShader = `
  attribute float aStrength;
  varying vec2 vUv;
  varying float vStrength;
  void main() {
    vUv = uv;
    vStrength = aStrength;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vStrength;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float edge = 1.0 - smoothstep(0.1, 1.0, length((vUv - 0.5) * 2.0));
    float foam = noise(vUv * vec2(7.0, 16.0) + vec2(uTime * 0.13, -uTime * 0.35));
    float strands = noise(vUv * vec2(19.0, 3.0) + uTime * 0.06);
    float alpha = edge * vStrength * (0.22 + 0.78 * foam) * (0.4 + strands * 0.6);
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(mix(vec3(0.40, 0.66, 0.65), vec3(0.91, 0.97, 0.93), foam), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type Foam = {
  x: number; z: number; vx: number; vz: number;
  yaw: number; width: number; length: number;
  age: number; life: number; strength: number;
};

/** Bounded world-space foam pool: the wake stays in the water after a turn. */
export function WakeTrail({ boat, bodyRef, engineStateRef, environment, resetId }: {
  boat: BoatProfile;
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  engineStateRef: MutableRefObject<TwinEngineState>;
  environment: SimulationEnvironment;
  resetId?: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const pool = useMemo(() => Array.from({ length: CAPACITY }, (): Foam => ({ x: 0, z: 0, vx: 0, vz: 0, yaw: 0, width: 0, length: 0, age: 99, life: 8, strength: 0 })), []);
  const strength = useMemo(() => new InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(DynamicDrawUsage), []);
  const scratch = useMemo(() => ({ object: new Object3D(), rotation: new Quaternion(), velocity: new Vector3(), point: new Vector3() }), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const nextSlot = useRef(0);
  const emissionTime = useRef(0);

  useEffect(() => {
    for (const puff of pool) puff.age = 99;
    emissionTime.current = 0;
  }, [pool, resetId, boat.profileSlug]);

  useFrame((state, delta) => {
    const body = liveRigidBody(bodyRef);
    const mesh = meshRef.current;
    if (!body || !mesh) return;
    const dt = Math.min(delta, 0.1);
    uniforms.uTime.value = state.clock.elapsedTime;
    const position = body.translation();
    const rotation = body.rotation();
    scratch.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const velocity = body.linvel();
    scratch.velocity.set(velocity.x - environment.currentVelocity.x, 0, velocity.z - environment.currentVelocity.z);
    const speed = Math.min(16, scratch.velocity.length());
    scratch.velocity.applyQuaternion(scratch.rotation.clone().invert());
    const yaw = 2 * Math.atan2(rotation.y, rotation.w);
    const ahead = scratch.velocity.z >= 0;

    const emit = (localX: number, localZ: number, intensity: number, spread: number, prop: boolean) => {
      scratch.point.set(localX, 0, localZ).applyQuaternion(scratch.rotation);
      const puff = pool[nextSlot.current];
      nextSlot.current = (nextSlot.current + 1) % CAPACITY;
      puff.x = position.x + scratch.point.x;
      puff.z = position.z + scratch.point.z;
      puff.vx = Math.cos(yaw) * spread;
      puff.vz = -Math.sin(yaw) * spread;
      puff.yaw = yaw;
      puff.width = prop ? 0.7 + intensity * 0.9 : 0.35 + speed * 0.09;
      puff.length = prop ? 1.1 + intensity * 1.8 + speed * 0.18 : 0.9 + speed * 0.32;
      puff.age = 0;
      puff.life = prop ? 7 : 10;
      puff.strength = intensity;
    };

    emissionTime.current += dt;
    if (emissionTime.current >= 0.12) {
      emissionTime.current %= 0.12;
      if (speed > 0.25) {
        for (const side of [-1, 1]) {
          emit(side * boat.beamM * 0.38, boat.lengthM * (ahead ? 0.24 : -0.35), Math.min(0.68, speed * 0.13), side * speed * 0.12, false);
        }
      }
      for (const [side, engine] of [[1, engineStateRef.current.port], [-1, engineStateRef.current.starboard]] as const) {
        const power = engine.running ? Math.abs(engine.effectiveThrottle) : 0;
        if (power > 0.015) {
          emit(side * boat.engineLateralOffsetM * (engine.effectiveThrottle < 0 ? 1.5 : 1), -boat.lengthM * (engine.effectiveThrottle < 0 ? 0.33 : 0.49), Math.min(0.8, 0.13 + power * 0.65), side * power * 0.07, true);
        }
      }
    }

    for (let index = 0; index < CAPACITY; index++) {
      const puff = pool[index];
      puff.age += dt;
      const live = puff.age < puff.life;
      if (live) {
        puff.x += (environment.currentVelocity.x + puff.vx) * dt;
        puff.z += (environment.currentVelocity.z + puff.vz) * dt;
      }
      scratch.object.position.set(puff.x, WATER_LEVEL + 0.018, puff.z);
      scratch.object.rotation.set(-Math.PI / 2, 0, puff.yaw);
      scratch.object.scale.set(live ? puff.width + puff.age * 0.22 : 0, live ? puff.length + puff.age * 0.3 : 0, 1);
      scratch.object.updateMatrix();
      mesh.setMatrixAt(index, scratch.object.matrix);
      strength.setX(index, live ? puff.strength * Math.min(1, puff.age * 5) * (1 - puff.age / puff.life) ** 1.5 : 0);
    }
    mesh.instanceMatrix.needsUpdate = true;
    strength.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CAPACITY]} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[1, 1]}>
        <primitive object={strength} attach="attributes-aStrength" />
      </planeGeometry>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent depthWrite={false} />
    </instancedMesh>
  );
}
