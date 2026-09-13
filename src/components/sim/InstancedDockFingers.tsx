"use client";

import { useLayoutEffect, useRef } from "react";
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { DockFloat } from "@/lib/marinas/types";

/** Several hundred small floats in three draws, with the same deck freeboard. */
export function InstancedDockFingers({ docks }: { docks: DockFloat[] }) {
  const deck = useRef<InstancedMesh>(null), skirt = useRef<InstancedMesh>(null), rails = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!docks.length) return;
    const m = new Matrix4(), q = new Quaternion(), axis = new Vector3(0, 1, 0);
    docks.forEach((dock, i) => {
      const angle = (dock.rotationDeg ?? 0) * Math.PI / 180;
      const [w, l] = dock.size, [x, z] = dock.position;
      q.setFromAxisAngle(axis, angle);
      m.compose(new Vector3(x, 0.34, z), q, new Vector3(w, 0.48, l)); deck.current!.setMatrixAt(i, m);
      m.compose(new Vector3(x, 0.02, z), q, new Vector3(w * 0.94, 0.2, l * 0.985)); skirt.current!.setMatrixAt(i, m);
      [-1, 1].forEach((side, j) => {
        const offset = side * (w / 2 - 0.07);
        m.compose(new Vector3(x + offset * Math.cos(angle), 0.655, z - offset * Math.sin(angle)), q, new Vector3(0.11, 0.15, l * 0.99));
        rails.current!.setMatrixAt(i * 2 + j, m);
      });
    });
    for (const ref of [deck, skirt, rails]) { ref.current!.instanceMatrix.needsUpdate = true; ref.current!.computeBoundingSphere(); }
  }, [docks]);
  if (!docks.length) return null;
  return <group>
    <instancedMesh ref={deck} args={[undefined, undefined, docks.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial color="#ad9b7e" roughness={0.9} /></instancedMesh>
    <instancedMesh ref={skirt} args={[undefined, undefined, docks.length]}><boxGeometry /><meshStandardMaterial color="#3c342c" roughness={0.95} /></instancedMesh>
    <instancedMesh ref={rails} args={[undefined, undefined, docks.length * 2]}><boxGeometry /><meshStandardMaterial color="#76624b" roughness={0.9} /></instancedMesh>
  </group>;
}
