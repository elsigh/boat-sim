"""Turn cached NOAA DEM + OSM data into TypeScript chart modules.

Everything the simulator knows about the shape of the San Juans comes out of
this script:

  * `land`      closed shoreline rings (0 m contour), with holes
  * `contours`  depth contour polylines at chart-ish intervals
  * `soundings` spot depths, thinned to a readable density
  * `depth`     a coarse depth raster for shading + the depth sounder
  * `labels`    OSM place names for chart annotation
  * `structures` OSM piers / breakwaters / marina outlines

Run:  python3 scripts/charts/build_charts.py
"""

from __future__ import annotations

import base64
import json
import math
import os
import sys

import numpy as np
from skimage import measure
from shapely.geometry import Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import SCENES  # noqa: E402
from projection import meters_per_degree  # noqa: E402
from unflood import unflood  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated"))

# Depth contours in metres. Roughly the 6/12/18/30/60 ft chart ladder plus a
# couple of deep-water lines for context.
CONTOUR_LEVELS = [1.8, 3.6, 5.5, 9.1, 18.3, 36.6, 73.2]

LAND_SIMPLIFY_M = 3.0
CONTOUR_SIMPLIFY_M = 10.0
MIN_LAND_AREA_M2 = 60.0
MIN_CONTOUR_POINTS = 6


def load_dem(scene):
    return np.load(os.path.join(CACHE, f"{scene['id']}.npy"))


def load_osm(scene):
    path = os.path.join(CACHE, f"{scene['id']}.osm.json")
    if not os.path.exists(path):
        return {"elements": []}
    with open(path) as handle:
        return json.load(handle)


def make_rc_to_local(scene, shape):
    """Map DEM (row, col) -- possibly padded -- to scene-local metres."""
    rows, cols = shape
    half_w = scene["half_w_m"]
    half_h = scene["half_h_m"]

    def convert(rc, pad=0):
        row, col = rc
        u = (col - pad) / (cols - 1 - 2 * pad)
        v = (row - pad) / (rows - 1 - 2 * pad)
        return (-half_w + u * 2 * half_w, half_h - v * 2 * half_h)

    return convert


def ring_area(points):
    total = 0.0
    for i in range(len(points)):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return abs(total) * 0.5


def simplify_ring(points, tolerance, closed=True):
    if len(points) < 4:
        return points
    try:
        geom = Polygon(points) if closed else None
        if geom is not None and geom.is_valid:
            simplified = geom.simplify(tolerance, preserve_topology=True)
            if simplified.is_empty:
                return points
            if simplified.geom_type == "Polygon":
                return [(float(x), float(y)) for x, y in simplified.exterior.coords][:-1]
    except Exception:  # noqa: BLE001
        pass
    return douglas_peucker(points, tolerance)


def douglas_peucker(points, tolerance):
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    worst_index, worst = 0, 0.0
    for index in range(1, len(points) - 1):
        distance = point_line_distance(points[index], start, end)
        if distance > worst:
            worst_index, worst = index, distance
    if worst <= tolerance:
        return [start, end]
    left = douglas_peucker(points[: worst_index + 1], tolerance)
    right = douglas_peucker(points[worst_index:], tolerance)
    return left[:-1] + right


def point_line_distance(point, start, end):
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / length


