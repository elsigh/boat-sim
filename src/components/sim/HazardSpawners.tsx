"use client";

import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";

import type { MarinaLayout, SpawnPoint } from "@/lib/marinas/types";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import { placeHazards, type Hazard } from "@/lib/sim/hazard-placement";
import { CrabPotBuoy } from "./CrabPotBuoy";

export type { Hazard } from "@/lib/sim/hazard-placement";

const HOVER_RADIUS_PX = 24;

const HAZARD_LABELS: Record<Hazard["kind"], string> = {
  crab: "Crab pot",
  log: "Drifting log",
  kelp: "Kelp",
};

export function HazardSpawners({
  layout,
  activeSpawn,
  environment,
  onUpdate,
}: {
  layout: MarinaLayout;
  activeSpawn?: SpawnPoint | null;
  environment: SimulationEnvironment;
  onUpdate?: (hazards: Hazard[]) => void;
}) {
  const [hoveredHazardId, setHoveredHazardId] = useState<number | null>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 10_000), []);
  const hazards = useMemo(() => placeHazards(layout, activeSpawn, seed), [layout, activeSpawn, seed]);
  const { camera, gl } = useThree();
  const pointerRef = useRef({ x: -10_000, y: -10_000 });
  const frameRef = useRef<number | null>(null);
  const projectedRef = useRef(new Vector3());

  useEffect(() => {
    onUpdate?.(hazards);
  }, [hazards, onUpdate]);

  useEffect(() => {
    const pickHazard = () => {
      frameRef.current = null;
      const rect = gl.domElement.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      let closestId: number | null = null;
      let closestDistanceSq = HOVER_RADIUS_PX * HOVER_RADIUS_PX;

      for (const hazard of hazards) {
        const projected = projectedRef.current.set(hazard.x, 0.15, hazard.z).project(camera);

        if (projected.z < -1 || projected.z > 1) {
          continue;
        }

        const screenX = rect.left + (projected.x + 1) * 0.5 * rect.width;
        const screenY = rect.top + (1 - projected.y) * 0.5 * rect.height;
        const dx = pointerRef.current.x - screenX;
        const dy = pointerRef.current.y - screenY;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < closestDistanceSq) {
          closestDistanceSq = distanceSq;
          closestId = hazard.id;
        }
      }

      setHoveredHazardId((current) => (current === closestId ? current : closestId));
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(pickHazard);
      }
    };

    const clearHover = () => {
      pointerRef.current = { x: -10_000, y: -10_000 };
      setHoveredHazardId(null);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", clearHover);
    document.addEventListener("mouseleave", clearHover);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearHover);
      document.removeEventListener("mouseleave", clearHover);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [camera, gl, hazards]);

  return (
    <>
      {hazards.map((hazard) => (
        <group key={`hz-${hazard.id}`} position={[hazard.x, 0.02, hazard.z]}>
          {hazard.kind === "crab" ? (
            <CrabPotBuoy x={hazard.x} z={hazard.z} environment={environment} />
          ) : hazard.kind === "kelp" ? (
            <mesh name="kelp-clump" scale={[1, 0.16, 1]}>
              <sphereGeometry args={[0.8, 24, 12]} />
              <meshStandardMaterial color="#527834" roughness={0.95} />
            </mesh>
          ) : (
            <mesh>
              <cylinderGeometry args={[0.11, 0.15, 2.2, 6]} />
              <meshStandardMaterial color="#7a5b3b" roughness={0.8} />
            </mesh>
          )}
          {hoveredHazardId === hazard.id ? (
            <Html
              center
              position={[0, 1.35, 0]}
              pointerEvents="none"
              zIndexRange={[30, 20]}
            >
              <div
                className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-950 shadow-lg"
                data-hazard-tooltip={hazard.kind}
              >
                {HAZARD_LABELS[hazard.kind]}
              </div>
            </Html>
          ) : null}
        </group>
      ))}
    </>
  );
}
