"""Recover marina basins that a lidar-derived DEM reports as dry land.

NOAA's mosaic uses a surface model in developed harbours, so covered moorage,
float decking and the boats themselves come back as terrain several metres
above the waterline. Squalicum Harbor's two basins are solid ground in the raw
DEM, which would put the NW Explorations dock in the middle of a hill.

The fix has three parts:
  1. rasterise the OSM coastline as a barrier
  2. flood-fill from the deepest cell in the window, which is unambiguously
     open water, and keep everywhere the fill reaches
  3. only correct cells that the fill reached, that the DEM calls land, and
     that sit close to a mapped float — so a leak in the barrier can never
     flood a hillside

Corrected cells are set to a shallow moorage depth blended toward whatever
real water is nearby.
"""

from __future__ import annotations

import json
import os
from collections import deque

import numpy as np

from projection import meters_per_degree

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")

BASIN_DEPTH_M = 3.4
DOCK_REACH_M = 72.0
# A lone pier on an otherwise natural shore is a pier, not a basin. Requiring
# several mapped float nodes nearby keeps the correction to actual moorage and
# stops a single dock painting a rectangle of water onto the beach.
MIN_DOCK_SEEDS = 4
# Anything standing higher than this near a dock is a building or a bank, not
# a lidar return off decking.
MAX_CORRECTABLE_ELEVATION_M = 7.0


def _load(scene, suffix):
    path = os.path.join(CACHE, f"{scene['id']}.{suffix}")
    if not os.path.exists(path):
        return None
    with open(path) as handle:
        return json.load(handle)


def _to_grid(scene, shape, lat, lon):
    rows, cols = shape
    m_lat, m_lon = meters_per_degree(scene["origin"]["lat"])
    east = (lon - scene["origin"]["lon"]) * m_lon
    north = (lat - scene["origin"]["lat"]) * m_lat
    col = (east + scene["half_w_m"]) / (2 * scene["half_w_m"]) * (cols - 1)
    row = (scene["half_h_m"] - north) / (2 * scene["half_h_m"]) * (rows - 1)
    return row, col


def _draw_line(mask, r0, c0, r1, c1, thickness=1):
    rows, cols = mask.shape
    steps = int(max(abs(r1 - r0), abs(c1 - c0))) + 1
    for i in range(steps + 1):
        t = i / steps
        r = int(round(r0 + (r1 - r0) * t))
        c = int(round(c0 + (c1 - c0) * t))
        for dr in range(-thickness, thickness + 1):
            for dc in range(-thickness, thickness + 1):
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols:
                    mask[rr, cc] = True


def _coastline_barrier(scene, dem):
    data = _load(scene, "coast.json")
    if not data:
        return None

    barrier = np.zeros(dem.shape, dtype=bool)
    drawn = 0

    for element in data.get("elements", []):
        geometry = element.get("geometry")
        if not geometry or len(geometry) < 2:
            continue
        points = [_to_grid(scene, dem.shape, node["lat"], node["lon"]) for node in geometry]
        for i in range(1, len(points)):
            (r0, c0), (r1, c1) = points[i - 1], points[i]
            _draw_line(barrier, r0, c0, r1, c1)
        drawn += 1

    return barrier if drawn else None


def _dock_proximity(scene, dem):
    data = _load(scene, "osm.json")
    if not data:
        return None

    near = np.zeros(dem.shape, dtype=bool)
    rows, cols = dem.shape
    metres_per_row = 2 * scene["half_h_m"] / rows
    metres_per_col = 2 * scene["half_w_m"] / cols
    reach_r = int(DOCK_REACH_M / metres_per_row)
    reach_c = int(DOCK_REACH_M / metres_per_col)
    seeds = np.zeros(dem.shape, dtype=bool)

    for element in data.get("elements", []):
        tags = element.get("tags", {}) or {}
        if tags.get("man_made") not in {"pier", "breakwater"}:
            continue
        geometry = element.get("geometry")
        if not geometry:
            continue
        for node in geometry:
            r, c = _to_grid(scene, dem.shape, node["lat"], node["lon"])
            r, c = int(round(r)), int(round(c))
            if 0 <= r < rows and 0 <= c < cols:
                seeds[r, c] = True

    if not seeds.any():
        return None

    # Box dilation is plenty for a proximity test at this resolution.
    cumulative = np.cumsum(np.cumsum(seeds.astype(np.int32), axis=0), axis=1)
    padded = np.pad(cumulative, ((1, 0), (1, 0)))
    for r in range(rows):
        r0 = max(0, r - reach_r)
        r1 = min(rows - 1, r + reach_r)
        for c in range(cols):
            c0 = max(0, c - reach_c)
            c1 = min(cols - 1, c + reach_c)
            total = (
                padded[r1 + 1, c1 + 1]
                - padded[r0, c1 + 1]
                - padded[r1 + 1, c0]
                + padded[r0, c0]
            )
            if total >= MIN_DOCK_SEEDS:
                near[r, c] = True

    return near


def unflood(scene, dem):
    """Return a corrected copy of `dem`, or the original if nothing to do."""
    if not scene.get("unflood_basins"):
        return dem, 0

    barrier = _coastline_barrier(scene, dem)
    near_docks = _dock_proximity(scene, dem)

    if barrier is None or near_docks is None:
        print(f"  unflood {scene['id']}: missing coastline or dock data, skipped")
        return dem, 0

    rows, cols = dem.shape
    filled = np.nan_to_num(dem, nan=0.0)

    seed = np.unravel_index(int(np.argmin(filled)), filled.shape)
    reached = np.zeros(dem.shape, dtype=bool)
    queue = deque([seed])
    reached[seed] = True

    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            if not (0 <= rr < rows and 0 <= cc < cols):
                continue
            if reached[rr, cc] or barrier[rr, cc]:
                continue
            reached[rr, cc] = True
            queue.append((rr, cc))

    correct = reached & near_docks & (filled > -0.2) & (filled < MAX_CORRECTABLE_ELEVATION_M)
    count = int(correct.sum())

    if count == 0:
        return dem, 0

    out = filled.copy()
    out[correct] = -BASIN_DEPTH_M
    return out, count
