"use client";

import type { ImpactIncident } from "@/lib/sim/collision-damage";

export type HullScar = { hit: ImpactIncident; x: number; z: number; yaw: number; radius: number };

/** Ragged exposed laminate and bent rail ends, in the boat's visual frame. */
export function HullScars({ scars }: { scars: HullScar[] }) {
  return <>{scars.map(({ hit, x, z, yaw, radius }) => {
    const structural = hit.severity === "major" || hit.severity === "severe";
    return <group key={hit.id} position={[x, 0.02, z]} rotation={[0, yaw, 0]}>
      <mesh scale={[radius, structural ? radius * 0.48 : 0.09, 1]}>
        <circleGeometry args={[1, 7]} /><meshStandardMaterial color={structural ? "#202326" : "#65605a"} roughness={1} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {structural ? Array.from({ length: 5 }, (_, i) => <mesh key={i}
        position={[(i / 4 - 0.5) * radius * 1.6, (i % 2 ? -1 : 1) * radius * 0.32, 0.07]}
        rotation={[i % 2 ? 0.5 : -0.3, (i - 2) * 0.22, i * 0.73]}>
        <boxGeometry args={[radius * 0.45, 0.06, 0.23]} /><meshStandardMaterial color="#cac4ae" roughness={0.95} />
      </mesh>) : null}
      {structural ? <mesh position={[radius * 0.7, 0.7, 0.08]} rotation={[0.25, 0, -0.8]}>
        <cylinderGeometry args={[0.026, 0.026, 0.75, 6]} /><meshStandardMaterial color="#8d999b" metalness={0.65} roughness={0.45} />
      </mesh> : null}
    </group>;
  })}</>;
}
