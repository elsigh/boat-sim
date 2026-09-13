"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import { Color, Group, InstancedMesh, Object3D, Quaternion } from "three";
import type { ImpactIncident } from "@/lib/sim/collision-damage";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { impactPresentation } from "@/lib/sim/impact-presentation";
import { sampleWaterHeight } from "@/lib/sim/water-surface";

export function impactRandom(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ImpactBurst = memo(function ImpactBurst({ hit, environment }: { hit: ImpactIncident; environment: SimulationEnvironment }) {
  const root = useRef<Group>(null);
  const debris = useRef<InstancedMesh>(null), spray = useRef<InstancedMesh>(null), ripples = useRef<InstancedMesh>(null);
  const mist = useRef<InstancedMesh>(null);
  const age = useRef(0);
  const presentation = useMemo(() => impactPresentation(hit), [hit]);
  const mistRotation = useMemo(() => new Quaternion(), []);
  const mistUniforms = useMemo(() => ({ opacity: { value: 0 } }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const particles = useMemo(() => {
    const random = impactRandom(hit.id * 7919);
    const { power, speed: closingSpeed, chunks, drops } = impactPresentation(hit);
    const timber = hit.surface === "dock" || hit.surface === "piling";
    return Array.from({ length: chunks + drops }, (_, i) => {
      const chunk = i < chunks, wood = timber && i % 3 !== 0;
      const metal = chunk && i % 9 === 0;
      const slab = chunk && i % 7 === 1;
      const a = random() * Math.PI * 2, speed = (0.6 + random() * 3.5) * (0.3 + Math.sqrt(power));
      return {
        chunk, metal, slab, x: hit.world.x + (random() - 0.5) * power, y: chunk ? 0.85 : 0.12, z: hit.world.z + (random() - 0.5) * power,
        vx: Math.cos(a) * speed + (hit.normal?.x ?? 0) * Math.min(14, closingSpeed * (chunk ? 0.65 : 0.4)),
        vz: Math.sin(a) * speed + (hit.normal?.z ?? 0) * Math.min(14, closingSpeed * (chunk ? 0.65 : 0.4)),
        vy: (1.5 + random() * 5) * (0.3 + Math.sqrt(power)),
        spin: (random() - 0.5) * 9, yaw: random() * Math.PI * 2,
        size: chunk ? (slab ? 0.7 + random() * 0.8 : 0.12 + random() * 0.3) : 0.05 + random() * 0.09,
        length: slab ? 1.2 + random() * 1.4 : wood ? 0.6 + random() * 1.7 : 0.25 + random() * 0.7,
        landed: -1,
        color: new Color(wood ? (i % 2 ? "#b99161" : "#6a4d30") : metal ? "#67777c" : i % 3 ? "#e9e7df" : "#3d6976"),
      };
    });
  }, [hit]);
  const chunks = particles.filter((p) => p.chunk).length;

  useFrame((state, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.05);
    age.current += dt;
    const t = age.current;
    if (t > 35) { root.current.visible = false; return; }
    if (mist.current) {
      mistUniforms.opacity.value = Math.max(0, 1 - t / 2.7) * 0.65;
      mistRotation.copy(state.camera.quaternion);
      for (let i = 0; i < 14; i++) {
        const a = i * 2.399, travel = t * (1.2 + i % 4) * Math.sqrt(presentation.power);
        dummy.position.set(hit.world.x + Math.cos(a) * travel + (hit.normal?.x ?? 0) * t * presentation.speed * 0.18,
          Math.max(0.15, 0.2 + t * (3 + i % 3) * Math.sqrt(presentation.power) - 2.8 * t * t),
          hit.world.z + Math.sin(a) * travel + (hit.normal?.z ?? 0) * t * presentation.speed * 0.18);
        dummy.quaternion.copy(mistRotation);
        const size = (0.5 + Math.min(t, 1.2) * 2.2) * Math.sqrt(presentation.power);
        dummy.scale.set(size * 1.5, size, 1); dummy.updateMatrix(); mist.current.setMatrixAt(i, dummy.matrix);
      }
      mist.current.visible = t < 2.7; mist.current.instanceMatrix.needsUpdate = true;
    }
    let c = 0, s = 0, r = 0;
    for (const p of particles) {
      const water = sampleWaterHeight(p.x, p.z, state.clock.elapsedTime, environment);
      if (p.landed < 0) {
        p.vy -= 9.81 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        if (p.y <= water && p.vy < 0) { p.landed = t; p.y = water; }
      } else {
        p.vx *= Math.exp(-dt * 2); p.vz *= Math.exp(-dt * 2);
        p.x += (p.vx + environment.currentVelocity.x * 0.75) * dt;
        p.z += (p.vz + environment.currentVelocity.z * 0.75) * dt;
        p.y = water + (p.metal ? -(t - p.landed) * 0.35 : 0.035);
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.landed < 0 ? t * p.spin : Math.sin(t * 2 + p.yaw) * 0.09, p.yaw + t * p.spin * (p.landed < 0 ? 0.4 : 0.015), p.landed < 0 ? t * p.spin * 0.6 : 0);
      const fade = Math.max(0, Math.min(1, (35 - t) / 5));
      if (p.chunk) {
        dummy.scale.set(p.size * fade, (p.slab ? 0.14 : p.size * 0.42) * fade, p.length * fade);
        dummy.updateMatrix(); debris.current?.setMatrixAt(c, dummy.matrix); debris.current?.setColorAt(c++, p.color);
      } else {
        const visible = p.landed < 0 ? 1 : 0;
        dummy.scale.set(p.size * visible, p.size * 1.8 * visible, p.size * visible);
        dummy.updateMatrix(); spray.current?.setMatrixAt(s++, dummy.matrix);
      }
      // Each falling piece/droplet leaves a short expanding water ring.
      const ringAge = p.landed < 0 ? -1 : t - p.landed;
      const ringSize = (p.chunk || s % 8 === 0) && ringAge >= 0 && ringAge < 1.4 ? (0.15 + ringAge * (p.slab ? 1.6 : p.chunk ? 0.9 : 0.4)) : 0;
      dummy.position.set(p.x, water + 0.03, p.z); dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(ringSize); dummy.updateMatrix(); ripples.current?.setMatrixAt(r++, dummy.matrix);
    }
    for (const ref of [debris, spray, ripples]) if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  });

  return <group ref={root}>
    {presentation.plume ? <instancedMesh ref={mist} args={[undefined, undefined, 14]} frustumCulled={false}>
      <planeGeometry args={[2, 2]} /><shaderMaterial transparent depthWrite={false} uniforms={mistUniforms}
        vertexShader={`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec2 vUv; uniform float opacity;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
          void main(){vec2 p=vUv*2.-1.; float n=noise(vUv*8.)*.6+noise(vUv*21.)*.4; float a=(1.-smoothstep(.15,1.,dot(p,p)+n*.4))*opacity; gl_FragColor=vec4(mix(vec3(.58,.78,.79),vec3(.93,.99,1.),n),a);}`}
      />
    </instancedMesh> : null}
    {chunks > 0 ? <instancedMesh ref={debris} args={[undefined, undefined, chunks]} frustumCulled={false} castShadow>
      <boxGeometry /><meshStandardMaterial roughness={0.85} />
    </instancedMesh> : null}
    <instancedMesh ref={spray} args={[undefined, undefined, particles.length - chunks]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#d5f3f3" transparent opacity={0.8} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={ripples} args={[undefined, undefined, particles.length]} frustumCulled={false}>
      <ringGeometry args={[0.96, 1, 32]} /><meshBasicMaterial color="#b8e1e3" transparent opacity={0.16} depthWrite={false} />
    </instancedMesh>
  </group>;
});

/** Hard cap on active effects; no timers, React updates, or Rapier debris bodies. */
export const CollisionEffects = memo(function CollisionEffects({ incidents, environment }: { incidents: ImpactIncident[]; environment: SimulationEnvironment }) {
  return <>{incidents.slice(-12).map((hit) => <ImpactBurst key={hit.id} hit={hit} environment={environment} />)}</>;
});
