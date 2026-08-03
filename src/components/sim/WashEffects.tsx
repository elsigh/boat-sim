"use client";

import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useMemo, useRef } from "react";
import { Group, Mesh, ShaderMaterial } from "three";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { TwinEngineState } from "@/hooks/useEngineState";

type WashEffectsProps = {
  boat: BoatProfile;
  controlsRef: MutableRefObject<GamepadSnapshot>;
  engineStateRef: MutableRefObject<TwinEngineState>;
  turboActive: boolean;
};

const washVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const washFragmentShader = `
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 centered = vUv - vec2(0.5, 0.5);
    float radial = length(centered) * 2.0;
    float churn = valueNoise(vUv * 7.0 + vec2(0.0, uTime * 1.6));
    float streaks = valueNoise(vUv * vec2(3.0, 14.0) + vec2(0.0, uTime * 2.4));
    float alpha =
      smoothstep(1.0, 0.12, radial) *
      (0.45 + 0.3 * churn + 0.25 * streaks) *
      uStrength;

    gl_FragColor = vec4(0.9, 0.96, 1.0, alpha);
  }
`;

const WATER_LOCAL_Y = -0.82;

function useWashUniforms() {
  return useMemo(
    () => ({
      uStrength: { value: 0 },
      uTime: { value: 0 },
    }),
    [],
  );
}

export function WashEffects({
  boat,
  controlsRef,
  engineStateRef,
  turboActive,
}: WashEffectsProps) {
  const portUniforms = useWashUniforms();
  const starboardUniforms = useWashUniforms();
  const bowUniforms = useWashUniforms();
  const portTurboUniforms = useWashUniforms();
  const starboardTurboUniforms = useWashUniforms();
  const portMaterialRef = useRef<ShaderMaterial | null>(null);
  const starboardMaterialRef = useRef<ShaderMaterial | null>(null);
  const bowMaterialRef = useRef<ShaderMaterial | null>(null);
  const portTurboMaterialRef = useRef<ShaderMaterial | null>(null);
  const starboardTurboMaterialRef = useRef<ShaderMaterial | null>(null);
  const portGroupRef = useRef<Group | null>(null);
  const starboardGroupRef = useRef<Group | null>(null);
  const bowMeshRef = useRef<Mesh | null>(null);
  const portTurboGroupRef = useRef<Group | null>(null);
  const starboardTurboGroupRef = useRef<Group | null>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const engines = engineStateRef.current;
    const bowThruster = controlsRef.current.bowThruster;
    const sternZ = -boat.lengthM * 0.5;

    const updateEngineWash = (
      group: Group | null,
      material: ShaderMaterial | null,
      throttle: number,
      lateralX: number,
    ) => {
      if (!group || !material) {
        return;
      }

      const magnitude = Math.min(1, Math.abs(throttle));
      material.uniforms.uStrength.value = magnitude * (turboActive ? 1.2 : 0.85);
      material.uniforms.uTime.value = time;

      if (throttle >= 0) {
        // Ahead: wash streams aft of the transom, longer with more power.
        const length = turboActive
          ? boat.lengthM * 3.8
          : 3 + magnitude * 9;
        group.position.set(lateralX, WATER_LOCAL_Y, sternZ - length * 0.42);
        group.scale.set(
          turboActive ? boat.beamM * 0.9 : 1.6 + magnitude * 0.9,
          1,
          length,
        );
      } else {
        // Astern: discharge boils forward along the quarter.
        const length = 2.5 + magnitude * 4.5;
        group.position.set(lateralX * 1.7, WATER_LOCAL_Y, sternZ + 1.2 + length * 0.3);
        group.scale.set(1.9 + magnitude, 1, length);
      }
    };

    // Local port is +x, starboard is -x.
    updateEngineWash(
      portGroupRef.current,
      portMaterialRef.current,
      engines.port.running ? engines.port.effectiveThrottle : 0,
      boat.engineLateralOffsetM,
    );
    updateEngineWash(
      starboardGroupRef.current,
      starboardMaterialRef.current,
      engines.starboard.running ? engines.starboard.effectiveThrottle : 0,
      -boat.engineLateralOffsetM,
    );

    const bowMesh = bowMeshRef.current;
    const bowMaterial = bowMaterialRef.current;

    if (bowMesh && bowMaterial) {
      const magnitude = Math.min(1, Math.abs(bowThruster));
      bowMaterial.uniforms.uStrength.value = magnitude * 0.9;
      bowMaterial.uniforms.uTime.value = time;
      // Water discharges opposite the push: a starboard push (-x) expels to
      // port (+x).
      const dischargeSide = bowThruster > 0 ? 1 : -1;
      const reach = 1.6 + magnitude * 2.4;
      bowMesh.position.set(
        dischargeSide * (boat.beamM * 0.5 + reach * 0.4),
        WATER_LOCAL_Y,
        boat.bowThrusterLongitudinalOffsetM,
      );
      bowMesh.scale.set(reach, 1, 1.8 + magnitude * 0.7);
      bowMesh.visible = magnitude > 0.02;
    }

    const updateTurboWake = (
      group: Group | null,
      material: ShaderMaterial | null,
      side: -1 | 1,
    ) => {
      if (!group || !material) {
        return;
      }

      const wakeLength = boat.lengthM * 4.6;
      const strength = turboActive ? 1 : 0;
      material.uniforms.uStrength.value +=
        (strength - material.uniforms.uStrength.value) * 0.12;
      material.uniforms.uTime.value = time * 1.8;
      group.visible = material.uniforms.uStrength.value > 0.01;
      group.position.set(
        side * boat.beamM * 0.52,
        WATER_LOCAL_Y + 0.015,
        boat.lengthM * 0.38 - wakeLength * 0.5,
      );
      group.rotation.y = side * 0.075;
      group.scale.set(boat.beamM * 0.72, 1, wakeLength);
    };

    updateTurboWake(portTurboGroupRef.current, portTurboMaterialRef.current, 1);
    updateTurboWake(
      starboardTurboGroupRef.current,
      starboardTurboMaterialRef.current,
      -1,
    );
  });

  return (
    <group>
      <group ref={portGroupRef}>
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
      <group ref={starboardGroupRef}>
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
      {[
        {
          key: "port-turbo",
          groupRef: portTurboGroupRef,
          materialRef: portTurboMaterialRef,
          uniforms: portTurboUniforms,
        },
        {
          key: "starboard-turbo",
          groupRef: starboardTurboGroupRef,
          materialRef: starboardTurboMaterialRef,
          uniforms: starboardTurboUniforms,
        },
      ].map(({ key, groupRef, materialRef, uniforms }) => (
        <group key={key} ref={groupRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              ref={materialRef}
              uniforms={uniforms}
              vertexShader={washVertexShader}
              fragmentShader={washFragmentShader}
              transparent
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
