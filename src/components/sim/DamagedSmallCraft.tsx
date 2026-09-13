"use client";

import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { Group } from "three";
import type { ImpactIncident } from "@/lib/sim/collision-damage";
import { applyTargetVesselImpact, createVesselDamage, damagePose, stepVesselDamage } from "@/lib/sim/vessel-damage";
import type { TargetDamageSample } from "@/lib/sim/damage-cost";
import { SmallCraft, type SmallCraftSpec } from "./SmallCraft";
import { HullScars, type HullScar } from "./HullScars";
import { VesselDistress } from "./VesselDistress";
import { VesselBreakup } from "./VesselBreakup";
import { smallCraftScarSurface } from "@/lib/boats/small-craft-model";

export function DamagedSmallCraft({ spec, hits, bodyRef, onDamageSample, moored = true }: { spec: SmallCraftSpec; hits: ImpactIncident[]; bodyRef: MutableRefObject<RapierRigidBody | null>; onDamageSample: TargetDamageSample; moored?: boolean }) {
  const visual = useRef<Group>(null), damage = useRef(createVesselDamage());
  const applied = useRef(0), age = useRef(30);
  const drift = useRef({ x: 0, z: 0 });
  const sampleClock = useRef(0);
  const scars = useMemo<HullScar[]>(() => hits.slice(-12).map((hit) => {
    const p = hit.targetLocal ?? { x: spec.beamM / 2, z: 0 };
    return { hit, ...smallCraftScarSurface(spec, p.x, p.z),
      radius: hit.severity === "severe" ? 1 : hit.severity === "major" ? 0.65 : 0.3 };
  }), [hits, spec]);
  useEffect(() => {
    for (const hit of hits) if (hit.id > applied.current) {
      damage.current = applyTargetVesselImpact(damage.current, hit, spec.lengthM);
      if (hit.fracture) {
        const speed = Math.min(5, hit.closingSpeedKnots * 0.514444 * 0.28);
        drift.current = { x: (hit.normal?.x ?? 0) * speed, z: (hit.normal?.z ?? 0) * speed };
      }
      applied.current = hit.id; age.current = 0;
    }
  }, [hits, spec.lengthM]);
  useFrame((_, delta) => {
    if (!visual.current || !hits.length) return;
    const dt = Math.min(delta, 0.05);
    age.current += dt;
    damage.current = stepVesselDamage(damage.current, dt, spec.lengthM * spec.beamM * 450);
    sampleClock.current += dt;
    if (sampleClock.current >= 0.25) {
      sampleClock.current = 0;
      onDamageSample(hits[0].objectName, damage.current, applied.current);
    }
    const pose = damagePose(damage.current, spec.lengthM);
    const recoil = Math.sin(age.current * 6) * Math.exp(-age.current * 1.3) * Math.min(0.22, (100 - damage.current.hullIntegrityPct) / 200);
    visual.current.rotation.z = pose.roll + recoil;
    visual.current.rotation.x = pose.pitch + recoil * 0.4;
    const body = bodyRef.current;
    if (body?.isValid()) {
      const p = body.translation();
      body.setNextKinematicTranslation({ x: p.x + drift.current.x * dt, y: -pose.sinkDepth, z: p.z + drift.current.z * dt });
      drift.current.x *= Math.exp(-dt * 0.55); drift.current.z *= Math.exp(-dt * 0.55);
    }
  });
  return <group ref={visual}>
    <VesselBreakup damageRef={damage} lengthM={spec.lengthM} beamM={spec.beamM}>
    <SmallCraft spec={spec} scars={scars} moored={moored} />
    <HullScars scars={scars} />
    </VesselBreakup>
    {hits.length ? <VesselDistress damageRef={damage} lengthM={spec.lengthM} beamM={spec.beamM} /> : null}
  </group>;
}
