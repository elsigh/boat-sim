# boat-sim

Twin-screw docking practice in real San Juan Islands marinas.

![Plan view of the simulator approaching a marina](docs/images/boat-sim.png)

## Why this exists

At the end of August 2026 I'm supposed to captain *Bonum Vitae* — a Grand
Banks 52 Heritage Motoryacht, about 58,000 pounds of her — through the San
Juan Islands with family and friends aboard. I trained on similar boats about
five years ago, but five years is enough time for confidence to turn back
into theory, especially when the theory involves easing 29 tons into a narrow
slip while a Pacific Northwest tidal current negotiates a different
arrangement.

So I did what any reasonably anxious programmer might do: I built a
simulator.

This was never meant to be a general boating game. It's rehearsal. The cruise
runs Bellingham → Sucia → Stuart → Roche Harbor → Friday Harbor → Jones →
Cypress → Bellingham, and the moments that occupied my mind were never the
open-water legs — they were the slow minutes at either end: backing out of a
side-tie, entering an unfamiliar basin, judging leftover momentum, making
three small corrections before one big one becomes necessary.

A twin-screw motoryacht doesn't steer like a car at those speeds. Port engine
ahead swings the bow to starboard. A handed propeller in reverse walks the
stern sideways. The bow thruster shoves the bow, not the boat. And when the
levers come back to neutral, 58,000 pounds does not come back to neutral with
them. That inertia — not which lever, but *how early* and *how long* — is the
thing this simulator exists to practice.

## The helm

![Thrustmaster TCA throttle quadrant](docs/images/thrustmaster.png)

My first instinct was maximal fidelity: buy the real thing, a Glendinning
CH2001 twin-lever control head — the hardware that wouldn't feel like a game
controller because it isn't one. That idea did not survive contact with the
integration details. Real marine control heads cost upward of $1,500 and
speak CAN bus / J1939, not USB. Wiring one into a browser would have meant
gutting a precision piece of boat equipment and rebuilding its electronics —
at which point the project had drifted from "practice docking" to "learn
embedded electronics by modifying safety-critical marine hardware." I was
over my skis. The point was to reduce anxiety, not manufacture a new
category of it.

Plan B was gloriously plausible: a $200 mechanical dual-lever marine
throttle, housing cracked open, 10k potentiometers on the lever pivots, and
a zero-solder Leo Bodnar USB board to present it all as a standard game
controller. I still like that plan. It is also its own hardware project, and
I wanted to know whether the simulator was useful before fabricating a helm
for it.

For a while the helm was a Thrustmaster TWCS — a single flight-sim slider
pressed into twin-screw service by mapping its one axis as a split throttle:
mid-travel is dead neutral, above it drives the port engine ahead, below it
the starboard engine astern. A ridiculous compromise (you can't command most
port/starboard combinations), but it proved the sim out, and that
split-slider mode still lives in the input layer.

Where it landed: a Thrustmaster TCA throttle quadrant. Designed for an Airbus,
but it has the two things that matter — two independent physical levers, and
a browser can read it through the Gamepad API with zero drivers. The sim
handles the
airplane-to-boat mismatch: swap-levers for reversed axes, idle-detent
calibration so lever travel above the detent means ahead and below means
astern, and the quadrant's switches double as engine masters and ignition.

No hardware? Keyboard works: `W`/`S` port throttle, `I`/`K` starboard,
`A`/`D` bow thruster. (Use Chrome for the quadrant — Safari never exposes
it.)

## What's in the sim

- **Physics that punish impatience** — per-engine thrust with prop walk,
  bow thruster at the bow, wind and current per marina, quadratic hull drag,
  and honest inertia. Telemetry shows SOG, heading, drift, and yaw rate.
- **Seven real anchorages** from the actual cruise plan, built on survey data
  rather than sketches: Squalicum, Sucia (Fossil Bay), Reid Harbor, Roche
  Harbor, Friday Harbor, Jones Island, and Eagle Harbor. The shoreline is the
  NOAA DEM's zero contour, the depths under the keel are that same survey, and
  the docks at Squalicum, Roche and Friday are OpenStreetMap's mapping of the
  actual floats, finger by finger. See *Charts*, below.
- **Arrivals you'd actually make** — every harbour has a *passage* exercise
  that starts where the real approach starts. Reid Harbor's begins in Spieden
  Channel, two and a half miles out: round the west end of Spieden, north past
  Gull Reef, then west between Gossip Island and the Stuart shore into the
  harbour. Shorter *approach* variants drop you just outside for repetition.
