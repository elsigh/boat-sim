import { BOAT_CATALOG, DEFAULT_BOAT_SLUG } from "@/lib/boats/catalog";
import { SAN_JUAN_AUG_2026_SCENARIO } from "@/lib/scenarios/san-juan-aug-2026";

export const DEFAULT_STOP_ID = "roche-harbor-marina";
const SESSION_SELECTION_KEY = "boat-sim:selection:v1";

export type SessionSelection = { boatSlug: string; stopId: string };

/** Read after mount, before constructing the scene and its initial boat pose. */
export function readSessionSelection(boatFromUrl: string | null): SessionSelection {
  let saved: Partial<SessionSelection> = {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_SELECTION_KEY) ?? "null");
    if (parsed && typeof parsed === "object") saved = parsed;
  } catch {
    // Missing, malformed, or unavailable storage should still open the simulator.
  }

  const boat = BOAT_CATALOG.find((entry) => entry.profileSlug === boatFromUrl)
    ?? BOAT_CATALOG.find((entry) => entry.profileSlug === saved.boatSlug);
  const stop = SAN_JUAN_AUG_2026_SCENARIO.stops.find((entry) => entry.id === saved.stopId);
  return { boatSlug: boat?.profileSlug ?? DEFAULT_BOAT_SLUG, stopId: stop?.id ?? DEFAULT_STOP_ID };
}

export function saveSessionSelection(selection: SessionSelection) {
  try {
    window.sessionStorage.setItem(SESSION_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // Keep the current choices usable when browser storage is unavailable.
  }
}
