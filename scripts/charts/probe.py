"""Sample charted depth at chart-frame points — used to sanity-check berths.

Usage:
  python3 scripts/charts/probe.py <scene-id> x1,z1 x2,z2 ...
Negative depths mean land.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated"))


def load_chart(scene_id):
    with open(os.path.join(GEN, f"{scene_id}.ts")) as handle:
        text = handle.read()
    return json.loads(re.search(r"= (\{.*\}) as ChartData;", text, re.S).group(1))


def depth_at(chart, x, z):
    grid = chart["depth"]
    values = np.frombuffer(base64.b64decode(grid["data"]), dtype="<i2").reshape(
        grid["rows"], grid["cols"]
    ) / 10.0
    col = (x + chart["halfWidthM"]) / grid["cellXM"] - 0.5
    row = (chart["halfHeightM"] - z) / grid["cellZM"] - 0.5
    c0, r0 = int(np.floor(col)), int(np.floor(row))
    fx, fz = col - c0, row - r0

    def cell(c, r):
        return values[np.clip(r, 0, grid["rows"] - 1), np.clip(c, 0, grid["cols"] - 1)]

    top = cell(c0, r0) + (cell(c0 + 1, r0) - cell(c0, r0)) * fx
    bottom = cell(c0, r0 + 1) + (cell(c0 + 1, r0 + 1) - cell(c0, r0 + 1)) * fx
    return top + (bottom - top) * fz


def main():
    chart = load_chart(sys.argv[1])
    for token in sys.argv[2:]:
        x, z = (float(part) for part in token.split(","))
        depth = depth_at(chart, x, z)
        state = "LAND" if depth <= 0 else ("shoal" if depth < 3 else "ok")
        print(f"  {x:>8.0f},{z:>8.0f}  depth {depth:>7.1f} m  {depth * 3.28084:>6.0f} ft  {state}")


if __name__ == "__main__":
    main()