def build_land(scene, dem):
    """Closed shoreline rings from the 0 m contour, tagged with nesting depth."""
    pad = 2
    padded = np.pad(np.nan_to_num(dem, nan=-50.0), pad, constant_values=-50.0)
    convert = make_rc_to_local(scene, padded.shape)
    contours = measure.find_contours(padded, 0.0)

    rings = []
    for contour in contours:
        points = [convert((r, c), pad) for r, c in contour]
        if len(points) < 4:
            continue
        if ring_area(points) < MIN_LAND_AREA_M2:
            continue
        simplified = simplify_ring(points, LAND_SIMPLIFY_M)
        if len(simplified) < 4:
            continue
        polygon = Polygon(simplified)
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
            if polygon.is_empty or polygon.geom_type != "Polygon":
                continue
            simplified = [(float(x), float(y)) for x, y in polygon.exterior.coords][:-1]
            polygon = Polygon(simplified)
        rings.append({"points": simplified, "polygon": polygon, "area": polygon.area})

    rings.sort(key=lambda ring: ring["area"], reverse=True)

    # Nesting depth: even = land, odd = a hole (inland pond / lagoon).
    for index, ring in enumerate(rings):
        depth = 0
        centroid = ring["polygon"].representative_point()
        for other in rings[:index]:
            if other["polygon"].contains(centroid):
                depth += 1
        ring["hole"] = depth % 2 == 1

    return [
        {
            "points": [[round(x), round(y)] for x, y in ring["points"]],
            "hole": ring["hole"],
            "areaM2": round(ring["area"], 1),
        }
        for ring in rings
    ]


def build_contours(scene, dem):
    convert = make_rc_to_local(scene, dem.shape)
    filled = np.nan_to_num(dem, nan=0.0)
    out = []

    for level in CONTOUR_LEVELS:
        lines = []
        for contour in measure.find_contours(filled, -level):
            if len(contour) < MIN_CONTOUR_POINTS:
                continue
            points = [convert((r, c)) for r, c in contour]
            closed = math.dist(points[0], points[-1]) < 1.0
            simplified = (
                simplify_ring(points, CONTOUR_SIMPLIFY_M)
                if closed
                else douglas_peucker(points, CONTOUR_SIMPLIFY_M)
            )
            if len(simplified) < 3:
                continue
            # drop specks
            span = max(
                max(p[0] for p in simplified) - min(p[0] for p in simplified),
                max(p[1] for p in simplified) - min(p[1] for p in simplified),
            )
            if span < 45:
                continue
            lines.append([[round(x), round(y)] for x, y in simplified])
        if lines:
            out.append({"depthM": round(level, 1), "lines": lines})
    return out


def build_depth_grid(scene, dem):
    """Coarse depth raster, decimetres, positive down. Land is negative."""
    cols = scene["grid"]
    rows = int(round(cols * scene["half_h_m"] / scene["half_w_m"]))
    source = np.nan_to_num(dem, nan=0.0)

    row_edges = np.linspace(0, source.shape[0], rows + 1).astype(int)
    col_edges = np.linspace(0, source.shape[1], cols + 1).astype(int)
    coarse = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        r0, r1 = row_edges[r], max(row_edges[r] + 1, row_edges[r + 1])
        block = source[r0:r1]
        for c in range(cols):
            c0, c1 = col_edges[c], max(col_edges[c] + 1, col_edges[c + 1])
            coarse[r, c] = block[:, c0:c1].mean()

    depth_dm = np.clip(np.round(-coarse * 10.0), -32000, 32000).astype("<i2")
    data = base64.b64encode(depth_dm.tobytes()).decode("ascii")
    return {
        "cols": cols,
        "rows": rows,
        "cellXM": round(2 * scene["half_w_m"] / cols, 3),
        "cellZM": round(2 * scene["half_h_m"] / rows, 3),
        "data": data,
    }


