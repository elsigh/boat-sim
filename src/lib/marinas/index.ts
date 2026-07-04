import { FRIDAY_HARBOR } from "./friday";
import {
  CYPRESS_EAGLE_HARBOR,
  JONES_NORTH_COVE,
  STUART_REID_HARBOR,
  SUCIA_FOSSIL_BAY,
} from "./parks";
import { ROCHE_HARBOR } from "./roche";
import { SQUALICUM_HARBOR } from "./squalicum";
import type { MarinaLayout, Vec2 } from "./types";

// Layout files are authored in real-world chart coordinates: +x east,
// +z north, bearings true. The render world is right-handed with +y up and
// +z north, which makes +x WEST on screen — so every layout is mirrored
// (x -> -x, angles -> -angle) here, once, at load. Physics, rendering, and
// guidance all consume the mirrored world-frame values.

function mirrorVec([x, z]: Vec2): Vec2 {
  return [-x, z];
}

function mirrorLayout(layout: MarinaLayout): MarinaLayout {
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
    berths: layout.berths.map((berth) => ({
      ...berth,
      center: mirrorVec(berth.center),
      headingDeg: -berth.headingDeg,
    })),
    spawns: layout.spawns.map((spawn) => ({
      ...spawn,
      position: mirrorVec(spawn.position),
      yawDeg: -spawn.yawDeg,
    })),
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

export const MARINA_LAYOUTS: MarinaLayout[] = [
  SQUALICUM_HARBOR,
  SUCIA_FOSSIL_BAY,
  STUART_REID_HARBOR,
  ROCHE_HARBOR,
  FRIDAY_HARBOR,
  JONES_NORTH_COVE,
  CYPRESS_EAGLE_HARBOR,
].map(mirrorLayout);

const layoutById = new Map(MARINA_LAYOUTS.map((layout) => [layout.id, layout]));

export function getMarinaLayout(sceneId: string | null | undefined): MarinaLayout {
  if (sceneId) {
    const layout = layoutById.get(sceneId);

    if (layout) {
      return layout;
    }
  }

  return MARINA_LAYOUTS[0];
}
