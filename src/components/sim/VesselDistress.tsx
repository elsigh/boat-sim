"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, CanvasTexture, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, PointLight, Quaternion, Vector3 } from "three";
import type { VesselDamage } from "@/lib/sim/vessel-damage";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { FIRE_FRAGMENT, FIRE_VERTEX } from "@/lib/sim/fire-shaders";

function smokeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const u = x / 127 * 2 - 1, v = y / 127 * 2 - 1;
    const lobes = Math.sin(x * 0.14 + Math.sin(y * 0.12) * 2) * Math.cos(y * 0.17) * 0.13;
    const alpha = Math.max(0, 1 - u * u - v * v + lobes) ** 1.6;
    const i = (y * 128 + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    pixels.data[i + 3] = Math.round(Math.min(1, alpha) * 255);
  }
  context.putImageData(pixels, 0, 0);
  return new CanvasTexture(canvas);
}

const FLAMES = 32, SMOKE = 64, EMBERS = 48;
const smokeVertex = `attribute float aOpacity; varying vec2 vUv; varying float vOpacity;
void main(){vUv=uv;vOpacity=aOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const smokeFragment = `uniform sampler2D uMap; varying vec2 vUv; varying float vOpacity;
void main(){float a=texture2D(uMap,vUv).a;gl_FragColor=vec4(vec3(.12,.13,.135)+a*.045,a*vOpacity);}`;

/** Flames stay at the ruptured machinery spaces; smoke and embers inherit the
 * boat's motion at emission, then drift independently through the world. */
export function VesselDistress({ damageRef, lengthM, beamM, freeboard = 0, environment }: {
  damageRef: MutableRefObject<VesselDamage>; lengthM: number; beamM: number; freeboard?: number; environment?: SimulationEnvironment;
}) {
  const root = useRef<Group>(null), flame = useRef<InstancedMesh>(null), smoke = useRef<InstancedMesh>(null), embers = useRef<InstancedMesh>(null), light = useRef<PointLight>(null);
  const clock = useRef(0), flashAge = useRef(20), previousFire = useRef(0), smokeClock = useRef(0), emberClock = useRef(0), smokeIndex = useRef(0), emberIndex = useRef(0);
  const previousPosition = useRef<Vector3 | null>(null);
  const scratch = useMemo(() => ({ dummy: new Object3D(), billboard: new Quaternion(), inverse: new Matrix4(), position: new Vector3(), velocity: new Vector3(), local: new Vector3() }), []);
  const flameUniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: 1 } }), []);
  const map = useMemo(smokeTexture, []);
  const smokeUniforms = useMemo(() => ({ uMap: { value: map } }), [map]);
  const opacity = useMemo(() => new InstancedBufferAttribute(new Float32Array(SMOKE), 1), []);
  const particles = useMemo(() => Array.from({ length: SMOKE + EMBERS }, (_, i) => ({
    position: new Vector3(), velocity: new Vector3(), age: 99, life: i < SMOKE ? 8 : 1.8, seed: i * 2.399, size: 0,
  })), []);
  const emberColor = useMemo(() => new Color(), []);
  useEffect(() => () => { map.dispose(); }, [map]);

  useFrame((state, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.05), damage = damageRef.current, fire = damage.fire;
    if (damage.hullIntegrityPct === 100 && !fire) {
      for (const p of particles) p.age = 99;
      previousFire.current = 0; previousPosition.current = null;
      smokeClock.current = emberClock.current = 0;
      root.current.visible = false; return;
    }
    clock.current += dt; flashAge.current += dt;
    if (fire - previousFire.current > 0.1) flashAge.current = 0;
    previousFire.current = fire;
    const flash = Math.exp(-flashAge.current * 1.7) * fire;
    const active = fire > 0.005 && damage.sinking < 0.25;
    const visibleSmoke = particles.some(p => p.age < p.life);
    root.current.visible = active || visibleSmoke;
    if (!root.current.visible) return;
    const { dummy, billboard, inverse, position, velocity, local } = scratch;
    root.current.updateWorldMatrix(true, false);
    root.current.getWorldPosition(position);
    velocity.copy(position).sub(previousPosition.current ?? position).multiplyScalar(dt > 0 ? 1 / dt : 0).clampLength(0, 35);
    if (!previousPosition.current) previousPosition.current = new Vector3();
    previousPosition.current.copy(position);
    inverse.copy(root.current.matrixWorld).invert();
    root.current.getWorldQuaternion(billboard).invert().multiply(state.camera.quaternion);
    const scale = Math.max(0.65, Math.min(1.8, beamM / 4.7));
    const strength = Math.sqrt(fire), height = (1.8 + strength * 2.9 + flash * 2) * scale;
    flameUniforms.uTime.value = clock.current; flameUniforms.uOpacity.value = active ? Math.min(1, strength * 1.4) : 0;
    for (let i = 0; i < FLAMES; i++) {
      const side = i % 2 ? 1 : -1, phase = i * 2.399;
      const pulse = 0.83 + Math.sin(clock.current * (5 + i % 3) + phase) * 0.12;
      const h = height * (0.55 + (i % 5) * 0.1) * pulse;
      // Flames vent beside the cabin and out through the opened aft deck.
      dummy.position.set(side * beamM * (0.25 + (i % 3) * 0.055) + Math.sin(phase) * scale * 0.18,
        0.65 + freeboard + h / 2, -lengthM * (0.12 + (i % 4) * 0.045));
      dummy.quaternion.copy(billboard);
      dummy.scale.set((0.45 + strength * 0.5 + flash * 0.45) * scale, h, 1);
      dummy.updateMatrix(); flame.current?.setMatrixAt(i, dummy.matrix);
    }
    if (active) {
      smokeClock.current += dt * (8 + fire * 9); emberClock.current += dt * (9 + fire * 12 + flash * 32);
      const emit = (index: number, smokeParticle: boolean) => {
        const p = particles[index], side = index % 2 ? 1 : -1;
        p.age = 0;
        p.position.set(side * beamM * 0.3, freeboard + (smokeParticle ? 1 + height * 0.55 : 0.9), -lengthM * (0.15 + index % 3 * 0.055)).applyMatrix4(root.current!.matrixWorld);
        p.velocity.copy(velocity).multiplyScalar(smokeParticle ? 0.45 : 0.65);
        p.velocity.x += Math.cos(p.seed) * (smokeParticle ? 0.25 : 2 + flash * 3);
        p.velocity.z += Math.sin(p.seed) * (smokeParticle ? 0.25 : 2 + flash * 3);
        p.velocity.y = smokeParticle ? 1.3 + fire * 1.5 : 3 + index % 4 + flash * 4;
        p.size = smokeParticle ? scale * (0.65 + strength * 0.6) : scale * (0.025 + index % 3 * 0.012);
      };
      while (smokeClock.current >= 1) { emit(smokeIndex.current++ % SMOKE, true); smokeClock.current--; }
      while (emberClock.current >= 1) { emit(SMOKE + emberIndex.current++ % EMBERS, false); emberClock.current--; }
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], isSmoke = i < SMOKE;
      p.age += dt;
      const living = p.age < p.life;
      if (living) {
        const drag = Math.exp(-dt * (isSmoke ? 0.5 : 0.9));
        p.velocity.x *= drag; p.velocity.z *= drag;
        p.position.x += (p.velocity.x + (environment?.windVelocity.x ?? 0) * (isSmoke ? 0.55 : 0.25)) * dt;
        p.position.z += (p.velocity.z + (environment?.windVelocity.z ?? 0) * (isSmoke ? 0.55 : 0.25)) * dt;
        if (!isSmoke) p.velocity.y -= 4.2 * dt;
        p.position.y += p.velocity.y * dt;
        if (!isSmoke && p.position.y < 0.02) p.age = p.life;
      }
      local.copy(p.position).applyMatrix4(inverse); dummy.position.copy(local); dummy.quaternion.copy(billboard);
      if (isSmoke) {
        const life = Math.min(1, p.age / p.life), fade = Math.min(1, p.age * 3) * (1 - life) ** 1.5;
        const size = living ? p.size * (1 + p.age * 0.5) : 0;
        dummy.rotateZ(p.seed + p.age * 0.08); dummy.scale.set(size * 1.25, size, 1); dummy.updateMatrix();
        smoke.current?.setMatrixAt(i, dummy.matrix); opacity.setX(i, living ? fade * 0.62 : 0);
      } else {
        const size = living && p.age < p.life ? p.size * (1 - p.age / p.life) : 0;
        dummy.scale.set(size, size * 2.5, size); dummy.updateMatrix(); embers.current?.setMatrixAt(i - SMOKE, dummy.matrix);
        emberColor.setRGB(2, Math.max(0.1, 1 - p.age / p.life), 0.015); embers.current?.setColorAt(i - SMOKE, emberColor);
      }
    }
    opacity.needsUpdate = true;
    for (const ref of [flame, smoke, embers]) if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
    if (light.current) light.current.intensity = active ? (fire * 24 + flash * 36) * (0.9 + Math.sin(clock.current * 19) * 0.1) : 0;
  });
  return <group ref={root} visible={false}>
    <instancedMesh ref={flame} args={[undefined, undefined, FLAMES]} frustumCulled={false}>
      <planeGeometry /><shaderMaterial vertexShader={FIRE_VERTEX} fragmentShader={FIRE_FRAGMENT} uniforms={flameUniforms} toneMapped={false} transparent depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={smoke} args={[undefined, undefined, SMOKE]} frustumCulled={false}>
      <planeGeometry args={[2, 2]}><primitive attach="attributes-aOpacity" object={opacity} /></planeGeometry>
      <shaderMaterial vertexShader={smokeVertex} fragmentShader={smokeFragment} uniforms={smokeUniforms} transparent depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={embers} args={[undefined, undefined, EMBERS]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} /><meshBasicMaterial blending={AdditiveBlending} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
    </instancedMesh>
    <pointLight ref={light} position={[0, 1.5 + freeboard, -lengthM * 0.2]} color="#ff8b25" distance={beamM * 4} decay={2} />
  </group>;
}