def build_soundings(scene, dem, max_count=90):
    """Spot depths on a jittered grid, chart-style, in metres."""
    convert = make_rc_to_local(scene, dem.shape)
    rows, cols = dem.shape
    step_r = max(1, rows // 14)
    step_c = max(1, cols // 14)
    rng = np.random.default_rng(7)
    picks = []

    for r in range(step_r // 2, rows, step_r):
        for c in range(step_c // 2, cols, step_c):
            rr = int(np.clip(r + rng.integers(-step_r // 4, step_r // 4 + 1), 0, rows - 1))
            cc = int(np.clip(c + rng.integers(-step_c // 4, step_c // 4 + 1), 0, cols - 1))
            value = dem[rr, cc]
            if not np.isfinite(value) or value >= -0.5:
                continue
            depth = float(-value)
            if depth > 120:
                continue
            x, z = convert((rr, cc))
            picks.append([round(x), round(z), round(depth, 1)])

    rng.shuffle(picks)
    return picks[:max_count]


def osm_to_local(scene, lat, lon):
    m_lat, m_lon = meters_per_degree(scene["origin"]["lat"])
    return (
        (lon - scene["origin"]["lon"]) * m_lon,
        (lat - scene["origin"]["lat"]) * m_lat,
    )


def inside(scene, x, z, margin=1.05):
    return abs(x) <= scene["half_w_m"] * margin and abs(z) <= scene["half_h_m"] * margin


def snap_labels(scene, dem, labels):
    """Put island names on land and bay names on water.

    OSM label nodes and relation centroids are placed for cartography, not for
    us: "Gossip Island" lands in the channel next to the islet, and a bay's
    centroid can end up on the beach. Nudge each label to the nearest cell of
    the right kind, and drop it if there isn't one within 250 m.
    """
    rows, cols = dem.shape
    filled = np.nan_to_num(dem, nan=0.0)
    metres_per_row = 2 * scene["half_h_m"] / rows
    metres_per_col = 2 * scene["half_w_m"] / cols
    reach_r = max(1, int(250 / metres_per_row))
    reach_c = max(1, int(250 / metres_per_col))

    out = []

    for label in labels:
        kind = label["kind"]

        if kind in {"island", "islet"}:
            wants_land = True
        elif kind in {"bay", "strait"}:
            wants_land = False
        else:
            out.append(label)
            continue

        col = int(round((label["x"] + scene["half_w_m"]) / (2 * scene["half_w_m"]) * (cols - 1)))
        row = int(round((scene["half_h_m"] - label["z"]) / (2 * scene["half_h_m"]) * (rows - 1)))
        col = int(np.clip(col, 0, cols - 1))
        row = int(np.clip(row, 0, rows - 1))

        def ok(r, c):
            value = filled[r, c]
            return value > 0.3 if wants_land else value < -1.0

        if ok(row, col):
            out.append(label)
            continue

        best = None
        best_distance = None

        for dr in range(-reach_r, reach_r + 1, max(1, reach_r // 18)):
            for dc in range(-reach_c, reach_c + 1, max(1, reach_c // 18)):
                r, c = row + dr, col + dc
                if not (0 <= r < rows and 0 <= c < cols) or not ok(r, c):
                    continue
                distance = (dr * metres_per_row) ** 2 + (dc * metres_per_col) ** 2
                if best_distance is None or distance < best_distance:
                    best_distance, best = distance, (r, c)

        if best is None:
            continue

        r, c = best
        out.append(
            {
                **label,
                "x": round(-scene["half_w_m"] + c / (cols - 1) * 2 * scene["half_w_m"]),
                "z": round(scene["half_h_m"] - r / (rows - 1) * 2 * scene["half_h_m"]),
            }
        )

    # OSM often carries both "Gossip Island" and "Gossip Islands" for the same
    # rocks; after snapping they land on top of each other. Keep the first.
    spread = []
    for label in out:
        if any(
            math.dist((label["x"], label["z"]), (kept["x"], kept["z"])) < 110
            for kept in spread
        ):
            continue
        spread.append(label)

    return spread


def build_osm_layers(scene):
    data = load_osm(scene)
    labels = []
    structures = []

    for element in data.get("elements", []):
        tags = element.get("tags", {}) or {}
        name = tags.get("name")

        if element["type"] == "node" or "center" in element:
            point = element.get("center", element)
            x, z = osm_to_local(scene, point["lat"], point["lon"])
            if not name or not inside(scene, x, z):
                continue
            kind = tags.get("place") or tags.get("natural") or tags.get("seamark:type")
            labels.append(
                {"name": name, "x": round(x, 1), "z": round(z, 1), "kind": kind or "place"}
            )
            continue

        geometry = element.get("geometry")
        if not geometry:
            continue
        points = [osm_to_local(scene, node["lat"], node["lon"]) for node in geometry]
        points = [(round(x, 1), round(z, 1)) for x, z in points]
        if not any(inside(scene, x, z) for x, z in points):
            continue

        man_made = tags.get("man_made")
        leisure = tags.get("leisure")
        if man_made in {"pier", "breakwater", "groyne"} or leisure == "marina":
            structures.append(
                {
                    "id": f"osm-{element['id']}",
                    "kind": leisure or man_made,
                    "name": name,
                    "floating": tags.get("floating") == "yes",
                    "points": [[x, z] for x, z in points],
                }
            )
        elif name and (tags.get("place") in {"island", "islet"} or tags.get("natural") in {"bay", "reef"}):
            cx = sum(p[0] for p in points) / len(points)
            cz = sum(p[1] for p in points) / len(points)
            if inside(scene, cx, cz):
                labels.append(
                    {
                        "name": name,
                        "x": round(cx, 1),
                        "z": round(cz, 1),
                        "kind": tags.get("place") or tags.get("natural"),
                    }
                )

    # de-duplicate labels by name, keeping the first
    seen = set()
    unique = []
    for label in labels:
        if label["name"] in seen:
            continue
        seen.add(label["name"])
        unique.append(label)

    return unique, structures


def emit_ts(scene, chart):
    os.makedirs(OUT_DIR, exist_ok=True)
    var = scene["id"].replace("-", "_").upper() + "_CHART"
    path = os.path.join(OUT_DIR, f"{scene['id']}.ts")
    body = json.dumps(chart, separators=(",", ":"))
    with open(path, "w") as handle:
        handle.write("// GENERATED FILE — do not edit by hand.\n")
        handle.write("// Source: NOAA NCEI DEM_all mosaic + OpenStreetMap (ODbL).\n")
        handle.write("// Regenerate with: python3 scripts/charts/build_charts.py\n\n")
        handle.write('import type { ChartData } from "../types";\n\n')
        handle.write(f"export const {var}: ChartData = {body} as ChartData;\n")
    return path, var


def main():
    print("Building charts")
    index_entries = []

    for scene in SCENES:
        dem = load_dem(scene)
        dem, corrected = unflood(scene, dem)

        if corrected:
            print(f"  unflooded {scene['id']}: {corrected} cells returned to water")

        labels, structures = build_osm_layers(scene)
        labels = snap_labels(scene, dem, labels)
        chart = {
            "id": scene["id"],
            "name": scene["name"],
            "origin": scene["origin"],
            "halfWidthM": scene["half_w_m"],
            "halfHeightM": scene["half_h_m"],
            "land": build_land(scene, dem),
            "contours": build_contours(scene, dem),
            "soundings": build_soundings(scene, dem),
            "depth": build_depth_grid(scene, dem),
            "labels": labels,
            "structures": structures,
        }
        path, var = emit_ts(scene, chart)
        size = os.path.getsize(path)
        index_entries.append((scene["id"], var, os.path.basename(path)))
        print(
            f"  {scene['id']:<24} land={len(chart['land']):>3} "
            f"contours={sum(len(c['lines']) for c in chart['contours']):>4} "
            f"labels={len(labels):>3} structures={len(structures):>3} "
            f"{size // 1024:>4} KiB"
        )

    index_path = os.path.join(OUT_DIR, "index.ts")
    with open(index_path, "w") as handle:
        handle.write("// GENERATED FILE — do not edit by hand.\n")
        handle.write("// Regenerate with: python3 scripts/charts/build_charts.py\n\n")
        for scene_id, var, filename in index_entries:
            handle.write(f'import {{ {var} }} from "./{filename[:-3]}";\n')
        handle.write('\nimport type { ChartData } from "../types";\n\n')
        handle.write("export const CHARTS: Record<string, ChartData> = {\n")
        for scene_id, var, _ in index_entries:
            handle.write(f'  "{scene_id}": {var},\n')
        handle.write("};\n")
    print(f"  wrote {index_path}")


if __name__ == "__main__":
    main()
