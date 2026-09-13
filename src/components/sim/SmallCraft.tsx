"use client";

import { useEffect, useMemo } from "react";
import { DoubleSide, FrontSide } from "three";
import { createSmallCraftModel, smallCraftStyle, type CraftFinish, type SmallCraftSpec } from "@/lib/boats/small-craft-model";
import type { HullScar } from "./HullScars";

export type { SmallCraftKind, SmallCraftSpec } from "@/lib/boats/small-craft-model";
const NO_SCARS: HullScar[] = [];

export const SMALL_CRAFT_HULL_COLORS = ["#f4f1e8", "#e8e4d8", "#dfe3e4", "#22384c", "#2f4a3d", "#6d1f24", "#f0ead9", "#3a3f45"];
export const SMALL_CRAFT_ACCENT_COLORS = ["#1f3a52", "#7a2c2c", "#2c5d4f", "#8a7a63", "#39536b"];

const FINISHES: Record<CraftFinish, { color: string; roughness: number; metalness: number }> = {
  hull: { color: "#ffffff", roughness: 0.38, metalness: 0.06 },
  white: { color: "#edefe9", roughness: 0.45, metalness: 0.02 },
  glass: { color: "#304d5e", roughness: 0.17, metalness: 0.32 },
  metal: { color: "#b9c5ca", roughness: 0.28, metalness: 0.75 },
  teak: { color: "#a88a61", roughness: 0.75, metalness: 0 },
  canvas: { color: "#ffffff", roughness: 0.85, metalness: 0 },
  rubber: { color: "#273238", roughness: 0.82, metalness: 0 },
  cushion: { color: "#e1d9c8", roughness: 0.78, metalness: 0 },
};

export function SmallCraft({ spec, scars = NO_SCARS, moored = true }: { spec: SmallCraftSpec; scars?: HullScar[]; moored?: boolean }) {
  const meshes = useMemo(() => createSmallCraftModel(spec, moored, scars
    .filter(s => s.hit.severity === "major" || s.hit.severity === "severe")
    .map(s => ({ x: s.x, z: s.z, yaw: s.yaw, radius: s.radius, severe: s.hit.severity === "severe" }))), [spec, moored, scars]);
  useEffect(() => () => { for (const { geometry } of meshes) geometry.dispose(); }, [meshes]);
  return <group name={`Marina ${smallCraftStyle(spec)}`}>
    {meshes.map(({ finish, geometry }) => <mesh key={finish} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial {...FINISHES[finish]} side={finish === "canvas" || finish === "glass" ? DoubleSide : FrontSide}
        color={finish === "hull" ? spec.hullColor : finish === "canvas" ? spec.accentColor : FINISHES[finish].color} />
    </mesh>)}
  </group>;
}
