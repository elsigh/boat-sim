"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import type { Object3D } from "three";
import { Vector3 } from "three";
import { SmallCraft } from "./SmallCraft";

type TenderCraftProps = {
  origin: { x: number; z: number };
  onReturn?: () => void;
  onAttach?: (obj: Object3D) => void;
};

type Keys = Record<string, boolean>;

export function TenderCraft({ origin, onReturn, onAttach }: TenderCraftProps) {
  const bodyRef = useRef<Object3D>(null);
  const [yaw, setYaw] = useState(0);
  const [pos, setPos] = useState({ x: origin.x + 6, z: origin.z + 6 });
  const keysRef = useRef<Keys>({});
  const velocity = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === "Escape") {
        onReturn?.();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onReturn]);
  useEffect(() => {
    if (bodyRef.current && onAttach) {
      onAttach(bodyRef.current);
    }
  }, [onAttach]);

  useFrame((_, delta) => {
    // Controls: arrows to steer; shift boosts a bit.
    const k = keysRef.current;
    const turn = (k["arrowleft"] ? 1 : 0) - (k["arrowright"] ? 1 : 0);
    const ahead = (k["arrowup"] ? 1 : 0) - (k["arrowdown"] ? 1 : 0);
    const boost = k["shift"] ? 1.4 : 1.0;
    const maxTurn = 1.8; // rad/s
    const accel = 10.0; // m/s^2 in tender world
    const drag = 0.85;
    const targetYaw = yaw + turn * maxTurn * delta;
    const speedDelta = ahead * accel * delta;
    // Update velocity in local frame then rotate
    velocity.z += speedDelta;
    velocity.multiplyScalar(drag);
    // Gentle homing: if no user input, bias back toward origin a little when far
    if (!k["arrowleft"] && !k["arrowright"] && !k["arrowup"] && !k["arrowdown"]) {
      const toOriginX = origin.x - pos.x;
      const toOriginZ = origin.z - pos.z;
      const dist = Math.hypot(toOriginX, toOriginZ);
      if (dist > 8) {
        const steer = Math.min(1, dist / 40);
        const ang = Math.atan2(toOriginX, toOriginZ);
        const desiredYaw = ang; // world-frame
        // Nudge yaw toward desired
        const yawErr = ((desiredYaw - targetYaw + Math.PI) % (2 * Math.PI)) - Math.PI;
        const yawNudge = Math.max(-maxTurn * delta, Math.min(maxTurn * delta, yawErr * 0.6));
        const newYaw = targetYaw + yawNudge;
        // Small forward push
        velocity.z += 8.0 * steer * delta;
        // Apply new yaw ahead of integration below
        setYaw(newYaw);
      }
    }
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dx = boost * (velocity.x * cos + velocity.z * sin);
    const dz = boost * (velocity.z * cos - velocity.x * sin);
    setYaw((y) => y);
    setPos((p) => ({ x: p.x + dx, z: p.z + dz }));
    if (bodyRef.current) {
      bodyRef.current.position.set(pos.x, 0, pos.z);
      bodyRef.current.rotation.set(0, yaw, 0);
    }
  });

  return (
    <RigidBody type="kinematicPosition" colliders={false} ref={bodyRef as any} position={[pos.x, 0, pos.z]}>
      <SmallCraft
        spec={{
          kind: "power",
          lengthM: 3.8,
          beamM: 1.6,
          hullColor: "#b8bdc0",
          accentColor: "#314a5a",
        }}
      />
    </RigidBody>
  );
}
