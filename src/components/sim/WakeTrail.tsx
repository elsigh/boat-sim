"use client";

import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Object3D, Quaternion, Vector2, Vector3 } from "three";
import type { TwinEngineState } from "@/hooks/useEngineState";
import type { BoatProfile } from "@/lib/boats/catalog";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { WATER_LEVEL } from "@/lib/sim/water-surface";
import { wakeNoiseShader } from "@/lib/sim/wake-shaders";

// Five deposits per emission, with room for the full 24-second wave history.
// One draw call; no React updates or new objects in the particle update loop.
const CAPACITY = 1024;
const EMISSION_INTERVAL = 0.12;
const SIDES = [-1, 1] as const;
const ENGINE_SIDES = [[1, "port"], [-1, "starboard"]] as const;
const vertexShader = `
  attribute vec3 aWake;
  varying vec2 vUv;
  varying vec3 vWake;
  varying vec3 vWorldPosition;
  varying vec3 vAcross;
  varying float vWidth;
  void main() {
    vUv = uv;
    vWake = aWake; // strength, ridge, normalized age
    vWidth = length(instanceMatrix[0].xyz);
    vAcross = (modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz / max(0.001, vWidth);
    vec3 raised = position;
    // A train of low swells, with the leading shoulder stronger than its echoes.
    float x = (uv.x - 0.5) * 2.0;
    float envelope = exp(-x * x * 2.8) * sin(uv.y * 3.14159);
    raised.z += aWake.y * aWake.x * 0.16 * (0.5 + 0.5 * cos(x * 9.42478)) * envelope;
    vec4 world = modelMatrix * instanceMatrix * vec4(raised, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const fragmentShader = `
  uniform float uTime;
  uniform vec2 uCurrent;
  uniform vec3 uDeep;
  uniform vec3 uBody;
  uniform vec3 uHorizon;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying vec3 vWake;
  varying vec3 vWorldPosition;
  varying vec3 vAcross;
  varying float vWidth;
  ${wakeNoiseShader}
  void main() {
    float strength = vWake.x, age = vWake.z;
    if (strength < 0.003) discard;
    vec2 p = (vUv - 0.5) * 2.0;
    vec2 water = vWorldPosition.xz - uCurrent * uTime;
    vec3 foam = wakeFoam(water, uTime);
    float edge = 1.0 - smoothstep(0.3, 1.0, length(p) + (foam.x - 0.5) * 0.3);
    float coverage = smoothstep(0.12 + age * 0.48, 0.55 + age * 0.22, foam.x);
    float froth = coverage * (0.22 + foam.y * 0.78) * (0.7 + foam.z * 0.3);
    vec3 color = mix(vec3(0.22, 0.48, 0.48), vec3(0.88, 0.95, 0.91), smoothstep(0.05, 0.65, froth));
    // The quiet holes are transparent water; old foam separates into flecks.
    float alpha = edge * strength * (froth * 0.86 + coverage * 0.1);
    if (vWake.y > 0.5) {
      float phase = p.x * 9.42478 + (foam.x - 0.5) * 0.65;
      float envelope = exp(-p.x * p.x * 2.8);
      float slope = -sin(phase) * envelope * strength * 3.0 / max(1.0, vWidth);
      vec3 normal = normalize(vec3(0.0, 1.0, 0.0) - vAcross * slope);
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(0.0, dot(viewDirection, normal)), 5.0);
      color = mix(uDeep, uBody, 0.4 + cos(phase) * 0.09);
      color *= 0.83 + max(dot(normal, uSunDirection), 0.0) * 0.3;
      color = mix(color, uHorizon, fresnel * 0.85);
      vec3 halfway = normalize(uSunDirection + viewDirection);
      color += vec3(1.0, 0.94, 0.8) * pow(max(dot(normal, halfway), 0.0), 100.0) * 0.4;
      float crest = pow(max(0.0, cos(phase)), 5.0) * envelope;
      // Only patches of a steep, young crest break white. The rest is water.
      float breaking = crest * smoothstep(0.4, 0.73, foam.x) * foam.y * strength * (1.0 - age);
      color = mix(color, vec3(0.82, 0.91, 0.88), breaking * 0.65);
      alpha = edge * strength * (0.62 * envelope + breaking * 0.35);
    }
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type Foam = {
  x: number; z: number; vx: number; vz: number;
  yaw: number; spin: number; width: number; length: number; growth: number; ridge: boolean;
  age: number; life: number; strength: number;
};

