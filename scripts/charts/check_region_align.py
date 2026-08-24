"""Check the regional basemap lines up with each harbour chart.

The plotter draws the region underneath the detailed chart, converting between
their two local grids with an affine (see `regionTransform` in
src/lib/charts/region.ts). If that affine is wrong the two shorelines disagree
and you get a visible seam at the edge of the survey window — or, worse, an
island in the wrong channel.

This samples a grid across each harbour window, classifies every point as land
or water in both charts, and searches a range of offsets for the best fit. The
best offset should be (0, 0).

Perfect agreement is not expected: the region is simplified at 40 m against
the harbour's 3 m, and drops anything under 6000 m², so the coastline itself
is a band of legitimate disagreement. What matters is that zero wins.

Run:  python3 scripts/charts/check_region_align.py
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe import load_chart  # noqa: E402
from scenes import SCENES  # noqa: E402

REGION_ID = "san-juans-region"
GRID = 60
SEARCH_M = 400
STEP_M = 100


def metres_per_degree(lat_deg):
    """Mirrors metersPerDegree in src/lib/charts/index.ts."""
    lat = math.radians(lat_deg)
    return (
        111132.92
        - 559.82 * math.cos(2 * lat)
        + 1.175 * math.cos(4 * lat)
        - 0.0023 * math.cos(6 * lat),
        111412.84 * math.cos(lat) - 93.5 * math.cos(3 * lat) + 0.118 * math.cos(5 * lat),
    )


def land_shape(chart):
    """One prepared geometry for the whole shoreline, holes punched out."""
    solid = unary_union(
        [
            Polygon(ring["points"]).buffer(0)
            for ring in chart["land"]
            if not ring["hole"] and len(ring["points"]) >= 4
        ]
    )
    holes = [
        Polygon(ring["points"]).buffer(0)
        for ring in chart["land"]
        if ring["hole"] and len(ring["points"]) >= 4
    ]

    if holes:
        solid = solid.difference(unary_union(holes))

    return prep(solid)


def transform(chart, region):
    """The same affine region.ts computes, so this tests that code's logic."""
    scene_lat, scene_lon = metres_per_degree(chart["origin"]["lat"])
    region_lat, region_lon = metres_per_degree(region["origin"]["lat"])

    return {
        "scaleX": scene_lon / region_lon,
        "scaleZ": scene_lat / region_lat,
        "offsetX": (region["origin"]["lon"] - chart["origin"]["lon"]) * scene_lon,
        "offsetZ": (region["origin"]["lat"] - chart["origin"]["lat"]) * scene_lat,
    }


def main():
    region = load_chart(REGION_ID)
    region_land = land_shape(region)
    worst = 0

    print("Region / harbour chart agreement")

    for scene in SCENES:
        chart = load_chart(scene["id"])
        scene_land = land_shape(chart)
        t = transform(chart, region)

        xs = np.linspace(-chart["halfWidthM"], chart["halfWidthM"], GRID)
        zs = np.linspace(-chart["halfHeightM"], chart["halfHeightM"], GRID)

        samples = [
            (x, z, scene_land.contains(point))
            for x in xs
            for z, point in ((z, MultiPoint([(x, z)]).geoms[0]) for z in zs)
        ]

        best = None
        steps = SEARCH_M // STEP_M

        for di in range(-steps, steps + 1):
            for dj in range(-steps, steps + 1):
                dx, dz = di * STEP_M, dj * STEP_M
                agree = 0

                for x, z, land in samples:
                    rx = (x + dx - t["offsetX"]) / t["scaleX"]
                    rz = (z + dz - t["offsetZ"]) / t["scaleZ"]
                    if region_land.contains(MultiPoint([(rx, rz)]).geoms[0]) == land:
                        agree += 1

                score = agree / len(samples)
                if best is None or score > best[0]:
                    best = (score, dx, dz)
                if dx == 0 and dz == 0:
                    at_zero = score

        score, dx, dz = best
        verdict = "OK" if dx == 0 and dz == 0 else "MISALIGNED"
        worst = max(worst, abs(dx), abs(dz))
        print(
            f"  {scene['id']:<24} agree at (0,0) = {at_zero:5.1%}   "
            f"best ({dx:+5d} E, {dz:+5d} N) = {score:5.1%}   {verdict}"
        )

    print()
    print("aligned" if worst == 0 else f"worst offset {worst} m — check region.ts")
    return 0 if worst == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
