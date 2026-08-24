"""Build the regional basemap: the whole San Juans in one coarse chart.

Each harbour scene is a ~2.5 km window, which is the right resolution for
judging a slip but means the plotter runs out of world the moment you drag
offshore. This builds one 68 x 44 km chart covering the entire cruise —
Bellingham Bay to Haro Strait, Sucia down to Lopez — that the plotter draws
*underneath* the harbour chart. Same NOAA source, same S-52 rendering, just
simplified hard enough to stay about a megabyte.

It deliberately does not live in `scenes.py`: it is not a playable scene, it
has no berths or docks, and an Overpass query over a window this size would
time out. Structures come from the harbour charts, which sit on top of it.

Run:  python3 scripts/charts/build_region.py
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
import tifffile
from skimage import measure
from shapely.geometry import Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from projection import meters_per_degree  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated"))

SERVICE = (
    "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/"
    "ImageServer/exportImage"
)

# Centred between Orcas and San Juan, wide enough to hold every scene in the
# cruise plan with open water to spare on all four sides.
REGION = {
    "id": "san-juans-region",
    "name": "San Juan Islands",
    "origin": {"lat": 48.6500, "lon": -122.8600},
    "half_w_m": 34000,
    "half_h_m": 22000,
}

# ~28 m per pixel. Finer than this buys detail the simplifier throws away.
DEM_PIXELS_W = 2400

# Coarser than the harbour charts by an order of magnitude — at 20 km across,
# a 40 m wiggle in the shoreline is a third of a pixel.
LAND_SIMPLIFY_M = 40.0
CONTOUR_SIMPLIFY_M = 120.0
# Anything smaller than this is a rock that the harbour chart will draw
# properly if you ever get near it.
MIN_LAND_AREA_M2 = 6_000.0
MIN_CONTOUR_POINTS = 8
MIN_CONTOUR_SPAN_M = 900.0

# Two lines only: the shoal edge you care about, and one deep-water line for
# the shape of the channels. More than that is mush at this scale.
CONTOUR_LEVELS = [18.3, 91.4]

# Depth raster for the water shading. 340 x 220 cells ~ 200 m each.
GRID_COLS = 340


def region_bbox():
    lat0 = REGION["origin"]["lat"]
    lon0 = REGION["origin"]["lon"]
    m_lat, m_lon = meters_per_degree(lat0)
    dlat = REGION["half_h_m"] / m_lat
    dlon = REGION["half_w_m"] / m_lon
    return (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat)


def fetch_dem(force=False):
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"{REGION['id']}.npy")

    if os.path.exists(out) and not force:
        print(f"  cached  {REGION['id']}")
        return np.load(out)

    west, south, east, north = region_bbox()
    # Degree aspect, not metre aspect — see the note in fetch_dem.request_size.
    # Getting this wrong silently shifts every feature by a kilometre.
    aspect = (north - south) / (east - west)
    size = f"{DEM_PIXELS_W},{int(round(DEM_PIXELS_W * aspect))}"

    params = {
        "bbox": f"{west},{south},{east},{north}",
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": size,
        "format": "tiff",
        "pixelType": "F32",
        "noData": "-3.4028235e38",
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
    }
    url = SERVICE + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "boat-sim-chart-build/1.0"})

    print(f"  fetching {size} px from NOAA…")
    with urllib.request.urlopen(request, timeout=300) as response:
        raw = response.read()

    dem = tifffile.imread(io.BytesIO(raw)).astype("float32")
    dem[~np.isfinite(dem)] = 0.0
    dem[dem < -1e30] = 0.0
    np.save(out, dem)
    print(f"  saved {dem.shape[1]}x{dem.shape[0]} -> {out}")
    return dem


def rc_to_local(shape, pad=0):
    rows, cols = shape
    half_w = REGION["half_w_m"]
    half_h = REGION["half_h_m"]

    def convert(rc):
        row, col = rc
        u = (col - pad) / (cols - 1 - 2 * pad)
        v = (row - pad) / (rows - 1 - 2 * pad)
        return (-half_w + u * 2 * half_w, half_h - v * 2 * half_h)

    return convert


def douglas_peucker(points, tolerance):
    if len(points) < 3:
        return points

    # Iterative: a 68 km coastline blows the recursion limit.
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue

        worst_index, worst = start, 0.0
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)

        for index in range(start + 1, end):
            px, py = points[index]
            distance = (
                math.hypot(px - ax, py - ay)
                if length == 0
                else abs(dy * px - dx * py + bx * ay - by * ax) / length
            )
            if distance > worst:
                worst_index, worst = index, distance

        if worst > tolerance:
            keep[worst_index] = True
            stack.append((start, worst_index))
            stack.append((worst_index, end))

    return [point for point, kept in zip(points, keep) if kept]


def simplify_ring(points, tolerance):
    if len(points) < 4:
        return points
    try:
        polygon = Polygon(points)
        if polygon.is_valid:
            simplified = polygon.simplify(tolerance, preserve_topology=True)
            if not simplified.is_empty and simplified.geom_type == "Polygon":
                return [(float(x), float(y)) for x, y in simplified.exterior.coords][:-1]
    except Exception:  # noqa: BLE001
        pass
    return douglas_peucker(points, tolerance)


def ring_area(points):
    total = 0.0
    for index in range(len(points)):
        x0, y0 = points[index]
        x1, y1 = points[(index + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return abs(total) * 0.5


def build_land(dem):
    pad = 2
    padded = np.pad(dem, pad, constant_values=-50.0)
    convert = rc_to_local(padded.shape, pad)

    rings = []
    for contour in measure.find_contours(padded, 0.0):
        points = [convert((r, c)) for r, c in contour]
        if len(points) < 4 or ring_area(points) < MIN_LAND_AREA_M2:
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
        if polygon.area < MIN_LAND_AREA_M2:
            continue
        rings.append({"points": simplified, "polygon": polygon, "area": polygon.area})

    rings.sort(key=lambda ring: ring["area"], reverse=True)

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


def build_contours(dem):
    convert = rc_to_local(dem.shape)
    out = []

    for level in CONTOUR_LEVELS:
        lines = []
        for contour in measure.find_contours(dem, -level):
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
            span = max(
                max(p[0] for p in simplified) - min(p[0] for p in simplified),
                max(p[1] for p in simplified) - min(p[1] for p in simplified),
            )
            if span < MIN_CONTOUR_SPAN_M:
                continue
            lines.append([[round(x), round(y)] for x, y in simplified])
        if lines:
            out.append({"depthM": round(level, 1), "lines": lines})
    return out


def build_depth_grid(dem):
    cols = GRID_COLS
    rows = int(round(cols * REGION["half_h_m"] / REGION["half_w_m"]))

    row_edges = np.linspace(0, dem.shape[0], rows + 1).astype(int)
    col_edges = np.linspace(0, dem.shape[1], cols + 1).astype(int)
    coarse = np.zeros((rows, cols), dtype=np.float32)

    for r in range(rows):
        r0, r1 = row_edges[r], max(row_edges[r] + 1, row_edges[r + 1])
        block = dem[r0:r1]
        for c in range(cols):
            c0, c1 = col_edges[c], max(col_edges[c] + 1, col_edges[c + 1])
            coarse[r, c] = block[:, c0:c1].mean()

    depth_dm = np.clip(np.round(-coarse * 10.0), -32000, 32000).astype("<i2")
    return {
        "cols": cols,
        "rows": rows,
        "cellXM": round(2 * REGION["half_w_m"] / cols, 3),
        "cellZM": round(2 * REGION["half_h_m"] / rows, 3),
        "data": base64.b64encode(depth_dm.tobytes()).decode("ascii"),
    }


# Island and channel names worth having at 20 km out. Centroids come from OSM
# relations, not from typing coordinates off a map — I tried that first and
# half of them landed in the wrong channel. Regenerate with the Overpass query
# in the module docstring if you want more.
PLACES = [
    ("ORCAS ISLAND", 48.6516, -122.8863, "island"),
    ("SAN JUAN ISLAND", 48.5371, -123.0681, "island"),
    ("LOPEZ ISLAND", 48.4955, -122.8729, "island"),
    ("SHAW ISLAND", 48.5710, -122.9599, "island"),
    ("BLAKELY ISLAND", 48.5600, -122.8007, "island"),
    ("CYPRESS ISLAND", 48.5742, -122.7043, "island"),
    ("LUMMI ISLAND", 48.6946, -122.6653, "island"),
    ("GUEMES ISLAND", 48.5574, -122.6133, "island"),
    ("STUART ISLAND", 48.6739, -123.2003, "island"),
    ("WALDRON ISLAND", 48.6992, -123.0378, "island"),
    ("SUCIA ISLAND", 48.7583, -122.9021, "island"),
    ("MATIA ISLAND", 48.7463, -122.8376, "island"),
    ("PATOS ISLAND", 48.7852, -122.9562, "island"),
    ("JONES ISLAND", 48.6159, -123.0464, "island"),
    ("DECATUR ISLAND", 48.5030, -122.8116, "island"),
    ("SINCLAIR ISLAND", 48.6189, -122.6779, "island"),
    ("SPIEDEN ISLAND", 48.6410, -123.1352, "island"),
    ("HENRY ISLAND", 48.6027, -123.1865, "island"),
    ("HARO STRAIT", 48.5553, -123.1852, "strait"),
    ("BOUNDARY PASS", 48.7378, -123.1365, "strait"),
    ("PRESIDENT CHANNEL", 48.6702, -123.0122, "strait"),
    ("SPIEDEN CHANNEL", 48.6319, -123.1430, "strait"),
    ("SAN JUAN CHANNEL", 48.5747, -123.0594, "strait"),
    ("ROSARIO STRAIT", 48.5826, -122.7486, "strait"),
    ("HALE PASSAGE", 48.7025, -122.6487, "strait"),
    ("BELLINGHAM BAY", 48.7005, -122.5592, "bay"),
    ("GRIFFIN BAY", 48.4892, -122.9948, "bay"),
    ("EAST SOUND", 48.6421, -122.8739, "bay"),
    ("WEST SOUND", 48.6139, -122.9688, "bay"),
    ("PADILLA BAY", 48.5261, -122.5501, "bay"),
    ("SAMISH BAY", 48.6030, -122.5111, "bay"),
]

# Even an authoritative centroid can sit in the wrong medium: an island whose
# relation centroid falls in a bay, or a strait whose centroid clips a rock.
# Nudge each label to the nearest cell of the right kind before shipping it.
LABEL_SNAP_REACH_M = 2500.0


def snap_labels(dem, labels):
    rows, cols = dem.shape
    m_per_row = 2 * REGION["half_h_m"] / rows
    m_per_col = 2 * REGION["half_w_m"] / cols
    reach_r = max(1, int(LABEL_SNAP_REACH_M / m_per_row))
    reach_c = max(1, int(LABEL_SNAP_REACH_M / m_per_col))
    out = []

    for label in labels:
        wants_land = label["kind"] == "island"
        col = int(np.clip(round((label["x"] + REGION["half_w_m"]) / (2 * REGION["half_w_m"]) * (cols - 1)), 0, cols - 1))
        row = int(np.clip(round((REGION["half_h_m"] - label["z"]) / (2 * REGION["half_h_m"]) * (rows - 1)), 0, rows - 1))

        def ok(r, c):
            value = dem[r, c]
            return value > 1.0 if wants_land else value < -3.0

        if ok(row, col):
            out.append(label)
            continue

        best, best_distance = None, None
        for dr in range(-reach_r, reach_r + 1, max(1, reach_r // 24)):
            for dc in range(-reach_c, reach_c + 1, max(1, reach_c // 24)):
                r, c = row + dr, col + dc
                if not (0 <= r < rows and 0 <= c < cols) or not ok(r, c):
                    continue
                distance = (dr * m_per_row) ** 2 + (dc * m_per_col) ** 2
                if best_distance is None or distance < best_distance:
                    best_distance, best = distance, (r, c)

        if best is None:
            print(f"    dropped label (nowhere suitable): {label['name']}")
            continue

        r, c = best
        out.append(
            {
                **label,
                "x": round(-REGION["half_w_m"] + c / (cols - 1) * 2 * REGION["half_w_m"]),
                "z": round(REGION["half_h_m"] - r / (rows - 1) * 2 * REGION["half_h_m"]),
            }
        )

    return out


def build_labels():
    m_lat, m_lon = meters_per_degree(REGION["origin"]["lat"])
    out = []

    for name, lat, lon, kind in PLACES:
        x = (lon - REGION["origin"]["lon"]) * m_lon
        z = (lat - REGION["origin"]["lat"]) * m_lat
        if abs(x) > REGION["half_w_m"] or abs(z) > REGION["half_h_m"]:
            continue
        out.append({"name": name, "x": round(x), "z": round(z), "kind": kind})

    return out


def main():
    print("Building regional basemap")
    dem = fetch_dem(force="--force" in sys.argv)

    chart = {
        "id": REGION["id"],
        "name": REGION["name"],
        "origin": REGION["origin"],
        "halfWidthM": REGION["half_w_m"],
        "halfHeightM": REGION["half_h_m"],
        "land": build_land(dem),
        "contours": build_contours(dem),
        "soundings": [],
        "depth": build_depth_grid(dem),
        "labels": snap_labels(dem, build_labels()),
        "structures": [],
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{REGION['id']}.ts")
    body = json.dumps(chart, separators=(",", ":"))

    with open(path, "w") as handle:
        handle.write("// GENERATED FILE — do not edit by hand.\n")
        handle.write("// Source: NOAA NCEI DEM_all mosaic.\n")
        handle.write("// Regenerate with: python3 scripts/charts/build_region.py\n\n")
        handle.write('import type { ChartData } from "../types";\n\n')
        handle.write(f"export const SAN_JUANS_REGION_CHART: ChartData = {body} as ChartData;\n")

    print(
        f"  land={len(chart['land'])} "
        f"contours={sum(len(c['lines']) for c in chart['contours'])} "
        f"labels={len(chart['labels'])} "
        f"{os.path.getsize(path) // 1024} KiB -> {path}"
    )


if __name__ == "__main__":
    main()
