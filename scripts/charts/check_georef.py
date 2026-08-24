"""Check that a cached DEM is where it claims to be.

OSM's `natural=coastline` is the mean-high-water line, so on a correctly
georeferenced DEM the elevation sampled at a coastline node should be near
zero. If the DEM is shifted, sampling at a compensating offset will fit
better — so this searches a grid of offsets and reports the best one. A
correct chart's best offset is (0, 0).

This exists because it wasn't: ArcGIS exportImage lays pixels out in the
image SR, and asking for a metre-shaped size against a degree bbox made the
service widen the bbox instead of complaining. Everything came back squashed
north-south by a third.

Run:  python3 scripts/charts/check_georef.py [scene-id ...]
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import SCENES, SCENES_BY_ID  # noqa: E402
from projection import meters_per_degree  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")

SEARCH_M = 1500.0
STEP_M = 50.0
# Coastline nodes sit at mean high water; the DEM is a different vertical
# datum and tide state, so expect a metre or two of scatter even when perfect.
MAX_SAMPLES = 4000


def scene_bbox(scene):
    lat0 = scene["origin"]["lat"]
    lon0 = scene["origin"]["lon"]
    m_lat, m_lon = meters_per_degree(lat0)
    dlat = scene["half_h_m"] / m_lat
    dlon = scene["half_w_m"] / m_lon
    return lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat


def coastline_points(scene):
    path = os.path.join(CACHE, f"{scene['id']}.coast.json")
    if not os.path.exists(path):
        return []

    with open(path) as handle:
        data = json.load(handle)

    points = []
    for element in data.get("elements", []):
        for node in element.get("geometry", []) or []:
            points.append((node["lat"], node["lon"]))
    return points


def score(dem, bbox, points, dlat_m, dlon_m, m_lat, m_lon):
    west, south, east, north = bbox
    rows, cols = dem.shape
    total = 0.0
    count = 0

    for lat, lon in points:
        lat += dlat_m / m_lat
        lon += dlon_m / m_lon
        if not (south <= lat <= north and west <= lon <= east):
            continue
        r = int(round((north - lat) / (north - south) * (rows - 1)))
        c = int(round((lon - west) / (east - west) * (cols - 1)))
        value = dem[r, c]
        if not np.isfinite(value):
            continue
        total += abs(float(value))
        count += 1

    return (total / count if count else float("inf")), count


def check(scene):
    dem_path = os.path.join(CACHE, f"{scene['id']}.npy")
    if not os.path.exists(dem_path):
        print(f"  {scene['id']:<24} no DEM cached")
        return

    points = coastline_points(scene)
    if not points:
        print(f"  {scene['id']:<24} no coastline cached (fetch_osm.py fetches it "
              f"only for scenes with unflood_basins)")
        return

    if len(points) > MAX_SAMPLES:
        stride = len(points) // MAX_SAMPLES + 1
        points = points[::stride]

    dem = np.load(dem_path)
    bbox = scene_bbox(scene)
    m_lat, m_lon = meters_per_degree(scene["origin"]["lat"])

    steps = int(SEARCH_M / STEP_M)
    best = None

    for i in range(-steps, steps + 1):
        for j in range(-steps, steps + 1):
            dlat_m, dlon_m = i * STEP_M, j * STEP_M
            error, count = score(dem, bbox, points, dlat_m, dlon_m, m_lat, m_lon)
            if count < 50:
                continue
            if best is None or error < best[0]:
                best = (error, dlat_m, dlon_m, count)

    zero, zero_count = score(dem, bbox, points, 0.0, 0.0, m_lat, m_lon)
    error, dlat_m, dlon_m, count = best

    verdict = "OK" if abs(dlat_m) <= STEP_M and abs(dlon_m) <= STEP_M else "SHIFTED"
    print(
        f"  {scene['id']:<24} n={zero_count:<5} "
        f"|elev| at 0,0 = {zero:5.2f} m   "
        f"best offset ({dlat_m:+6.0f} N, {dlon_m:+6.0f} E) -> {error:5.2f} m   {verdict}"
    )


def main():
    wanted = [arg for arg in sys.argv[1:] if not arg.startswith("-")]
    scenes = [SCENES_BY_ID[name] for name in wanted] if wanted else SCENES
    print("Georeferencing check (OSM coastline vs DEM zero)")
    for scene in scenes:
        check(scene)


if __name__ == "__main__":
    main()