/** Waves propagate outwards; aerated propeller water slows, spreads and disperses. */
export function WakeTrail({ boat, bodyRef, engineStateRef, environment, resetId }: {
  boat: BoatProfile;
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  engineStateRef: MutableRefObject<TwinEngineState>;
  environment: SimulationEnvironment;
  resetId?: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const pool = useMemo(() => Array.from({ length: CAPACITY }, (): Foam => ({ x: 0, z: 0, vx: 0, vz: 0, yaw: 0, spin: 0, width: 0, length: 0, growth: 0, ridge: false, age: 99, life: 8, strength: 0 })), []);
  const wakeAttribute = useMemo(() => new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(DynamicDrawUsage), []);
  const scratch = useMemo(() => ({ object: new Object3D(), rotation: new Quaternion(), inverse: new Quaternion(), velocity: new Vector3(), point: new Vector3() }), []);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uCurrent: { value: new Vector2() },
    uDeep: { value: new Color("#143c4b") }, uBody: { value: new Color("#31636b") },
    uHorizon: { value: new Color("#b6cdd8") }, uSunDirection: { value: new Vector3(120, 90, 65).normalize() },
  }), []);
  const nextSlot = useRef(0);
  const emissionTime = useRef(0);
  const displacement = Math.min(1.8, Math.max(0.55, Math.cbrt(boat.massKg / 26_000)));

  useEffect(() => {
    for (const puff of pool) puff.age = 99;
    emissionTime.current = 0;
    nextSlot.current = 0;
    meshRef.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [pool, resetId, boat.profileSlug]);

  useFrame((state, delta) => {
    const body = liveRigidBody(bodyRef);
    const mesh = meshRef.current;
    if (!body || !mesh) return;
    const dt = Math.min(delta, 0.1);
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCurrent.value.set(environment.currentVelocity.x, environment.currentVelocity.z);
    const position = body.translation();
    const rotation = body.rotation();
    scratch.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const velocity = body.linvel();
    scratch.velocity.set(velocity.x - environment.currentVelocity.x, 0, velocity.z - environment.currentVelocity.z);
    scratch.velocity.applyQuaternion(scratch.inverse.copy(scratch.rotation).invert());
    const surge = scratch.velocity.z;
    const speed = Math.min(24, Math.abs(surge));
    const yaw = 2 * Math.atan2(rotation.y, rotation.w);
    const travelSign = surge >= 0 ? 1 : -1;
    const froude = speed / Math.sqrt(9.81 * boat.lengthM);
    const hullStrength = Math.min(0.95, Math.max(0, speed - 0.25) * 0.13 * displacement + Math.min(0.25, froude * froude));
    const spreadSpeed = speed * Math.min(0.354, 0.24 / Math.max(0.1, froude));

    const emit = (localX: number, localZ: number, intensity: number, spread: number, jet: number, kind: "ridge" | "prop" | "stern") => {
      const puff = pool[nextSlot.current];
      const variation = Math.sin(nextSlot.current * 2.39996);
      nextSlot.current = (nextSlot.current + 1) % CAPACITY;
      scratch.point.set(localX, 0, localZ).applyQuaternion(scratch.rotation);
      puff.x = position.x + scratch.point.x;
      puff.z = position.z + scratch.point.z;
      puff.vx = Math.cos(yaw) * spread + Math.sin(yaw) * jet;
      puff.vz = -Math.sin(yaw) * spread + Math.cos(yaw) * jet;
      puff.ridge = kind === "ridge";
      puff.yaw = yaw - (puff.ridge ? Math.sign(localX) * travelSign * Math.atan2(spreadSpeed, speed) : variation * 0.2);
      puff.spin = puff.ridge ? 0 : variation * 0.07;
      puff.width = kind === "stern" ? boat.beamM * 0.7 : puff.ridge ? boat.beamM * 0.85 + speed * 0.16 : boat.beamM * 0.28 + intensity * displacement;
      puff.length = Math.max(speed * EMISSION_INTERVAL * 2.8, (puff.ridge ? 3.0 : 3.6) * displacement);
      puff.growth = (puff.ridge ? 0.2 : 0.65) * displacement;
      puff.age = 0;
      puff.life = Math.min(24, (puff.ridge ? 18 : 10) + displacement * 2 + speed * 0.16);
      puff.strength = intensity * (puff.ridge ? 1 : 0.88 + variation * 0.12);
    };

    emissionTime.current += dt;
    if (emissionTime.current >= EMISSION_INTERVAL) {
      emissionTime.current %= EMISSION_INTERVAL;
      if (speed > 0.3) {
        for (const side of SIDES) {
          emit(side * boat.beamM * 0.46, boat.lengthM * (travelSign > 0 ? 0.2 : -0.38), hullStrength, side * spreadSpeed, 0, "ridge");
        }
        emit(0, -travelSign * boat.lengthM * 0.51, hullStrength * 0.78, 0, 0, "stern");
      }
      for (const [side, engineKey] of ENGINE_SIDES) {
        const engine = engineStateRef.current[engineKey];
        const power = engine.running ? Math.abs(engine.effectiveThrottle) : 0;
        const reverse = engine.effectiveThrottle < 0;
        if (power > 0.015) {
          const churn = engine.turboActive ? 1.7 : 1;
          emit(side * boat.engineLateralOffsetM * (reverse ? 1.5 : 1), -boat.lengthM * (reverse ? 0.33 : 0.51), Math.min(1, (0.18 + power * 0.68) * displacement * churn), side * power * 0.3 * churn, (reverse ? 1 : -1) * power * 2.2 * churn, "prop");
        }
      }
    }

    const jetDecay = Math.exp(-dt * 0.35);
    for (let index = 0; index < CAPACITY; index++) {
      const puff = pool[index];
      puff.age += dt;
      const live = puff.age < puff.life;
      if (live) {
        // Waves carry energy outwards. Jets lose momentum to the surrounding
        // water instead of carrying a white streak backwards indefinitely.
        const decay = puff.ridge ? 1 : jetDecay;
        puff.vx *= decay;
        puff.vz *= decay;
        puff.x += (environment.currentVelocity.x + puff.vx) * dt;
        puff.z += (environment.currentVelocity.z + puff.vz) * dt;
        puff.yaw += puff.spin * dt;
      }
      const expansion = Math.sqrt(puff.age) * puff.growth;
      scratch.object.position.set(puff.x, WATER_LEVEL + (puff.ridge ? 0.025 : 0.04), puff.z);
      scratch.object.rotation.set(-Math.PI / 2, 0, puff.yaw);
      scratch.object.scale.set(live ? puff.width + expansion : 0, live ? puff.length + expansion * 0.7 : 0, 1);
      scratch.object.updateMatrix();
      mesh.setMatrixAt(index, scratch.object.matrix);
      const age = Math.min(1, puff.age / puff.life);
      const dilution = puff.ridge ? 1 : puff.width / (puff.width + expansion);
      const strength = live ? puff.strength * Math.min(1, puff.age * 6) * (1 - age) ** 1.15 * dilution : 0;
      wakeAttribute.setXYZ(index, strength, puff.ridge ? 1 : 0, age);
    }
    mesh.instanceMatrix.needsUpdate = true;
    wakeAttribute.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} name="boat-wake-trail" args={[undefined, undefined, CAPACITY]} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[1, 1, 24, 2]}>
        <primitive object={wakeAttribute} attach="attributes-aWake" />
      </planeGeometry>
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent depthWrite={false} />
    </instancedMesh>
  );
}
