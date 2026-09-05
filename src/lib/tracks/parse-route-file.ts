import { parseGoogleTimeline } from "./google-timeline";
import { routeMetadata, validateRouteArchive, type SavedRoute } from "./saved-routes";
import type { ParsedTimeline } from "./types";

export function parseRouteFile(text: string, snapshot: boolean): { result: ParsedTimeline; savedRoute?: SavedRoute } {
  if (!snapshot) return { result: parseGoogleTimeline(text) };
  const archive = validateRouteArchive(JSON.parse(text));
  return {
    result: { points: archive.points, skipped: 0, shapes: ["Saved route"] },
    savedRoute: routeMetadata(archive),
  };
}