- **A helm that belongs to the boat** — the whole HUD re-skins per vessel.
  *Bonum Vitae* gets varnished teak, brass bezels and the digital tachometers
  she actually has; the Nordhavns get brushed steel and cool white backlight;
  the Chris-Craft gets mahogany, chrome and analogue needles on cream dials.
  One theme file, no per-boat branching in the components.
- **Consequences** — hit something hard enough and the hull takes damage:
  scuff, minor, major, severe, judged by closing speed at the point of
  contact. Gelcoat cracks stay on the hull; splintered timber stays on the
  dock. Restarting the exercise repairs everything, which is cheaper than
  the real arrangement.
- **A lived-in marina** — finger slips are two-thirds full of moored boats,
  the occasional small craft runs the fairway in or out, and the VHF panel
  murmurs synthesized harbor chatter if you leave it monitoring.
- **Guidance that respects land** — the wayline is a live shortest-water-path
  (A* over a per-marina navigation grid) from wherever you are to the berth,
  replanned as you drift. It goes around docks, pilings, and moored boats,
  never through them.
- **Turbo mode** — press `T` at full throttle. It is not seamanship.

## Charts

The geography isn't drawn by hand. `scripts/charts/` pulls it from public
survey data and bakes it into TypeScript that the sim loads offline:

| Source | What it gives us |
| --- | --- |
| NOAA NCEI `DEM_all` mosaic (1/9 arc-second where available, ~3.4 m) | shoreline, depth raster, contour ladder, spot soundings |
| OpenStreetMap (ODbL) | piers, floats, breakwaters, marina outlines, place names |

Each scene declares an origin and a window in `scripts/charts/scenes.py`; the
build marching-squares the DEM at 0 m for the coastline, at 6/12/18/30/60/120/240 ft
for the contours, resamples a coarse depth raster for the sounder and the
plotter shading, and writes one module per scene into
`src/lib/charts/generated/` (about 900 KB in total).

```bash
python3 scripts/charts/fetch_dem.py           # NOAA tiles -> scripts/charts/cache/
python3 scripts/charts/fetch_osm.py           # Overpass  -> scripts/charts/cache/
python3 scripts/charts/build_charts.py        # -> src/lib/charts/generated/
python3 scripts/charts/build_region.py        # the regional basemap
python3 scripts/charts/verify.py              # PNG previews of what got built

python3 scripts/charts/check_georef.py        # is the DEM where it claims to be?
python3 scripts/charts/check_region_align.py  # does the basemap line up?
python3 scripts/charts/verify_scenes.py       # is every berth still in water?
```

Run the three checks after any change to the pipeline. They exist because of a
bug that hid in plain sight for a long time: ArcGIS lays exported pixels out in
the image spatial reference, and ours is EPSG:4326 — degrees. Sizing the export
from metres asked for an aspect ratio the bounding box didn't have, and the
service quietly widened the box instead of refusing, so every chart came back
squashed north-south by a third. Mt Constitution landed 1.1 km from where it
lives, and several berths ended up on the beach. `check_georef.py` catches it by
sampling the DEM at OSM coastline nodes, which should read zero: it searches a
grid of offsets and the best fit has to be (0, 0).

### The regional basemap

Each scene is a ~2.5 km window, which is the right resolution for judging a slip
but means the plotter runs out of world the moment you drag offshore — you end
up shoving a still image around inside a grey void. So `build_region.py` bakes
one coarse 68 x 44 km chart of the whole archipelago, Bellingham Bay to Haro
Strait, that the plotter draws *underneath* the harbour chart. It's 270 KB, has
no docks or soundings and only two contour levels; it exists to give the eye
somewhere to go. Zoom out past about 2 km and the harbour's own place names give
way to the islands and channels.

The two charts are separate local grids about different origins, so region
metres are not scene metres. Both are equirectangular, so the conversion is a
plain affine — `regionTransform` in `src/lib/charts/region.ts`, applied as one
SVG transform rather than by rewriting every coordinate. The scale factors are
within 0.3% of 1, but they are not 1, and over 30 km that difference is about
90 m.

Chart colours are not a styling choice. Every plotter draws from the IHO S-52
presentation library, which defines the permitted colour tables in day, dusk
and night variants — that's why a Garmin looks like a paper chart. The palettes
live in `src/lib/charts/palette.ts`, independent of the boat's helm theme, and
the ☀/☾ button on the plotter switches between them. Depth bands are keyed to
the boat's own safe depth (draft plus a metre), so a Grand Banks and a bowrider
see different charts of the same harbour.

### Going further: real ENC data

The shoreline here is a DEM contour, which is honest but coarse. The real thing
is **NOAA ENC** — free, official, weekly-updated S-57 vector charts, and the
source data commercial cartography is derived from. GDAL reads it natively:

```bash
ogr2ogr -f GeoJSON depare.json US5WA__M.000 DEPARE
```

