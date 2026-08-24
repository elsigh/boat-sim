import { FRIDAY_HARBOR } from "./friday";
import {
  CYPRESS_EAGLE_HARBOR,
  JONES_NORTH_COVE,
  STUART_REID_HARBOR,
  SUCIA_FOSSIL_BAY,
} from "./parks";
import { ROCHE_HARBOR } from "./roche";
import { SQUALICUM_HARBOR } from "./squalicum";
import {
  findSeededMarinaLayout,
  seededMarinaLayouts,
} from "@/lib/autonoma/store";

import type { Berth, MarinaLayout, SpawnPoint, Vec2 } from "./types";

// Layout files are authored in real-world chart coordinates: +x east,
// +z north, bearings true. The render world is right-handed with +y up and
// +z north, which makes +x WEST on screen — so every layout is mirrored
// (x -> -x, angles -> -angle) here, once, at load. Physics, rendering, and
// guidance all consume the mirrored world-frame values.

export function mirrorVec([x, z]: Vec2): Vec2 {
  return [-x, z];
}

export function mirrorBerth(berth: Berth): Berth {
  return { ...berth, center: mirrorVec(berth.center), headingDeg: -berth.headingDeg };
}

export function mirrorSpawn(spawn: SpawnPoint): SpawnPoint {
  return { ...spawn, position: mirrorVec(spawn.position), yawDeg: -spawn.yawDeg };
}

export function mirrorLayout(layout: MarinaLayout): MarinaLayout {
  return {
    ...layout,
    land: layout.land.map((land) => ({
      ...land,
      position: mirrorVec(land.position),
      rotationDeg: -(land.rotationDeg ?? 0),
    })),
    trees: layout.trees?.map((cluster) => ({
      ...cluster,
      center: mirrorVec(cluster.center),
    })),
    docks: layout.docks.map((dock) => ({
      ...dock,
      position: mirrorVec(dock.position),
      rotationDeg: -(dock.rotationDeg ?? 0),
    })),
    pilings: layout.pilings.map((run) => ({
      ...run,
      from: mirrorVec(run.from),
      to: mirrorVec(run.to),
    })),
    berths: layout.berths.map(mirrorBerth),
    spawns: layout.spawns.map(mirrorSpawn),
    buoys: layout.buoys?.map(mirrorVec),
    conditions: {
      ...layout.conditions,
      windTowardDeg: -layout.conditions.windTowardDeg,
      currentTowardDeg: -layout.conditions.currentTowardDeg,
    },
    approachLines: layout.approachLines
      ? Object.fromEntries(
          Object.entries(layout.approachLines).map(([berthId, points]) => [
            berthId,
            points.map(mirrorVec),
          ]),
        )
      : undefined,
  };
}

// The layouts as authored, before mirroring — the frame new layouts are
// built in so they can go through the same mirror on the way out.
const CHART_FRAME_LAYOUTS: MarinaLayout[] = [
  SQUALICUM_HARBOR,
  SUCIA_FOSSIL_BAY,
  STUART_REID_HARBOR,
  ROCHE_HARBOR,
  FRIDAY_HARBOR,
  JONES_NORTH_COVE,
  CYPRESS_EAGLE_HARBOR,
];

export const MARINA_LAYOUTS: MarinaLayout[] = CHART_FRAME_LAYOUTS.map(mirrorLayout);

const layoutById = new Map(MARINA_LAYOUTS.map((layout) => [layout.id, layout]));

export function getMarinaLayout(sceneId: string | null | undefined): MarinaLayout {
  if (sceneId) {
    const layout = layoutById.get(sceneId) ?? findSeededMarinaLayout(sceneId);

    if (layout) {
      return layout;
    }
  }

  return MARINA_LAYOUTS[0];
}

/** Every layout the app can load: the shipped ones plus any seeded ones. */
export function listMarinaLayouts(): MarinaLayout[] {
  return [...MARINA_LAYOUTS, ...seededMarinaLayouts()];
}

/** Fields that identify a harbour, before its berths and spawns are added. */
export type MarinaLayoutInput = {
  id: string;
  name: string;
  vhfChannel?: string;
  briefing?: string[];
  /** Layout whose land, docks, pilings and conditions are reused. */
  templateId?: string;
};

/**
 * Builds a layout in the world frame from the fields that name a harbour,
 * borrowing its structures from an existing layout. The structural geometry is
 * hundreds of authored coordinates; a layout without it has nothing to dock
 * against, so a template supplies it and only the identity, briefing and
 * (later) berths and spawns are new.
 *
 * The result goes through `mirrorLayout` exactly like `MARINA_LAYOUTS` does, so
 * the coordinates it holds are in the same render frame as every other layout.
 */
export function buildMarinaLayout(input: MarinaLayoutInput): MarinaLayout {
  const template =
    CHART_FRAME_LAYOUTS.find((layout) => layout.id === (input.templateId ?? "friday-harbor-marina")) ??
    CHART_FRAME_LAYOUTS[0];

  return mirrorLayout({
    ...template,
    id: input.id,
    name: input.name,
    vhfChannel: input.vhfChannel ?? template.vhfChannel,
    briefing: input.briefing ?? template.briefing,
    berths: [],
    spawns: [],
    approachLines: undefined,
  });
}

/**
 * Maps a berth into a layout the same way `mirrorLayout` does when a layout is
 * loaded: the berth is authored in chart coordinates and mirrored on the way in.
 * Mutates the layout in place, which is how a layout gains its berths.
 */
export function addMarinaBerth(layout: MarinaLayout, berth: Berth): Berth {
  const mirrored = mirrorBerth(berth);

  layout.berths.push(mirrored);

  return mirrored;
}

/** The spawn-point half of `addMarinaBerth`. */
export function addMarinaSpawn(layout: MarinaLayout, spawn: SpawnPoint): SpawnPoint {
  const mirrored = mirrorSpawn(spawn);

  layout.spawns.push(mirrored);

  return mirrored;
}

/** Drops a berth (and any spawn that pointed at it) back out of a layout. */
export function removeMarinaBerth(layout: MarinaLayout, berthId: string) {
  layout.berths = layout.berths.filter((berth) => berth.id !== berthId);
}

export function removeMarinaSpawn(layout: MarinaLayout, spawnId: string) {
  layout.spawns = layout.spawns.filter((spawn) => spawn.id !== spawnId);
}

/**
 * The chart-frame (unmirrored) source layout behind a template id, for callers
 * that need to borrow authored geometry — berth positions, spawn positions —
 * before it goes through `mirrorLayout`.
 */
export function chartFrameLayout(templateId?: string): MarinaLayout {
  return (
    CHART_FRAME_LAYOUTS.find((layout) => layout.id === (templateId ?? "friday-harbor-marina")) ??
    CHART_FRAME_LAYOUTS[0]
  );
}
