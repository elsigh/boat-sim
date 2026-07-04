"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, ShaderMaterial, Vector3 } from "three";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    // The mesh stays flat so animated wave crests cannot imply hull motion;
    // all ripple detail is shaded in the fragment stage.
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHorizon;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

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

  float surfaceHeight(vec2 p) {
    float broad = valueNoise(p * 0.16 + vec2(uTime * 0.055, uTime * 0.035));
    float chop = valueNoise(p * 0.55 - vec2(uTime * 0.075, uTime * 0.05));
    float ripple = valueNoise(p * 1.7 + vec2(uTime * 0.16, -uTime * 0.11));

    return broad * 0.55 + chop * 0.3 + ripple * 0.15;
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    float eps = 0.35;
    float height = surfaceHeight(p);
    float heightX = surfaceHeight(p + vec2(eps, 0.0));
    float heightZ = surfaceHeight(p + vec2(0.0, eps));
    vec3 normal = normalize(vec3((height - heightX) * 2.6, 1.0, (height - heightZ) * 2.6));

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facing = clamp(dot(viewDirection, normal), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 3.0);

    float band = smoothstep(0.32, 0.72, height);
    vec3 color = mix(uDeep, uShallow, band * 0.55);
    color = mix(color, uHorizon, fresnel * 0.55);

    // sun glint
    vec3 halfVector = normalize(uSunDirection + viewDirection);
    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), 140.0);
    float sparkle = step(0.986, valueNoise(p * 4.0 + vec2(uTime * 0.4, uTime * 0.33)));
    color += uSunColor * (specular * 0.9 + sparkle * specular * 2.2);

    // distance haze toward the horizon color
    float cameraDistance = length(cameraPosition - vWorldPosition);
    color = mix(color, uHorizon, smoothstep(120.0, 340.0, cameraDistance));

    gl_FragColor = vec4(color, 0.965);
  }
`;

export function Water() {
  const materialRef = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new Color("#0d4a66") },
      uShallow: { value: new Color("#3f8ba1") },
      uHorizon: { value: new Color("#b6cdd8") },
      uSunDirection: { value: new Vector3(0.42, 0.62, 0.28).normalize() },
      uSunColor: { value: new Color("#fff3d8") },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
      <planeGeometry args={[760, 760, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
      />
    </mesh>
  );
}
