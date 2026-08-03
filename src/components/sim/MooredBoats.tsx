"use client";

import {
  CoefficientCombineRule,
  CuboidCollider,
  RigidBody,
} from "@react-three/rapier";
import { useMemo } from "react";

import { offset } from "@/lib/marinas/builders";
import type { MarinaLayout } from "@/lib/marinas/types";

import {
  SMALL_CRAFT_ACCENT_COLORS,
  SMALL_CRAFT_HULL_COLORS,
  SmallCraft,
  type SmallCraftSpec,
} from "./SmallCraft";

const CONTACT_FRICTION = 0.05;
const CONTACT_RESTITUTION = 0.05;
// Every slip full would make the exercises impossible to read; roughly two
// thirds occupancy looks like an August marina with the transient dock open.
const OCCUPANCY = 0.66;
const FINGER_ID_PATTERN = /-finger-(left|right)-\d+$/;

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

  for (const dock of layout.docks) {
    if (!FINGER_ID_PATTERN.test(dock.id)) {
      continue;
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

export function MooredBoats({ layout }: { layout: MarinaLayout }) {
  const moorings = useMemo(() => deriveMoorings(layout), [layout]);

  return (
    <>
      {moorings.map((mooring) => (
        <RigidBody
          key={`moored-${mooring.id}`}
          type="fixed"
          colliders={false}
          position={[mooring.position[0], 0, mooring.position[1]]}
          rotation={[0, (mooring.headingDeg * Math.PI) / 180, 0]}
        >
          <CuboidCollider
            name={`moored:${mooring.id}`}
            args={[mooring.spec.beamM * 0.5, 0.8, mooring.spec.lengthM * 0.46]}
            position={[0, 0.45, 0]}
            friction={CONTACT_FRICTION}
            frictionCombineRule={CoefficientCombineRule.Min}
            restitution={CONTACT_RESTITUTION}
            restitutionCombineRule={CoefficientCombineRule.Min}
          />
          <SmallCraft spec={mooring.spec} />
        </RigidBody>
      ))}
    </>
  );
}
