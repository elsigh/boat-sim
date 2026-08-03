"use client";

import { useMemo } from "react";

import type { ImpactIncident } from "@/lib/sim/collision-damage";

// Scars left on the marina where the boat hit something solid. Scuffs get a
// dark smudge at deck height; harder hits splinter the timber.

const MARK_Y = 0.62;

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

function SplinterCluster({ incident }: { incident: ImpactIncident }) {
  const splinters = useMemo(() => {
    const random = mulberry32(incident.id * 7919 + 17);
    const count = incident.severity === "severe" ? 9 : 5;

    return Array.from({ length: count }, () => ({
      dx: (random() - 0.5) * 1.6,
      dz: (random() - 0.5) * 1.6,
      yaw: random() * Math.PI,
      tilt: (random() - 0.5) * 1.1,
      length: 0.35 + random() * 0.7,
    }));
  }, [incident.id, incident.severity]);

  return (
    <group>
      {splinters.map((splinter, index) => (
        <mesh
          key={index}
          castShadow
          position={[splinter.dx, MARK_Y + 0.1, splinter.dz]}
          rotation={[splinter.tilt, splinter.yaw, splinter.tilt * 0.6]}
        >
          <boxGeometry args={[0.05, 0.05, splinter.length]} />
          <meshStandardMaterial color="#6b5335" roughness={0.95} />
        </mesh>
      ))}
      {/* shattered deck patch */}
      <mesh position={[0, MARK_Y + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[incident.severity === "severe" ? 1.1 : 0.7, 10]} />
        <meshStandardMaterial color="#3a2d20" roughness={1} />
      </mesh>
    </group>
  );
}

export function ImpactMarks({ incidents }: { incidents: ImpactIncident[] }) {
  const structural = incidents.filter(
    (incident) =>
      incident.surface === "dock" ||
      incident.surface === "piling" ||
      incident.surface === "moored",
  );

  return (
    <group>
      {structural.map((incident) => (
        <group
          key={`impact-mark-${incident.id}`}
          position={[incident.world.x, 0, incident.world.z]}
        >
          {incident.severity === "scuff" || incident.severity === "minor" ? (
            <mesh position={[0, MARK_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[incident.severity === "minor" ? 0.45 : 0.28, 8]} />
              <meshStandardMaterial
                color="#4c4136"
                roughness={1}
                transparent
                opacity={0.85}
              />
            </mesh>
          ) : (
            <SplinterCluster incident={incident} />
          )}
        </group>
      ))}
    </group>
  );
}
