"use client";

import { useEffect, useMemo, useState } from "react";

import { chartDepthMeters } from "@/lib/charts";
import { sceneChart } from "@/lib/marinas/scene";
import type { MarinaLayout, SpawnPoint, Vec2 } from "@/lib/marinas/types";

// Floating junk you have to look out for. Crab pots crowd the shallows near
// shore, kelp sits over the rocks, and a deadhead log turns up anywhere. They
// only get placed along the corridor the exercise actually uses — scattering
// them over a six-kilometre scene would just be noise.

export type Hazard = { id: number; x: number; z: number; kind: "crab" | "log" | "kelp" };

const HAZARD_COUNT = 20;
const CORRIDOR_WIDTH_M = 520;
// Crab pots go where crabs are: the shelf, not the middle of a deep channel.
const POT_MAX_DEPTH_M = 28;
// The depth raster is coarse (~20 m cells) while the drawn coastline comes
// from the full-resolution DEM, so a cell can average out to "shallow water"
// on ground the shoreline polygon covers. Requiring water at the point AND
// around it is what keeps pots out of the trees.
const MIN_WATER_M = 4;
const CLEARANCE_PROBE_M = 18;

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

export function HazardSpawners({
  layout,
  activeSpawn,
  onUpdate,
}: {
  layout: MarinaLayout;
  activeSpawn?: SpawnPoint | null;
  onUpdate?: (hazards: Hazard[]) => void;
}) {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const seed = useMemo(() => Math.floor(Math.random() * 10_000), []);

  const berthCenter = useMemo<Vec2>(() => {
    const berth =
      layout.berths.find((entry) => entry.id === activeSpawn?.berthId) ?? layout.berths[0];
    return berth ? berth.center : [0, 0];
  }, [activeSpawn?.berthId, layout.berths]);

  const start = useMemo<Vec2>(
    () => activeSpawn?.position ?? berthCenter,
    [activeSpawn?.position, berthCenter],
  );

  useEffect(() => {
    const chart = sceneChart(layout);
    const random = mulberry32(seed);
    const placed: Hazard[] = [];
    let id = 1;
    let attempts = 0;

    while (placed.length < HAZARD_COUNT && attempts < HAZARD_COUNT * 40) {
      attempts += 1;

      // Somewhere along the run in, offset to either side of the track.
      const t = random();
      const along: Vec2 = [
        start[0] + (berthCenter[0] - start[0]) * t,
        start[1] + (berthCenter[1] - start[1]) * t,
      ];
      const x = along[0] + (random() - 0.5) * CORRIDOR_WIDTH_M;
      const z = along[1] + (random() - 0.5) * CORRIDOR_WIDTH_M;

      if (chart) {
        const clear = [
          [0, 0],
          [CLEARANCE_PROBE_M, 0],
          [-CLEARANCE_PROBE_M, 0],
          [0, CLEARANCE_PROBE_M],
          [0, -CLEARANCE_PROBE_M],
        ].every(([dx, dz]) => chartDepthMeters(chart, x + dx, z + dz) >= MIN_WATER_M);

        if (!clear) {
          continue;
        }
      }

      // Keep clear of the berth itself — nobody leaves a pot in the slip.
      if (Math.hypot(x - berthCenter[0], z - berthCenter[1]) < 35) {
        continue;
      }

      const depth = chart ? chartDepthMeters(chart, x, z) : 10;
      const roll = random();
      let kind: Hazard["kind"] = roll < 0.6 ? "crab" : roll < 0.85 ? "kelp" : "log";

      if (kind !== "log" && depth > POT_MAX_DEPTH_M) {
        // Deep water: only a drifting log makes sense out here.
        if (random() > 0.25) {
          continue;
        }
        kind = "log";
      }

      placed.push({ id: id++, x, z, kind });
    }

    setHazards(placed);
    onUpdate?.(placed);
  }, [berthCenter, layout, onUpdate, seed, start]);

  return (
    <>
      {hazards.map((hazard) => (
        <group key={`hz-${hazard.id}`} position={[hazard.x, 0.02, hazard.z]}>
          {hazard.kind === "crab" ? (
            <mesh>
              <torusGeometry args={[0.45, 0.06, 6, 10]} />
              <meshStandardMaterial color="#b37b3a" roughness={0.9} />
            </mesh>
          ) : hazard.kind === "kelp" ? (
            <mesh>
              <torusGeometry args={[0.8, 0.08, 4, 8]} />
              <meshStandardMaterial color="#4a5f2a" roughness={0.95} />
            </mesh>
          ) : (
            <mesh>
              <cylinderGeometry args={[0.11, 0.15, 2.2, 6]} />
              <meshStandardMaterial color="#7a5b3b" roughness={0.8} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}
