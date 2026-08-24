import type { ParsedTimeline, TrackPoint } from "./types";

/**
 * Parsing Google Maps Timeline exports.
 *
 * Google has shipped at least four shapes of this file and keeps changing it,
 * so this parser does not pattern-match a schema. It walks the whole JSON tree
 * and pulls out anything that looks like a coordinate with a time attached.
 * That costs a little speed and buys immunity to the next rename.
 *
 * The shapes seen in the wild:
 *
 * 1. Modern on-device export, Android — `Timeline.json` from
 *    Settings ▸ Location ▸ Timeline ▸ Export. Top level object with
 *    `semanticSegments`, `rawSignals`, `userLocationProfile`. Coordinates are
 *    *strings*: `"48.6680°, -123.1859°"`. Segments carry `timelinePath`
 *    (a list of `{ point, time }`), `visit.topCandidate.placeLocation.latLng`
 *    or `activity.start.latLng` / `activity.end.latLng`.
 *
 * 2. Modern on-device export, iOS — same idea, but the top level is often a
 *    bare array of segments, coordinates may be `"geo:48.668,-123.186"`, and
 *    `timelinePath` entries carry `durationMinutesOffsetFromStartTime`
 *    instead of an absolute `time`. Hence the inherited start-time context
 *    below.
 *
 * 3. Legacy Takeout `Records.json` / `Location History.json` — a `locations`
 *    array of `{ latitudeE7, longitudeE7, timestampMs | timestamp, accuracy }`.
 *    E7 means the value is degrees × 10^7 as an integer.
 *
 * 4. Legacy Takeout Semantic Location History — monthly files with
 *    `timelineObjects[].activitySegment` / `.placeVisit`, containing
 *    `startLocation` / `endLocation` / `waypointPath.waypoints` (which use
 *    `latE7` / `lngE7`) and `simplifiedRawPath.points`.
 *
 * Everything ends up as `{ lat, lon, t }` with `t` in epoch milliseconds UTC.
 * ISO strings in these files carry their own offset, so `Date.parse` gets the
 * instant right without us guessing a timezone.
 */

/** Coordinates at exactly 0,0 are the classic "no fix" sentinel, not the Gulf of Guinea. */
const NULL_ISLAND_EPS = 1e-6;
/** Anything vaguer than this is a cell-tower guess, not a position. */
const MAX_ACCURACY_M = 1000;
/** Guard against a pathological file eating all the memory. */
const MAX_POINTS = 500_000;

type Walk = {
  points: TrackPoint[];
  shapes: Set<string>;
  skipped: number;
};

/** Inherited from ancestor nodes so offset-based child points can resolve. */
type TimeContext = {
  startMs?: number;
  endMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coordinate strings come in several flavours:
 *   "48.6680°, -123.1859°"   modern Android
 *   "geo:48.6680,-123.1859"  modern iOS
 *   "48.6680, -123.1859"     plain
 */
function parseLatLngString(value: string): [number, number] | null {
  const cleaned = value.replace(/^geo:/i, "").replace(/°/g, "");
  const parts = cleaned.split(",");

  if (parts.length !== 2) {
    return null;
  }

  const lat = Number.parseFloat(parts[0].trim());
  const lon = Number.parseFloat(parts[1].trim());

  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function validCoordinate(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return false;
  }

  return Math.abs(lat) > NULL_ISLAND_EPS || Math.abs(lon) > NULL_ISLAND_EPS;
}

/** Pull a coordinate out of a node, whatever dialect it speaks. */
function readCoordinate(node: Record<string, unknown>): [number, number] | null {
  for (const key of ["latLng", "LatLng", "latlng", "point", "geo"]) {
    const value = node[key];

    if (typeof value === "string") {
      const parsed = parseLatLngString(value);

      if (parsed) {
        return parsed;
      }
    }
  }

  // E7 integers, in both the spellings Google has used.
  const e7Pairs: Array<[string, string]> = [
    ["latitudeE7", "longitudeE7"],
    ["latE7", "lngE7"],
  ];

  for (const [latKey, lonKey] of e7Pairs) {
    const lat = node[latKey];
    const lon = node[lonKey];

    if (typeof lat === "number" && typeof lon === "number") {
      return [lat / 1e7, lon / 1e7];
    }
  }

  const plainPairs: Array<[string, string]> = [
    ["latitude", "longitude"],
    ["lat", "lng"],
    ["lat", "lon"],
  ];

  for (const [latKey, lonKey] of plainPairs) {
    const lat = node[latKey];
    const lon = node[lonKey];

    if (typeof lat === "number" && typeof lon === "number") {
      return [lat, lon];
    }
  }

  return null;
}

function readEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Ten digits is seconds, thirteen is milliseconds.
    return value < 1e11 ? value * 1000 : value;
  }

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric < 1e11 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** A timestamp on this node, if it has one. */
function readTime(node: Record<string, unknown>, context: TimeContext): number | undefined {
  for (const key of ["time", "timestamp", "timestampMs", "startTime", "startTimestamp"]) {
    const found = readEpochMs(node[key]);

    if (found !== undefined) {
      return found;
    }
  }

  // iOS timelinePath entries are offsets from the enclosing segment's start.
  const offset = node.durationMinutesOffsetFromStartTime;
  const offsetMinutes =
    typeof offset === "number" ? offset : typeof offset === "string" ? Number(offset) : NaN;

  if (Number.isFinite(offsetMinutes) && context.startMs !== undefined) {
    return context.startMs + offsetMinutes * 60_000;
  }

  // A segment that only declares a span: put the point in the middle of it,
  // which is the best claim we can make about a visit or an activity endpoint.
  if (context.startMs !== undefined) {
    return context.endMs !== undefined
      ? (context.startMs + context.endMs) / 2
      : context.startMs;
  }

  return undefined;
}

