"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  TubeGeometry,
  Vector3,
} from "three";

import type { Berth } from "@/lib/marinas/types";

const FIREWORK_COLORS = ["#ffd76a", "#7dffb1", "#7cd7ff", "#ff9de2", "#fff3c4"];
const BURST_COUNT = 7;
const BURST_PARTICLES = 110;
const BURST_LIFETIME = 2.4;
const DOLPHIN_SHOW_SECONDS = 14;

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;

  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World-frame starboard direction of a berth heading (starboard is -x side). */
function berthVectors(berth: Berth) {
  const headingRad = degToRad(berth.headingDeg);
  const forward = new Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
  const starboard = new Vector3(-Math.cos(headingRad), 0, Math.sin(headingRad));
  const dockward = berth.dockSide === "starboard" ? starboard.clone() : starboard.clone().negate();

  return { forward, dockward };
}

function FireworkBurst({
  position,
  color,
  delay,
  seed,
}: {
  position: Vector3;
  color: string;
  delay: number;
  seed: number;
}) {
  const pointsRef = useRef<Points | null>(null);
  const geometryRef = useRef<BufferGeometry | null>(null);
  const materialRef = useRef<PointsMaterial | null>(null);
  const startRef = useRef<number | null>(null);
  const velocities = useMemo(() => {
    const random = mulberry32(7919 + seed * 101);
    const values: number[] = [];

    for (let index = 0; index < BURST_PARTICLES; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const speed = 4.5 + random() * 4.5;

      values.push(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
    }

    return values;
  }, [seed]);

  useEffect(() => {
    geometryRef.current?.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(BURST_PARTICLES * 3), 3),
    );
  }, []);

  useFrame((state) => {
    const points = pointsRef.current;
    const geometry = geometryRef.current;
    const material = materialRef.current;

    if (!points || !geometry || !material) {
      return;
    }

    if (startRef.current === null) {
      startRef.current = state.clock.elapsedTime;
    }

    const t = state.clock.elapsedTime - startRef.current - delay;

    if (t < 0 || t > BURST_LIFETIME) {
      points.visible = false;
      return;
    }

    points.visible = true;

    const attribute = geometry.getAttribute("position") as BufferAttribute | undefined;

    if (!attribute) {
      return;
    }

    const array = attribute.array as Float32Array;

    for (let index = 0; index < BURST_PARTICLES; index += 1) {
      const drag = 1 - Math.min(0.75, t * 0.28);
      array[index * 3] = velocities[index * 3] * t * drag;
      array[index * 3 + 1] = velocities[index * 3 + 1] * t * drag - 2.6 * t * t;
      array[index * 3 + 2] = velocities[index * 3 + 2] * t * drag;
    }

    attribute.needsUpdate = true;
    material.opacity = Math.max(0, 1.6 - (t / BURST_LIFETIME) * 1.6);
    material.size = 1.1 - (t / BURST_LIFETIME) * 0.55;
  });

  return (
    <points ref={pointsRef} position={position} visible={false}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        ref={materialRef}
        color={color}
        size={1.1}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function Fireworks({ berth }: { berth: Berth }) {
  const bursts = useMemo(() => {
    const random = mulberry32(4241);

    return Array.from({ length: BURST_COUNT }, (_, index) => ({
      delay: index * 0.75 + random() * 0.35,
      position: new Vector3(
        berth.center[0] + (random() - 0.5) * 40,
        15 + random() * 11,
        berth.center[1] + (random() - 0.5) * 40,
      ),
      color: FIREWORK_COLORS[index % FIREWORK_COLORS.length],
    }));
  }, [berth]);

  return (
    <group>
      {bursts.map((burst, index) => (
        <FireworkBurst
          key={index}
          position={burst.position}
          color={burst.color}
          delay={burst.delay}
          seed={index}
        />
      ))}
    </group>
  );
}

function Dolphin({
  basePosition,
  forward,
  phase,
}: {
  basePosition: Vector3;
  forward: Vector3;
  phase: number;
}) {
  const groupRef = useRef<Group | null>(null);
  const bodyRef = useRef<Group | null>(null);
  const startRef = useRef<number | null>(null);
  const headingY = Math.atan2(forward.x, forward.z);

  useFrame((state) => {
    const group = groupRef.current;
    const body = bodyRef.current;

    if (!group || !body) {
      return;
    }

    if (startRef.current === null) {
      startRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startRef.current;

    if (elapsed > DOLPHIN_SHOW_SECONDS) {
      group.visible = false;
      return;
    }

    const period = 2.6;
    const t = (elapsed + phase) % period;
    const jumpDuration = 1.7;

    if (t > jumpDuration) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const progress = t / jumpDuration;
    const jumpLength = 8;
    const jumpHeight = 2.3;
    const along = (progress - 0.5) * jumpLength;
    const height = jumpHeight * 4 * progress * (1 - progress) - 0.55;

    group.position.set(
      basePosition.x + forward.x * along,
      height,
      basePosition.z + forward.z * along,
    );

    // Pitch follows the arc: nose up on the way out, nose down going in.
    const slope = (jumpHeight * 4 * (1 - 2 * progress)) / jumpLength;
    body.rotation.x = -Math.atan(slope);
  });

  return (
    <group ref={groupRef} visible={false}>
      <group rotation={[0, headingY, 0]}>
        <group ref={bodyRef}>
          {/* body */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.24, 1.05, 4, 10]} />
            <meshStandardMaterial color="#64798a" roughness={0.45} />
          </mesh>
          {/* snout */}
          <mesh position={[0, -0.02, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 0.42, 8]} />
            <meshStandardMaterial color="#5c7182" roughness={0.45} />
          </mesh>
          {/* dorsal fin */}
          <mesh position={[0, 0.32, -0.05]} rotation={[-0.5, 0, 0]}>
            <coneGeometry args={[0.1, 0.36, 6]} />
            <meshStandardMaterial color="#546879" roughness={0.5} />
          </mesh>
          {/* flukes */}
          <mesh position={[0, 0.02, -0.85]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.55, 0.045, 0.26]} />
            <meshStandardMaterial color="#546879" roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function DolphinPod({ berth }: { berth: Berth }) {
  const { forward, dockward } = berthVectors(berth);
  const seaward = dockward.clone().negate();
  const base = new Vector3(berth.center[0], 0, berth.center[1]).addScaledVector(seaward, 11);

  return (
    <group>
      {[-5, 0.5, 5.5].map((offset, index) => (
        <Dolphin
          key={index}
          basePosition={base.clone().addScaledVector(forward, offset)}
          forward={forward}
          phase={index * 0.9}
        />
      ))}
    </group>
  );
}

function ThrownLine({
  from,
  to,
  delay,
}: {
  from: Vector3;
  to: Vector3;
  delay: number;
}) {
  const meshRef = useRef<Mesh | null>(null);
  const startRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  useFrame((state) => {
    const mesh = meshRef.current;

    if (!mesh || settledRef.current) {
      return;
    }

    if (startRef.current === null) {
      startRef.current = state.clock.elapsedTime;
    }

    const t = state.clock.elapsedTime - startRef.current - delay;

    if (t < 0) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;

    const progress = Math.min(1, t / 0.8);
    const eased = 1 - (1 - progress) * (1 - progress);
    const end = from.clone().lerp(to, eased);
    const mid = from
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      // arcs through the air while flying, sags once made fast
      .add(new Vector3(0, 1.6 * (1 - eased) - 0.45 * eased, 0));
    const curve = new QuadraticBezierCurve3(from, mid, end);
    const nextGeometry = new TubeGeometry(curve, 14, 0.05, 5, false);

    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;

    if (progress >= 1) {
      settledRef.current = true;
    }
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <meshStandardMaterial color="#ded3b6" roughness={0.9} />
    </mesh>
  );
}

function DockLines({ berth }: { berth: Berth }) {
  const lines = useMemo(() => {
    const { forward, dockward } = berthVectors(berth);
    const center = new Vector3(berth.center[0], 0, berth.center[1]);
    const dockEdge = berth.widthM * 0.5 + 1.1;
    const boatEdge = berth.widthM * 0.5 - 0.4;

    return [-0.38, 0.38].map((alongRatio, index) => {
      const along = berth.lengthM * alongRatio;
      const from = center
        .clone()
        .addScaledVector(forward, along * 1.15)
        .addScaledVector(dockward, dockEdge)
        .setY(0.45);
      const to = center
        .clone()
        .addScaledVector(forward, along)
        .addScaledVector(dockward, boatEdge)
        .setY(0.72);

      return { from, to, delay: 0.5 + index * 0.7 };
    });
  }, [berth]);

  return (
    <group>
      {lines.map((line, index) => (
        <ThrownLine key={index} from={line.from} to={line.to} delay={line.delay} />
      ))}
    </group>
  );
}

export function DockingCelebration({
  active,
  celebrationId,
  berth,
}: {
  active: boolean;
  celebrationId: number;
  berth: Berth | null;
}) {
  if (!active || !berth) {
    return null;
  }

  return (
    <group key={celebrationId}>
      <Fireworks berth={berth} />
      <DolphinPod berth={berth} />
      <DockLines berth={berth} />
    </group>
  );
}
