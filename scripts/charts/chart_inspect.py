"""Print chart features near a point so berths can be placed against real data.

Usage:
  python3 scripts/charts/inspect.py <scene-id> [x z radius]
"""

from __future__ import annotations

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated"))


def load_chart(scene_id):
    with open(os.path.join(GEN, f"{scene_id}.ts")) as handle:
        text = handle.read()
    return json.loads(re.search(r"= (\{.*\}) as ChartData;", text, re.S).group(1))


def summarise(points):
    xs = [p[0] for p in points]
    zs = [p[1] for p in points]
    cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
    length = sum(
        math.dist(points[i], points[i + 1]) for i in range(len(points) - 1)
    )
    bearing = ""
    if len(points) >= 2:
        dx = points[-1][0] - points[0][0]
        dz = points[-1][1] - points[0][1]
        bearing = f"{(math.degrees(math.atan2(dx, dz)) + 360) % 360:5.0f}T"
    return cx, cz, length, bearing


def main():
    scene_id = sys.argv[1]
    chart = load_chart(scene_id)
    cx = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    cz = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    radius = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9

    print(f"{chart['name']}  origin {chart['origin']}  +/-{chart['halfWidthM']}x{chart['halfHeightM']} m")
    print(f"land rings: {len(chart['land'])}  contours: {len(chart['contours'])}")

    print("\nlabels:")
    for label in sorted(chart["labels"], key=lambda l: math.dist((l["x"], l["z"]), (cx, cz))):
        distance = math.dist((label["x"], label["z"]), (cx, cz))
        if distance <= radius:
            print(f"  {label['name']:<28} x={label['x']:>7.0f} z={label['z']:>7.0f}  ({label['kind']})")

    print("\nstructures (nearest first):")
    rows = []
    for structure in chart["structures"]:
        sx, sz, length, bearing = summarise(structure["points"])
        distance = math.dist((sx, sz), (cx, cz))
        if distance <= radius:
            rows.append((distance, structure, sx, sz, length, bearing))
    rows.sort(key=lambda row: row[0])
    for distance, structure, sx, sz, length, bearing in rows[:60]:
        name = structure["name"] or ""
        print(
            f"  {structure['kind']:<11} {name:<22} x={sx:>7.0f} z={sz:>7.0f} "
            f"len={length:>6.0f}m hdg={bearing} pts={len(structure['points'])}"
        )
    print(f"  ... {len(rows)} within radius")


if __name__ == "__main__":
    main()
