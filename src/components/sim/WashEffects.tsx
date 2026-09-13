"use client";

import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useMemo, useRef } from "react";
import { Group, Mesh, ShaderMaterial, Quaternion, Vector2, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import { bowThrusterEffectiveness, type SimulationEnvironment } from "@/lib/sim/boat-physics";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { wakeNoiseShader } from "@/lib/sim/wake-shaders";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { TwinEngineState } from "@/hooks/useEngineState";

type WashEffectsProps = {
  boat: BoatProfile;
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  environment: SimulationEnvironment;
  controlsRef: MutableRefObject<GamepadSnapshot>;
  engineStateRef: MutableRefObject<TwinEngineState>;
};

const washVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const washFragmentShader = `
  uniform float uStrength;
  uniform float uTime;
  uniform vec2 uCurrent;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  ${wakeNoiseShader}

  void main() {
    vec3 foam = wakeFoam(vWorldPosition.xz - uCurrent * uTime, uTime);
    float radial = length((vUv - 0.5) * 2.0) + (foam.x - 0.5) * 0.25;
    float edge = 1.0 - smoothstep(0.2, 1.0, radial);
    float churn = smoothstep(0.18, 0.64, foam.x) * (0.35 + foam.y * 0.65);
    float alpha = edge * (0.08 + churn * 0.82) * uStrength;
    vec3 color = mix(vec3(0.18, 0.42, 0.43), vec3(0.9, 0.96, 0.93), churn);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const WATER_LOCAL_Y = -0.92;

function useWashUniforms() {
  return useMemo(
    () => ({
      uStrength: { value: 0 },
      uTime: { value: 0 },
      uCurrent: { value: new Vector2() },
    }),
    [],
  );
}

export function WashEffects({
  boat,
  bodyRef,
  environment,
  controlsRef,
  engineStateRef,
}: WashEffectsProps) {
  const flow = useMemo(() => ({ velocity: new Vector3(), rotation: new Quaternion() }), []);
  const portUniforms = useWashUniforms();
  const starboardUniforms = useWashUniforms();
  const bowUniforms = useWashUniforms();
  const portMaterialRef = useRef<ShaderMaterial | null>(null);
  const starboardMaterialRef = useRef<ShaderMaterial | null>(null);
  const bowMaterialRef = useRef<ShaderMaterial | null>(null);
  const portGroupRef = useRef<Group | null>(null);
  const starboardGroupRef = useRef<Group | null>(null);
  const bowMeshRef = useRef<Mesh | null>(null);
  const displacement = Math.min(1.8, Math.max(0.55, Math.cbrt(boat.massKg / 26_000)));

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const engines = engineStateRef.current;
    const body = liveRigidBody(bodyRef);
    let surge = 0;
    if (body) {
      const velocity = body.linvel();
      const rotation = body.rotation();
      flow.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w).invert();
      surge = flow.velocity.set(velocity.x - environment.currentVelocity.x, 0, velocity.z - environment.currentVelocity.z).applyQuaternion(flow.rotation).z;
    }
    const bowThruster = boat.maxBowThrusterForceN > 0 ? controlsRef.current.bowThruster * bowThrusterEffectiveness(surge) : 0;
    const sternZ = -boat.lengthM * 0.5;

    const updateEngineWash = (
      group: Group | null,
      material: ShaderMaterial | null,
      throttle: number,
      lateralX: number,
      turboActive: boolean,
    ) => {
      if (!group || !material) {
        return;
      }

      const magnitude = Math.min(1, Math.abs(throttle));
      material.uniforms.uStrength.value = (magnitude > 0.005 ? Math.min(0.9, (0.16 + magnitude * 0.67) * displacement) : 0) * (turboActive ? 1.2 : 1);
      group.visible = magnitude > 0.005;
      material.uniforms.uTime.value = time;
      material.uniforms.uCurrent.value.set(environment.currentVelocity.x, environment.currentVelocity.z);

      if (throttle >= 0) {
        // Only the fresh propeller boil is hull-attached. WakeTrail carries
        // the rest in the water, so even turbo wash follows a turn naturally.
        const length = boat.lengthM * (0.1 + magnitude * 0.18) * (turboActive ? 1.35 : 1);
        group.position.set(lateralX, WATER_LOCAL_Y, sternZ - length * 0.42);
        group.scale.set(
          boat.beamM * (0.22 + magnitude * 0.18) * (turboActive ? 1.2 : 1),
          1,
          length,
        );
      } else {
        // Astern: discharge boils forward along the quarter.
        const length = boat.lengthM * (0.1 + magnitude * 0.2);
        group.position.set(lateralX * 1.7, WATER_LOCAL_Y, sternZ + 1.2 + length * 0.3);
        group.scale.set(boat.beamM * (0.32 + magnitude * 0.24), 1, length);
      }
    };

    // Local port is +x, starboard is -x.
    updateEngineWash(
      portGroupRef.current,
      portMaterialRef.current,
      engines.port.running ? engines.port.effectiveThrottle : 0,
      boat.engineLateralOffsetM,
      engines.port.turboActive,
    );
    updateEngineWash(
      starboardGroupRef.current,
      starboardMaterialRef.current,
      engines.starboard.running ? engines.starboard.effectiveThrottle : 0,
      -boat.engineLateralOffsetM,
      engines.starboard.turboActive,
    );

    const bowMesh = bowMeshRef.current;
    const bowMaterial = bowMaterialRef.current;

    if (bowMesh && bowMaterial) {
      const magnitude = Math.min(1, Math.abs(bowThruster));
      bowMaterial.uniforms.uStrength.value = magnitude * 0.9;
      bowMaterial.uniforms.uTime.value = time;
      bowMaterial.uniforms.uCurrent.value.set(environment.currentVelocity.x, environment.currentVelocity.z);
      // Water discharges opposite the push: a starboard push (-x) expels to
      // port (+x).
      const dischargeSide = bowThruster > 0 ? 1 : -1;
      const reach = 1.6 + magnitude * 2.4;
      bowMesh.position.set(
        dischargeSide * (boat.beamM * 0.5 + reach * 0.4),
        WATER_LOCAL_Y,
        boat.bowThrusterLongitudinalOffsetM,
      );
      bowMesh.scale.set(reach, 1.8 + magnitude * 0.7, 1);
      bowMesh.visible = magnitude > 0.02;
    }
  });

  return (
    <group>
      <group ref={portGroupRef} name="port-propeller-wash">
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={portMaterialRef}
            uniforms={portUniforms}
            vertexShader={washVertexShader}
            fragmentShader={washFragmentShader}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={starboardGroupRef} name="starboard-propeller-wash">
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={starboardMaterialRef}
            uniforms={starboardUniforms}
            vertexShader={washVertexShader}
            fragmentShader={washFragmentShader}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh ref={bowMeshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={bowMaterialRef}
          uniforms={bowUniforms}
          vertexShader={washVertexShader}
          fragmentShader={washFragmentShader}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
