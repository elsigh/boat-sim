# Routes: interchange with a real chartplotter

Today the sim's "route" is a bearing line from the boat to a berth. A real
route is an ordered list of waypoints with legs between them, bent around reefs
and kelp and the corner of Gossip Island, each leg carrying its own planned
speed and cross-track limit. This is the design for closing that gap, and for
making the result something you can carry to and from the GPSMAP on the boat.

The useful discovery up front: **Garmin's own GPX dialect already distinguishes
via points from shaping points**, which is exactly the structure we need. We
don't have to invent an interchange — we have to stop under-using the one that
exists.

---

## 1. The canonical model

Routes are stored in **WGS84 lat/lon**, not chart-frame metres. That's the only
form that round-trips losslessly to a plotter, and `geoToChart` /`chartToGeo`
in `src/lib/charts` already project it for rendering and physics.

```ts
/** A point on a route. The distinction matters — see §2. */
type RoutePoint = {
  id: string;
  /** Garmin-safe: ASCII, <= 16 chars, unique within the file. */
  name: string;
  lat: number;
  lon: number;
  /**
   * "via"     — a real waypoint. Announced on arrival, appears in the
   *             plotter's waypoint list, survives as a <wpt> in GPX.
   * "shaping" — a bend in the line. Keeps you off the reef, but the plotter
   *             doesn't call it out and it isn't in the waypoint list.
   */
  role: "via" | "shaping";
  /** Garmin symbol vocabulary: "Anchor", "Shallow Water", "Waypoint", … */
  symbol?: string;
  arrivalRadiusM?: number;
  notes?: string;
};

type RouteLeg = {
  fromId: string;
  toId: string;
  bearingTrueDeg: number;
  distanceNm: number;
  plannedSpeedKn?: number;
  /** Alarm limit. Maps to N2K PGN 130069. */
  xteLimitM?: number;
  navigationMethod?: "greatCircle" | "rhumbLine";
  /** Derived by sampling the chart raster along the leg. */
  minChartedDepthM?: number;
  warnings?: RouteWarning[];
};

type Route = {
  id: string;
  name: string;
  description?: string;
  points: RoutePoint[];
  /** Derived, never authored. */
  legs: RouteLeg[];
  source: "authored" | "autoGuidance" | "imported";
  /** What the guidance was solved for, if it was solved. */
  guidance?: {
    safeDepthM: number;
    safeHeightM: number;
    shorelineDistance: "near" | "normal" | "far";
    boatDraftM: number;
  };
  /** gpxx:DisplayColor. Magenta is the traditional route colour. */
  colour?: string;
};
```

Legs are always derived from points — there is no way to author a leg that
doesn't connect two points, which removes a whole family of bugs.

## 2. Via points vs shaping points

This is the crux of "real routing is multi-point with turns."

| | Via point | Shaping point |
| --- | --- | --- |
| Purpose | somewhere you meant to go | somewhere you have to bend |
| Plotter announces arrival | yes | no |
| In the waypoint list | yes | no |
| GPX element | `<rtept>` (+ a matching `<wpt>`) | `<gpxx:rpt>` inside `RoutePointExtension`, *or* another `<rtept>` |
| Example | "Reid Harbor float" | the three turns that keep you off Gull Reef |

Reid Harbor's arrival is one via point ("REID FLOAT") reached through five or
six shaping points. That's the shape the plotter UI, the exporter, and the
guidance solver should all speak.

## 3. GPX — the file that actually moves

