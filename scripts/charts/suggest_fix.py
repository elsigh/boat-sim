"""Suggest a corrected position for a point that ended up on the beach.

Searches outward from a chart-frame point for the nearest spot that is in
water, off the land polygon, and at least `min_depth` deep. Used after a chart
rebuild moves the shoreline out from under a hand-placed berth or spawn.

Usage:
  python3 scripts/charts/suggest_fix.py <scene-id> <min-depth-m> x,z [x,z ...]
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe import depth_at, load_chart  # noqa: E402
from verify_scenes import on_land  # noqa: E402

STEP_M = 20.0
MAX_REACH_M = 1200.0
# Keep a berth off the shoreline itself: check a ring of points around the
# candidate so a spot in a one-cell puddle doesn't pass.
CLEARANCE_M = 25.0


def clear(chart, x, z, min_depth):
    if on_land(chart, x, z) or depth_at(chart, x, z) < min_depth:
        return False

    for angle in range(0, 360, 45):
        radians = math.radians(angle)
        px = x + CLEARANCE_M * math.cos(radians)
        pz = z + CLEARANCE_M * math.sin(radians)
        if on_land(chart, px, pz):
            return False

    return True


def suggest(chart, x, z, min_depth):
    if clear(chart, x, z, min_depth):
        return (x, z), 0.0

    steps = int(MAX_REACH_M / STEP_M)

    for ring in range(1, steps + 1):
        best = None

        for index in range(ring * 8):
            angle = (index / (ring * 8)) * 2 * math.pi
            px = x + ring * STEP_M * math.cos(angle)
            pz = z + ring * STEP_M * math.sin(angle)

            if clear(chart, px, pz, min_depth):
                distance = math.dist((x, z), (px, pz))
                if best is None or distance < best[1]:
                    best = ((round(px), round(pz)), distance)

        if best:
            return best

    return None, None


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 1

    scene_id = sys.argv[1]
    min_depth = float(sys.argv[2])
    chart = load_chart(scene_id)

    for token in sys.argv[3:]:
        x_text, z_text = token.split(",")
        x, z = float(x_text), float(z_text)
        point, distance = suggest(chart, x, z, min_depth)

        if point is None:
            print(f"  ({x:.0f},{z:.0f}) -> nothing suitable within {MAX_REACH_M:.0f} m")
            continue

        print(
            f"  ({x:7.0f},{z:7.0f}) depth {depth_at(chart, x, z):6.1f} m"
            f"  ->  [{point[0]}, {point[1]}] depth {depth_at(chart, *point):5.1f} m"
            f"  ({distance:.0f} m away)"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
