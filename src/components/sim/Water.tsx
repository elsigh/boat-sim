"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { WATER_LEVEL, WATER_WAVES, waterAmplitude } from "@/lib/sim/water-surface";

const vertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uWindHeading;
  uniform vec2 uCurrent;
  uniform vec3 uDeep;
  uniform vec3 uBody;
  uniform vec3 uHorizon;
  uniform vec3 uSunDirection;
  varying vec3 vWorldPosition;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // Value noise with its analytic gradient: irregular wind ripples without
  // repeated finite-difference height samples in every pixel.
  vec3 ripple(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = hash(i), b = hash(i + vec2(1, 0));
    float c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
    float crossTerm = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + crossTerm * u.x * u.y,
      du * vec2(b - a + crossTerm * u.y, c - a + crossTerm * u.x));
  }

  void main() {
    vec2 p = vWorldPosition.xz - uCurrent * uTime;
    vec2 slope = vec2(0.0);
    float height = 0.0;
    ${WATER_WAVES.map((wave) => `{
      float k = ${(2 * Math.PI / wave.wavelength).toFixed(8)};
      vec2 direction = vec2(cos(uWindHeading + ${wave.angle.toFixed(4)}), sin(uWindHeading + ${wave.angle.toFixed(4)}));
      float phase = dot(p, direction) * k - sqrt(9.81 * k) * uTime;
      float waveFilter = 1.0 - smoothstep(0.4, 2.0, fwidth(phase));
      slope += direction * k * ${wave.amplitude.toFixed(4)} * cos(phase) * uAmplitude * waveFilter;
      height += sin(phase) * ${wave.amplitude.toFixed(4)} * waveFilter;
    }`).join("\n")}
    // Short capillary ripples ride the longer waves. Derivative filtering
    // keeps distant water quiet instead of sparkling into moire patterns.
    float detail = 1.0 - smoothstep(0.08, 0.8, length(fwidth(p)));
    slope += detail * uAmplitude * vec2(
      cos(dot(p, vec2(5.4, 2.8)) - uTime * 3.2),
      sin(dot(p, vec2(-3.1, 7.2)) - uTime * 4.1)
    ) * 0.7;
    vec3 windRipple = ripple(p * vec2(1.4, 2.8) + vec2(uTime * 0.24, -uTime * 0.32));
    slope += windRipple.yz * uAmplitude * 2.4 * detail;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(viewDirection, normal), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 color = mix(uDeep, uBody, clamp(0.4 + height * 0.06 + windRipple.x * detail * 0.1, 0.0, 1.0));
    color *= 0.83 + max(dot(normal, uSunDirection), 0.0) * 0.3;
    color = mix(color, uHorizon, fresnel * 0.85);
    vec3 halfVector = normalize(uSunDirection + viewDirection);
    float glint = pow(max(dot(normal, halfVector), 0.0), 220.0);
    color += vec3(1.0, 0.94, 0.8) * glint * 0.65;
    float cameraDistance = length(cameraPosition - vWorldPosition);
    color = mix(color, uHorizon, smoothstep(280.0, 1100.0, cameraDistance) * 0.85);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Water({ environment }: { environment: SimulationEnvironment }) {
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAmplitude: { value: 0.02 },
    uWindHeading: { value: 0.4 },
    uCurrent: { value: new Vector2() },
    uDeep: { value: new Color("#143c4b") },
    uBody: { value: new Color("#31636b") },
    uHorizon: { value: new Color("#b6cdd8") },
    uSunDirection: { value: new Vector3(120, 90, 65).normalize() },
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      uniforms.uTime.value = state.clock.elapsedTime;
      uniforms.uAmplitude.value = waterAmplitude(environment);
      const wind = environment.windVelocity;
      uniforms.uWindHeading.value = wind.lengthSq() > 0.001 ? Math.atan2(wind.z, wind.x) : 0.4;
      uniforms.uCurrent.value.set(environment.currentVelocity.x, environment.currentVelocity.z);
    }
    if (meshRef.current) {
      meshRef.current.position.x = state.camera.position.x;
      meshRef.current.position.z = state.camera.position.z;
    }
  });

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, WATER_LEVEL, 0]}>
      <planeGeometry args={[10000, 10000, 1, 1]} />
      <shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
}
