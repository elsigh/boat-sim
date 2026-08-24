"use client";

import { useEffect, useMemo, useState } from "react";
import { Group } from "three";

type Animal = { id: number; x: number; z: number; kind: "porpoise" | "orca" | "sea-lion" | "gull" };

export function Wildlife({ regionKey }: { regionKey: string }) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const seed = useMemo(() => Math.floor(Math.random() * 10_000), []);

  useEffect(() => {
    const counts: Record<string, Partial<Record<Animal["kind"], number>>> = {
      "roche-harbor-marina": { "gull": 8, "sea-lion": 2 },
      "reid-harbor-anchorage": { "gull": 6, "porpoise": 3 },
      "fossil-bay-anchorage": { "gull": 4, "porpoise": 2 },
      "eagle-harbor": { "gull": 5, "porpoise": 3, "sea-lion": 1 },
      "bellingham-marina": { "gull": 9 },
    };
    const budget = counts[regionKey] ?? { gull: 5 };
    const list: Animal[] = [];
    let id = 1;
    Object.entries(budget).forEach(([kind, count]) => {
      const n = Math.max(0, Math.floor(count ?? 0));
      for (let i = 0; i < n; i += 1) {
        const x = (Math.random() - 0.5) * 280;
        const z = (Math.random() - 0.5) * 280;
        list.push({ id: id++, x, z, kind: kind as Animal["kind"] });
      }
    });
    setAnimals(list);
  }, [regionKey, seed]);

  return (
    <>
      {animals.map((a) => (
        <group key={`fauna-${a.id}`} position={[a.x, 0.02, a.z]}>
          {a.kind === "gull" ? (
            <mesh>
              <sphereGeometry args={[0.12, 6, 6]} />
              <meshStandardMaterial color="#e6e7e8" roughness={0.7} />
            </mesh>
          ) : a.kind === "sea-lion" ? (
            <mesh>
              <capsuleGeometry args={[0.22, 0.6, 4, 6]} />
              <meshStandardMaterial color="#6a5a44" roughness={0.9} />
            </mesh>
          ) : a.kind === "porpoise" ? (
            <mesh rotation={[0, 0, 0]}>
              <capsuleGeometry args={[0.16, 0.5, 6, 8]} />
              <meshStandardMaterial color="#4a5561" roughness={0.5} metalness={0.1} />
            </mesh>
          ) : (
            <group>
              <mesh>
                <capsuleGeometry args={[0.28, 1.2, 6, 8]} />
                <meshStandardMaterial color="#1b1f25" roughness={0.5} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </>
  );
}