GPX 1.1 plus `http://www.garmin.com/xmlschemas/GpxExtensions/v3`. This is what
a Garmin marine unit writes to an SD card and reads back from one.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="boat-sim"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">
  <metadata><time>2026-08-16T16:30:00Z</time></metadata>

  <wpt lat="48.66780" lon="-123.18615">
    <name>REID FLOAT</name>
    <sym>Anchor</sym>
    <extensions>
      <gpxx:WaypointExtension>
        <gpxx:DisplayMode>SymbolAndName</gpxx:DisplayMode>
      </gpxx:WaypointExtension>
    </extensions>
  </wpt>

  <rte>
    <name>SPIEDEN TO REID</name>
    <extensions>
      <gpxx:RouteExtension>
        <gpxx:IsAutoNamed>false</gpxx:IsAutoNamed>
        <gpxx:DisplayColor>Magenta</gpxx:DisplayColor>
      </gpxx:RouteExtension>
    </extensions>

    <rtept lat="48.63690" lon="-123.15776">
      <name>SPIEDEN W</name>
      <sym>Waypoint</sym>
      <extensions>
        <gpxx:RoutePointExtension>
          <gpxx:rpt lat="48.64650" lon="-123.17040"/>
          <gpxx:rpt lat="48.65420" lon="-123.17800"/>
        </gpxx:RoutePointExtension>
      </extensions>
    </rtept>

    <rtept lat="48.66020" lon="-123.18120">
      <name>REID ENT</name><sym>Waypoint</sym>
    </rtept>

    <rtept lat="48.66780" lon="-123.18615">
      <name>REID FLOAT</name><sym>Anchor</sym>
    </rtept>
  </rte>
