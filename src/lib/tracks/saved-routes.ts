import type { TrackPoint } from "./types";

export const MAX_ROUTE_FILE_BYTES = 200 * 1024 * 1024;
export const ROUTE_PREFIX = "saved-routes/v2/";

export type RouteFilters = {
  /** UTC instants. Null means unbounded. Both bounds are inclusive. */
  fromMs: number | null;
  toMs: number | null;
  visible: boolean;
};
export type RouteEntry = { id: string; name: string; updatedAt: string };
export type SavedRoute = RouteEntry & {
  version: 2;
  sourceFileName: string;
  pointCount: number;
  filters: RouteFilters;
};
export type RouteArchive = SavedRoute & { format: "boatsim-route"; points: TrackPoint[] };

export function routeName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a route name.");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 80 || /[\/\\\u0000-\u001f\u007f]/u.test(name) || name === "." || name === "..") {
    throw new Error("Use a name of 1–80 characters without slashes.");
  }
  return name;
}

// Encoding is reversible: distinct names never collapse into the same slug.
export function routePath(name: unknown): string {
  return `${ROUTE_PREFIX}${encodeURIComponent(routeName(name))}.json`;
}

export function nameFromRoutePath(path: string): string {
  if (!path.startsWith(ROUTE_PREFIX) || !path.endsWith(".json")) throw new Error("Invalid route path.");
  const name = routeName(decodeURIComponent(path.slice(ROUTE_PREFIX.length, -5)));
  if (routePath(name) !== path) throw new Error("Invalid route path.");
  return name;
}

function validateFilters(filters: RouteFilters): RouteFilters {
  const validTime = (time: unknown) => time === null ||
    (typeof time === "number" && Number.isSafeInteger(time) && Math.abs(time) <= 8.64e15);
  if (!filters || !validTime(filters.fromMs) || !validTime(filters.toMs) ||
      typeof filters.visible !== "boolean" ||
      (filters.fromMs !== null && filters.toMs !== null && filters.fromMs > filters.toMs)) {
    throw new Error("Check the selected date range.");
  }
  return { fromMs: filters.fromMs, toMs: filters.toMs, visible: filters.visible };
}

/** Input is chronological. Keep original fixes, including both date bounds. */
export function pointRange(points: TrackPoint[], fromMs?: number | null, toMs?: number | null) {
  const bound = (time: number, inclusive: boolean) => {
    let low = 0, high = points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (points[middle].t < time || (inclusive && points[middle].t === time)) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const first = bound(fromMs ?? -Infinity, false);
  return { first, last: Math.max(first, bound(toMs ?? Infinity, true)) };
}

export function routeMetadata(archive: RouteArchive): SavedRoute {
  const { version, id, name, sourceFileName, pointCount, filters, updatedAt } = archive;
  return { version, id, name, sourceFileName, pointCount, filters, updatedAt };
}

export function createRouteArchive(input: {
  name: string; sourceFileName: string; points: TrackPoint[]; filters: RouteFilters;
}): RouteArchive {
  const name = routeName(input.name);
  const filters = validateFilters(input.filters);
  const { first, last } = pointRange(input.points, filters.fromMs, filters.toMs);
  const points = input.points.slice(first, last);
  return validateRouteArchive({
    format: "boatsim-route", version: 2, id: name, name,
    sourceFileName: input.sourceFileName, pointCount: points.length,
    filters, updatedAt: new Date().toISOString(), points,
  });
}

export function validateRouteArchive(value: unknown): RouteArchive {
  if (!value || typeof value !== "object") throw new Error("Invalid saved route.");
  const route = value as RouteArchive;
  const name = routeName(route.name);
  const filters = validateFilters(route.filters);
  if (route.format !== "boatsim-route" || route.version !== 2 || route.id !== name ||
      typeof route.sourceFileName !== "string" || route.sourceFileName.length > 255 ||
      typeof route.updatedAt !== "string" || !Number.isFinite(Date.parse(route.updatedAt)) ||
      !Array.isArray(route.points) || route.points.length < 1 || route.points.length > 500_000 ||
      route.pointCount !== route.points.length) throw new Error("Invalid or empty saved route.");
  let previous = -Infinity;
  const points = route.points.map((point) => {
    if (!point || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 ||
        !Number.isFinite(point.lon) || Math.abs(point.lon) > 180 ||
        !Number.isSafeInteger(point.t) || Math.abs(point.t) > 8.64e15 || point.t < previous ||
        point.t < (filters.fromMs ?? -Infinity) || point.t > (filters.toMs ?? Infinity) ||
        (point.accuracyM !== undefined && (!Number.isFinite(point.accuracyM) || point.accuracyM < 0))) {
      throw new Error("Invalid saved route points.");
    }
    previous = point.t;
    return { lat: point.lat, lon: point.lon, t: point.t,
      ...(point.accuracyM === undefined ? {} : { accuracyM: point.accuracyM }) };
  });
  // Strip unrelated source data and unknown fields from the stored snapshot.
  return { format: "boatsim-route", version: 2, id: name, name,
    sourceFileName: route.sourceFileName, pointCount: points.length,
    filters, updatedAt: route.updatedAt, points };
}

export function localInputToMs(value: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}

export function msToLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultDateRange(points: TrackPoint[]) {
  return {
    from: points.length ? msToLocalInput(points[0].t) : "",
    // Include the final fix even if it contains seconds beyond the picker minute.
    to: points.length ? msToLocalInput(Math.ceil(points[points.length - 1].t / 60_000) * 60_000) : "",
  };
}
