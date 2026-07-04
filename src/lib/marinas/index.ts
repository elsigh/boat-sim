import { FRIDAY_HARBOR } from "./friday";
import {
  CYPRESS_EAGLE_HARBOR,
  JONES_NORTH_COVE,
  STUART_REID_HARBOR,
  SUCIA_FOSSIL_BAY,
} from "./parks";
import { ROCHE_HARBOR } from "./roche";
import { SQUALICUM_HARBOR } from "./squalicum";
import type { MarinaLayout } from "./types";

export const MARINA_LAYOUTS: MarinaLayout[] = [
  SQUALICUM_HARBOR,
  SUCIA_FOSSIL_BAY,
  STUART_REID_HARBOR,
  ROCHE_HARBOR,
  FRIDAY_HARBOR,
  JONES_NORTH_COVE,
  CYPRESS_EAGLE_HARBOR,
];

const layoutById = new Map(MARINA_LAYOUTS.map((layout) => [layout.id, layout]));

export function getMarinaLayout(sceneId: string | null | undefined): MarinaLayout {
  if (sceneId) {
    const layout = layoutById.get(sceneId);

    if (layout) {
      return layout;
    }
  }

  return SQUALICUM_HARBOR;
}