function readAccuracy(node: Record<string, unknown>): number | undefined {
  for (const key of ["accuracyMeters", "accuracy", "horizontalAccuracy"]) {
    const value = node[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

/** Label the file's shape for the status line, purely informational. */
function noteShape(node: Record<string, unknown>, walk: Walk) {
  for (const key of [
    "semanticSegments",
    "rawSignals",
    "timelineObjects",
    "locations",
    "timelinePath",
    "simplifiedRawPath",
  ]) {
    if (key in node) {
      walk.shapes.add(key);
    }
  }
}

function visit(node: unknown, context: TimeContext, walk: Walk) {
  if (walk.points.length >= MAX_POINTS) {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      visit(child, context, walk);
    }

    return;
  }

  if (!isRecord(node)) {
    return;
  }

  noteShape(node, walk);

  // A node that declares its own span becomes the context for its children.
  // Legacy Takeout hides the span one level down, in `duration`.
  const duration = isRecord(node.duration) ? node.duration : undefined;
  const nextContext: TimeContext = {
    startMs:
      readEpochMs(node.startTime) ??
      readEpochMs(node.startTimestamp) ??
      (duration ? readEpochMs(duration.startTimestamp) : undefined) ??
      context.startMs,
    endMs:
      readEpochMs(node.endTime) ??
      readEpochMs(node.endTimestamp) ??
      (duration ? readEpochMs(duration.endTimestamp) : undefined) ??
      context.endMs,
  };

  const coordinate = readCoordinate(node);

  if (coordinate) {
    const [lat, lon] = coordinate;
    const t = readTime(node, nextContext);
    const accuracyM = readAccuracy(node);

    if (!validCoordinate(lat, lon) || t === undefined) {
      walk.skipped += 1;
    } else if (accuracyM !== undefined && accuracyM > MAX_ACCURACY_M) {
      walk.skipped += 1;
    } else {
      walk.points.push({ lat, lon, t, accuracyM });
    }
  }

  for (const value of Object.values(node)) {
    if (typeof value === "object" && value !== null) {
      visit(value, nextContext, walk);
    }
  }
}

/**
 * Extract every timestamped position in a Timeline export.
 * Throws only if the text isn't JSON at all — an empty result is a result.
 */
export function parseGoogleTimeline(text: string): ParsedTimeline {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    throw new Error("That file is empty.");
  }

  let root: unknown;

  try {
    root = JSON.parse(trimmed);
  } catch {
    throw new Error("That file isn't valid JSON. Export it again from Google Maps?");
  }

  const walk: Walk = { points: [], shapes: new Set(), skipped: 0 };
  visit(root, {}, walk);

  walk.points.sort((a, b) => a.t - b.t);

  // The tree walk can see the same coordinate twice — an activity's end point
  // is often the next visit's location.
  const deduped: TrackPoint[] = [];

  for (const point of walk.points) {
    const previous = deduped[deduped.length - 1];

    if (
      previous &&
      previous.t === point.t &&
      Math.abs(previous.lat - point.lat) < 1e-7 &&
      Math.abs(previous.lon - point.lon) < 1e-7
    ) {
      continue;
    }

    deduped.push(point);
  }

  return { points: deduped, shapes: [...walk.shapes], skipped: walk.skipped };
}

// --- post-processing ---------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: TrackPoint, b: TrackPoint) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trackDistanceMeters(points: TrackPoint[]) {
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }

  return total;
}

/**
 * Douglas–Peucker on the raw fixes. A day of Timeline is tens of thousands of
 * points, most of them sitting still at anchor; the shape survives a 6 m
 * tolerance and the plotter stops re-drawing a novel every frame.
 */
export function simplifyTrack(points: TrackPoint[], toleranceM = 6): TrackPoint[] {
  if (points.length < 3) {
    return points;
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  // Local metres-per-degree is close enough over one export.
  const midLat = (points[0].lat * Math.PI) / 180;
  const mPerLat = 111_132;
  const mPerLon = 111_320 * Math.cos(midLat);

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;

    if (last <= first + 1) {
      continue;
    }

    const ax = points[first].lon * mPerLon;
    const ay = points[first].lat * mPerLat;
    const bx = points[last].lon * mPerLon;
    const by = points[last].lat * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);

    let worst = -1;
    let worstIndex = first;

    for (let i = first + 1; i < last; i += 1) {
      const px = points[i].lon * mPerLon;
      const py = points[i].lat * mPerLat;
      const distance =
        length < 1e-9
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;

      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }

    if (worst > toleranceM) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}