</gpx>
```

### Getting it onto the boat

Put the file on a microSD card, then on the plotter:
**Info ▸ User Data ▸ Data Transfer ▸ Merge from Card** (or *Replace from Card*
to wipe and reload). Pulling the other way is **Save to Card**, which writes
waypoints, routes, tracks, boundaries and saved Auto Guidance paths.

### Gotchas the exporter has to handle

- **Garmin merges waypoints by name.** Two different `REID FLOAT`s in two files
  become one waypoint in the wrong place. Namespace them, or make the exporter
  refuse duplicates.
- **Name length.** Keep to 16 ASCII characters. Some units truncate silently,
  which is worse than an error.
- **Point count.** Marine units run to roughly 250 points on a direct route;
  autorouting modes drop to about 50. Our simplifier should target well under
  that — 20–40 points is a comfortable, readable route.
- **`Subclass` in `RoutePointExtension`.** Garmin generates these from its own
  proprietary routing database, and emitting `rpt` points without one can
  confuse newer firmware that expects the Trip Planner extension. Safest
  default for marine work: **write every turn as a plain `<rtept>`** and treat
  `gpxx:rpt` as an opt-in flag for tools like BaseCamp/HomePort. A marine
  plotter follows a many-`rtept` route verbatim; it only recomputes if you ask
  it to Auto Guidance.
- **No `Subclass`, no `gpxx:Extensions`.** Round-trip what we understand and
  drop what we don't, rather than echoing opaque blobs back at the device.

## 4. Live protocols, if the sim ever talks to the boat

GPX is the file. These are the wires. None are needed for v1, but the model
above has the fields they'd demand, which is the point of listing them.

| Protocol | What it carries | Effort |
| --- | --- | --- |
| **NMEA 0183** over TCP/UDP | `$--RTE` (route, split across sentences), `$--WPL` (waypoint positions), and for the active leg `$--RMB`, `$--BOD`, `$--XTE`, `$--APB` | low — plain text, and OpenCPN will happily consume it |
| **Signal K** `resources/routes`, `resources/waypoints` | REST/WS CRUD over a documented JSON schema; the Course API drives the active leg | low–medium, and the most pleasant of the three |
| **NMEA 2000** PGNs 130064–130074 | the real route/waypoint service Garmin uses on the bus: 130066 list attributes, 130067 route WP name & position, 130069 per-leg XTE limit & nav method, 130074 waypoint list | high — needs an Actisense or Yacht Devices gateway |
| **ActiveCaptain** Wi-Fi sync | proprietary, no public API | don't |

`xteLimitM` and `navigationMethod` on `RouteLeg` exist because 130069 carries
them per leg. Modelling them now costs nothing and means the N2K door stays
open.

## 5. Auto Guidance, ours

`scripts/charts/route.py` already does the hard part — A* over the charted
depth raster with a penalty for hugging the shoal line. Porting it to
TypeScript gives the sim its own Auto Guidance with the same knobs Garmin
exposes:

- **Safe depth** — boat draft plus an under-keel margin. Cells shallower than
  this are impassable.
- **Shoreline distance** (near / normal / far) — the weight on the existing
  clearance penalty. This is the setting that decides whether you cut the
  corner at Gossip Island or give it a berth.
- **Safe height** — no overhead obstructions in the current chart data, so it's
  a stub, but the field belongs in the model.

Pipeline: A* → Douglas–Peucker simplify to a cross-track tolerance → emit
shaping points → check each turn against the boat's turn radius at the planned
speed and insert a wider bend where a 52-footer at 8 knots can't make it.

## 6. Route validation — the part that teaches something

Once a route is a real object with legs, the chart can grade it:

- sample `chartDepthMeters` along every leg and record `minChartedDepthM`
- flag legs where charted depth minus draft is under the safety margin
- flag turns tighter than the boat can hold at the planned speed
- flag legs that pass within *n* metres of a charted rock or reef label
- total distance, time at planned speed, ETA per waypoint

Which makes the feature worth having in a training sim rather than a plotter
emulator: **export the real cruise plan from the GPSMAP, drop the GPX on the
sim, and have it tell you which leg clips the two-fathom line — then go drive
it.**

## 7. Plotter UI

- Route drawn as a polyline; via points as labelled circles, shaping points as
  small unlabelled bends.
- Active leg highlighted; the rest dimmed.
- Next-waypoint block: BRG, DTG, TTG, VMG, XTE.
- A CDI-style cross-track bar with the leg's own `xteLimitM` as full scale.
- Arrival circle around the active via point, and turn anticipation showing
  where the next alteration begins.
- A "route check" ribbon listing the three legs with the least water under the
  keel — the validation output, surfaced where you'd look at it.

## 8. Suggested build order

1. `src/lib/routes/types.ts` + leg derivation and the geo↔chart projection.
2. Draw a real multi-point route on the plotter, replacing the bearing line.
3. `gpx.ts` — import first. Getting a real GPX off the boat and onto the screen
   is the highest-value single step, and it validates the model against
   reality rather than against our assumptions.
4. Validation pass and the route-check ribbon.
5. `autoguidance.ts` — port of `route.py`.
6. GPX export, with the `rtept`-only default and the `gpxx:rpt` opt-in.
7. Optional: NMEA 0183 out, then Signal K.

---

### Sources

- [Garmin GPX Extensions v3 schema](http://www.tic2.org/Ignacio/GPS/Practica/UsoAvanzado/Varios/GpxExtensionsv3.htm)
- [GPSBabel — turning RoutePointExtension into regular points](https://github.com/gpsbabel/gpsbabel/issues/59)
- [Garmin — copying user data to a memory card](https://www8.garmin.com/manuals/webhelp/gpsmap_touch/EN-US/GUID-488A5C92-C8EB-4E80-A0DC-A13D20572C3D.html)
- [Garmin — copying user data from a memory card](https://www8.garmin.com/manuals/webhelp/gpsmap_touch/EN-US/GUID-72BBFEE8-763D-4C57-9FFF-792F40B377C5.html)
- [Garmin — Auto Guidance path configurations](https://www8.garmin.com/manuals/webhelp/gpsmap8400-8600/EN-US/GUID-EEDBF6E5-E20B-4124-8240-CCE6AEF1A441.html)
- [Garmin — maximum waypoints and shaping points in a route](https://support.garmin.com/en-US/?faq=7S1IiE1e7H4Iw1svGjJlb6)
- [Garmin GPSMAP — NMEA 2000 PGN information](https://www8.garmin.com/manuals/webhelp/gpsmap8400-8600/EN-US/GUID-0C4B3FAB-3E41-438C-B31E-9B5489790913.html)
- [Yacht Devices — WPL/RTE route transfer over NMEA 2000](https://www.yachtd.com/news/wpl_rte_update.html)
- [Signal K Resources API](https://demo.signalk.org/documentation/develop/rest-api/resources_api.html)