The object classes worth having: `DEPARE` (depth areas, with `DRVAL1`/`DRVAL2`
— exact vector depth bands, no raster needed), `DEPCNT`, `SOUNDG`, `LNDARE`,
`COALNE`, `SLCONS` and `PONTON` (shoreline constructions and floats),
`BOYLAT`/`BCNLAT`/`LIGHTS`, `WRECKS`, `UWTROC`, `OBSTRN`, `ACHARE`, `RESARE`.
That would replace both the marching-squares coastline and the depth raster,
and add buoys, lights and charted rocks that the DEM simply doesn't know about.

Three tools earn their keep when placing a berth or an exercise:
`scan.py <scene> <x> <z> <span>` prints an ASCII depth map of a region,
`probe.py <scene> x,z ...` reports charted depth at points, and
`route.py <scene> x0,z0 x1,z1 [minDepth]` runs A* over the depth raster to
check that a passage is actually navigable.

One wrinkle worth knowing about: NOAA's mosaic uses a lidar *surface* model in
developed harbours, so Squalicum's covered moorage came back as dry land
several metres above the water. `unflood.py` recovers it — rasterise the OSM
coastline as a barrier, flood-fill from the deepest cell in the window, and
return to water only the cells the fill reached that also sit within 72 m of a
mapped float. That last condition is what stops a leak in the barrier from
flooding a hillside.

## Importing where you actually went

The plotter can overlay a Google Maps Timeline export — the path the phone in
your pocket recorded — as a dashed orange track next to the planned magenta
route. Open the full-screen plotter, hit **Track**, drop in `Timeline.json`,
pick a date range. Nothing leaves the browser: the file is read with the File
API and parsed in a web worker.

Google has shipped at least four shapes of this file, so
`src/lib/tracks/google-timeline.ts` doesn't pattern-match a schema — it walks
the whole JSON tree and extracts anything that looks like a coordinate with a
time attached. That handles:

| Export | Where the points hide |
| --- | --- |
| Modern on-device, Android | `semanticSegments[].timelinePath[]`, coordinates as strings like `"48.6680°, -123.1859°"` |
| Modern on-device, iOS | often a bare top-level array, `"geo:48.668,-123.186"`, and `durationMinutesOffsetFromStartTime` instead of an absolute time |
| Legacy Takeout `Records.json` | `locations[]` with `latitudeE7` / `longitudeE7` / `timestampMs` |
| Legacy Semantic Location History | `timelineObjects[].activitySegment`, with the span nested in `duration` and waypoints using `latE7` / `lngE7` |

Points are dropped if they have no usable timestamp, sit at exactly 0,0 (the
"no fix" sentinel), or report accuracy worse than a kilometre — the panel tells
you how many. Timestamps in these files carry their own UTC offset, so the
instant is exact; the date pickers are in your computer's local timezone.

Because each scene's chart is a window around one harbour, a track spanning the
whole cruise will run past the edge of the survey. That's allowed: **Fit track**
frames the whole thing and the parts with no chart under them draw over the grey
no-data area. Panning or fitting detaches the view from the boat; **⌖ Boat**
puts it back.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a marina and an exercise, `START ENGINES`,
and try to dock without appearing in the incident log. `H` hides the panels.

The Electron desktop build (`npm run app:dev` / `npm run app:build`) wraps the
static export for offline use aboard.

## Stack

Next.js (App Router) · React Three Fiber + drei · Rapier physics · WebAudio
for engine and radio sound · TypeScript.

- `src/lib/charts/` — generated survey data plus the helpers that sample it
  (`chartDepthMeters`, `getWorldChart`, the render-world mirror).
- `src/lib/marinas/` — what a chart can't tell you: berths, exercises, wind,
  local knowledge. Everything is in chart-frame metres about the scene origin.
- `src/lib/boats/helm-theme.ts` — what each boat's helm is made of, emitted as
  `--helm-*` custom properties.
- `src/components/sim/helm/` — the themed instruments: panels, tachometers,
  compass, flow dials, and the chart plotter.
- `src/lib/sim/boat-physics.ts` — the force model. `collision-damage.ts` for
  consequences, `water-nav.ts` for the guidance A*, `bathymetry.ts` for depth.

A note on frames, because it has bitten every agent that's worked on this:
layouts and charts are authored **east-positive**, the render world is
**west-positive** (right-handed, +y up, +z north), and the flip happens once at
load in `src/lib/marinas/index.ts`. The plotter converts back so that north-up
really does put east on the right.

Built with heavy assistance from coding agents, which turned out to be a
fitting crew: they also needed to be told, repeatedly, which way the bow
swings when the port engine goes ahead.
