// A recorded track: where the boat (or the phone in your pocket) actually
// went, as opposed to a planned route. Positions are WGS84 like everything
// else that crosses the chart boundary — the plotter projects them into
// chart-frame metres itself.
//
// Note the field is `lon`, not `lng`, to match `chartToGeo` / `geoToChart`
// and the rest of src/lib/charts.

export type TrackPoint = {
  lat: number;
  lon: number;
  /** Epoch milliseconds, UTC. */
  t: number;
  /** Reported horizontal accuracy, where the source gives one. */
  accuracyM?: number;
};

export type TrackSource = "google-timeline";

export type ImportedTrack = {
  id: string;
  name: string;
  source: TrackSource;
  /** Chronological, de-duplicated, simplified for drawing. */
  points: TrackPoint[];
  startMs: number;
  endMs: number;
  /** Great-circle length along the track, metres. */
  distanceM: number;
};

/** What the parser found before any date filtering is applied. */
export type ParsedTimeline = {
  points: TrackPoint[];
  /** Which shapes in the file the points came from, for the status line. */
  shapes: string[];
  /** Points seen but rejected — bad coordinates, missing time, wild accuracy. */
  skipped: number;
};
