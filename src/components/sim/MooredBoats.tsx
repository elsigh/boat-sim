"use client";

import {
  CoefficientCombineRule,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { memo, useMemo, useRef } from "react";

import { offset } from "@/lib/marinas/builders";
import { sceneDocks } from "@/lib/marinas/scene";
import type { MarinaLayout } from "@/lib/marinas/types";

import {
  SMALL_CRAFT_ACCENT_COLORS,
  SMALL_CRAFT_HULL_COLORS,
  type SmallCraftSpec,
} from "./SmallCraft";

import type { ImpactIncident } from "@/lib/sim/collision-damage";
import { DamagedSmallCraft } from "./DamagedSmallCraft";
import { smallCraftAsset } from "@/lib/boats/valuation";
import type { TargetDamageSample } from "@/lib/sim/damage-cost";

const CONTACT_FRICTION = 0.05;
const CONTACT_RESTITUTION = 0.05;
// Every slip full would make the exercises impossible to read; roughly two
// thirds occupancy looks like an August marina with the transient dock open.
const OCCUPANCY = 0.66;
// Hand-authored fingers are named; chart fingers come out of OSM with opaque
// ids, so they're recognised by shape instead: a narrow float 8-34 m long.
const FINGER_ID_PATTERN = /-finger-(left|right)-\d+$/;
const FINGER_MAX_WIDTH_M = 1.8;
const FINGER_MIN_LENGTH_M = 8;
const FINGER_MAX_LENGTH_M = 34;
// A big harbour has hundreds of slips. Filling all of them costs more than it
// adds, so the nearest few hundred metres of the exercise get the boats.
const MAX_MOORINGS = 130;

function isFingerFloat(dock: { id: string; size: [number, number]; kind?: string }) {
  if (FINGER_ID_PATTERN.test(dock.id)) {
    return true;
  }

  if (dock.kind === "breakwater") {
    return false;
  }

  const [width, length] = dock.size;
  return (
    width <= FINGER_MAX_WIDTH_M &&
    length >= FINGER_MIN_LENGTH_M &&
    length <= FINGER_MAX_LENGTH_M
  );
}

type Mooring = {
  id: string;
  position: [number, number];
  headingDeg: number;
  spec: SmallCraftSpec;
};

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function deriveMoorings(layout: MarinaLayout): Mooring[] {
  const moorings: Mooring[] = [];

  // Work outward from the berths so the slips you can actually see are the
  // ones that get filled when the cap bites.
  const focus = layout.berths[0]?.center ?? [0, 0];
  const candidates = sceneDocks(layout)
    .filter(isFingerFloat)
    .sort(
      (a, b) =>
        Math.hypot(a.position[0] - focus[0], a.position[1] - focus[1]) -
        Math.hypot(b.position[0] - focus[0], b.position[1] - focus[1]),
    );

  for (const dock of candidates) {
    if (moorings.length >= MAX_MOORINGS) {
      break;
    }

    const random = mulberry32(hashString(`${layout.id}:${dock.id}`));

    if (random() > OCCUPANCY) {
      continue;
    }

    const bearing = dock.rotationDeg ?? 0;
    const [fingerWidth, fingerLength] = dock.size;
    const lengthM = clamp(fingerLength * (0.72 + random() * 0.32), 6.5, 15.5);
    const beamM = clamp(lengthM * 0.31, 2.2, 4.4);

    // Each finger hosts one boat on its local +x side; adjacent fingers on the
    // same walkway side all offset the same way, so slips never double-book.
    const abeam = offset(
      dock.position,
      bearing + 90,
      fingerWidth * 0.5 + beamM * 0.5 + 0.45,
    );
    // Tuck toward the walkway root rather than overhanging the finger tip.
    const position = offset(abeam, bearing, -(fingerLength - lengthM) * 0.3);

    // Leave the practice targets and their guest slips clear.
    const nearBerth = layout.berths.some((berth) => {
      const dx = berth.center[0] - position[0];
      const dz = berth.center[1] - position[1];
      return Math.hypot(dx, dz) < (berth.lengthM + lengthM) * 0.55;
    });

    if (nearBerth) {
      continue;
    }

    const kind = random() < 0.42 ? "sail" : "power";

    moorings.push({
      id: dock.id,
      position,
      // Bow-in or backed-in, at the whim of the owner.
      headingDeg: bearing + (random() < 0.7 ? 0 : 180),
      spec: {
        kind,
        lengthM,
        beamM,
        hullColor:
          SMALL_CRAFT_HULL_COLORS[
            Math.floor(random() * SMALL_CRAFT_HULL_COLORS.length)
          ],
        accentColor:
          SMALL_CRAFT_ACCENT_COLORS[
            Math.floor(random() * SMALL_CRAFT_ACCENT_COLORS.length)
          ],
      },
    });
  }

  return moorings;
}

const MooredCraft = memo(function MooredCraft({ mooring, hits, onDamageSample }: { mooring: Mooring; hits: ImpactIncident[]; onDamageSample: TargetDamageSample }) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const vessel = smallCraftAsset(mooring.spec);
  return <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false}
    position={[mooring.position[0], 0, mooring.position[1]]} rotation={[0, mooring.headingDeg * Math.PI / 180, 0]}>
    <group userData={{ vessel, fracture: { key: `moored:${mooring.id}`, objectName: `moored:${mooring.id}`, width: mooring.spec.beamM, length: mooring.spec.lengthM, workJ: mooring.spec.beamM * mooring.spec.lengthM * 15_000, vessel } }}>
    <CuboidCollider sensor={hits.some((hit) => hit.fracture)} name={`moored:${mooring.id}`} args={[mooring.spec.beamM * 0.5, 0.8, mooring.spec.lengthM * 0.46]}
      position={[0, 0.45, 0]} friction={CONTACT_FRICTION} frictionCombineRule={CoefficientCombineRule.Min}
      restitution={CONTACT_RESTITUTION} restitutionCombineRule={CoefficientCombineRule.Min} />
    </group>
    <DamagedSmallCraft spec={mooring.spec} hits={hits} bodyRef={bodyRef} onDamageSample={onDamageSample} />
  </RigidBody>;
});

const NO_HITS: ImpactIncident[] = [];
export const MooredBoats = memo(function MooredBoats({ layout, incidents, onDamageSample }: { layout: MarinaLayout; incidents: ImpactIncident[]; onDamageSample: TargetDamageSample }) {
  const moorings = useMemo(() => deriveMoorings(layout), [layout]);
  const byObject = useMemo(() => {
    const map = new Map<string, ImpactIncident[]>();
    for (const hit of incidents) if (hit.surface === "moored") map.set(hit.objectName, [...(map.get(hit.objectName) ?? []), hit]);
    return map;
  }, [incidents]);
  return <>{moorings.map((mooring) => <MooredCraft key={mooring.id} mooring={mooring} hits={byObject.get(`moored:${mooring.id}`) ?? NO_HITS} onDamageSample={onDamageSample} />)}</>;
});
