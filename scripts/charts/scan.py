"""ASCII depth map of a chart region — the quickest way to place a berth.

Usage:
  python3 scripts/charts/scan.py <scene-id> <centreX> <centreZ> <halfSpanM> [cols]

Legend: '#' land, '.' under 2 m, ':' 2-5 m, '-' 5-10 m, '=' 10-20 m,
        '~' 20-50 m, ' ' deeper. '+' marks the requested centre.
"""

from __future__ import annotations

import sys

from probe import depth_at, load_chart


def glyph(depth):
    if depth <= 0:
        return "#"
    if depth < 2:
        return "."
    if depth < 5:
        return ":"
    if depth < 10:
        return "-"
    if depth < 20:
        return "="
    if depth < 50:
        return "~"
    return " "


def main():
    chart = load_chart(sys.argv[1])
    cx, cz, half = (float(value) for value in sys.argv[2:5])
    cols = int(sys.argv[5]) if len(sys.argv) > 5 else 96
    rows = cols // 2
    step_x = (2 * half) / cols
    step_z = (2 * half) / rows

    print(f"{chart['name']}  centre ({cx:.0f},{cz:.0f})  span +/-{half:.0f} m  cell {step_x:.0f}x{step_z:.0f} m")
    header = f"x {cx - half:.0f} -> {cx + half:.0f}"
    print(header)

    for row in range(rows):
        z = cz + half - (row + 0.5) * step_z
        line = "".join(
            glyph(float(depth_at(chart, cx - half + (col + 0.5) * step_x, z)))
            for col in range(cols)
        )
        print(f"{z:>8.0f} |{line}|")


if __name__ == "__main__":
    main()
