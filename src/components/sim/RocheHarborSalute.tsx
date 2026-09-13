"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ceremonyTiming } from "@/lib/sim/roche-ceremony";

/** Small flags and a single drifting cannon puff at the main pier. */
export function RocheHarborSalute({ elapsedRef, tapsDuration, active }: {
  elapsedRef: RefObject<number>; tapsDuration: number; active: boolean;
}) {
  const smoke = useRef<Group>(null), flash = useRef<Mesh>(null), flags = useRef<Group>(null);
  const puffMaterial = useMemo(() => new MeshStandardMaterial({ color: "#c2c0b3", transparent: true, opacity: 0, depthWrite: false, roughness: 1 }), []);
  const flashMaterial = useMemo(() => new MeshBasicMaterial({ color: "#ffd99b", transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(() => () => { puffMaterial.dispose(); flashMaterial.dispose(); }, [puffMaterial, flashMaterial]);
  const cannonAt = ceremonyTiming(tapsDuration).cannonAt;
  useFrame((state) => {
    const elapsed = active ? elapsedRef.current : -1;
    const age = elapsed < 0 ? -1 : elapsed - cannonAt;
    if (smoke.current) {
      smoke.current.visible = age >= 0 && age < 8;
      if (age >= 0 && age < 8) {
        smoke.current.position.set(age * 0.55, 1.4 + age * 0.32, age * 0.3);
        smoke.current.scale.setScalar(0.45 + age * 0.4);
        puffMaterial.opacity = 0.28 * Math.max(0, 1 - age / 8);
      }
    }
    if (flash.current) {
      flash.current.visible = age >= 0 && age < 0.16;
      flashMaterial.opacity = age >= 0 ? Math.max(0, 1 - age / 0.16) : 0;
    }
    flags.current?.children.forEach((flag, i) => {
      flag.position.y = 9.3 - (active && elapsed > 0 ? Math.min(1, elapsed / tapsDuration) * 6.1 : 0);
      flag.rotation.y = Math.sin(state.clock.elapsedTime * 1.8 + i) * 0.14;
    });
  });
  return <group name="Roche colors ceremony — main pier" position={[-292, 1.0, -87]}>
    <mesh position={[0, 0.32, 0]} castShadow><boxGeometry args={[1.8, 0.55, 1]} /><meshStandardMaterial color="#625343" /></mesh>
    <mesh position={[0, 0.85, 0.35]} rotation={[Math.PI / 2 - 0.1, 0, 0]} castShadow><cylinderGeometry args={[0.17, 0.27, 1.7, 12]} /><meshStandardMaterial color="#343936" metalness={0.65} roughness={0.5} /></mesh>
    {[-0.85, 0.85].map((x) => <mesh key={x} position={[x, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 0.1, 12]} /><meshStandardMaterial color="#4b4235" /></mesh>)}
    <group ref={smoke} visible={false}>{[[-0.6, 0, 0], [0.2, 0.5, 0.1], [0.7, 0.2, -0.2]].map((p, i) => <mesh key={i} position={p as [number, number, number]} material={puffMaterial}><sphereGeometry args={[0.9, 8, 6]} /></mesh>)}</group>
    <mesh ref={flash} visible={false} position={[0, 0.9, 1.3]} material={flashMaterial}><sphereGeometry args={[0.5, 8, 6]} /></mesh>
    {[-6, -3, 0, 3, 6].map((x) => <mesh key={x} position={[x, 5, -3.5]}><cylinderGeometry args={[0.045, 0.075, 10, 6]} /><meshStandardMaterial color="#bfc0b0" metalness={0.3} /></mesh>)}
    <group ref={flags}>{["#173d61", "#26715e", "#34436b", "#c3c1ae", "#a6564d"].map((color, i) => <group key={color} position={[(i - 2) * 3, 9.3, -3.5]}>
      <mesh position={[0.72, 0, 0]} rotation={[0, 0.25, -0.08]}><planeGeometry args={[1.4, 0.8]} /><meshStandardMaterial color={color} side={DoubleSide} /></mesh>
    </group>)}</group>
  </group>;
}
