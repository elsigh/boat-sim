"""Check every berth and every spawn against the charts as built.

The layouts in `src/lib/marinas/` were placed against an earlier build of the
charts. Any change to the DEM pipeline can move the shoreline out from under a
berth or block an approach, and the failure mode is a boat that spawns on a
beach — so this asserts, for each scene, that every berth and every spawn sits
in water deep enough to float the boat that uses it.

Run:  python3 scripts/charts/verify_scenes.py
Exits non-zero if anything is wrong.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe import depth_at, load_chart  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MARINAS = os.path.abspath(os.path.join(HERE, "..", "..", "src", "lib", "marinas"))
GENERATED = os.path.abspath(
    os.path.join(HERE, "..", "..", "src", "lib", "charts", "generated")
)

SKIP_FILES = {"index.ts", "types.ts", "scene.ts", "builders.ts"}

# The depth raster is a ~20 m cell average, so sampling it right at a float
# straddles the shoreline and always reads shallow. For anything close to
# shore the meaningful test is the full-resolution land polygon: is this point
# actually on the beach? Depth is only asked of things out in open water.
MIN_OPEN_WATER_DEPTH_M = 3.0
MIN_SPAWN_DEPTH_M = 2.5


def chart_ids():
    text = open(os.path.join(GENERATED, "index.ts")).read()
    return set(re.findall(r'"([^"]+)":\s*\w+_CHART', text))


def balanced(text, start, opener, closer):
    """Slice from `start` (which must be the opener) to its matching closer."""
    depth = 0
    in_string = None

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if char == "\\":
                continue
            if char == in_string:
                in_string = None
            continue

        if char in "\"'`":
            in_string = char
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    return text[start:]


def split_objects(array_text):
    """Top-level `{...}` members of an array literal."""
    out = []
    index = 0

    while True:
        brace = array_text.find("{", index)
        if brace == -1:
            return out
        body = balanced(array_text, brace, "{", "}")
        out.append(body)
        index = brace + len(body)


def constants(text):
    """`const NAME = [x, z]` / `const NAME: Vec2 = [x, z]`.

    Layouts use these so a berth and the departure spawn sitting on it can't
    drift apart, which means a regex looking only for array literals misses
    most of the interesting points.
    """
    found = {}
    pattern = (
        r"const\s+([A-Z_0-9]+)\s*(?::\s*[A-Za-z0-9_<>\[\]]+\s*)?"
        r"=\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]"
    )

    for match in re.finditer(pattern, text):
        found[match.group(1)] = (float(match.group(2)), float(match.group(3)))

    return found


def read_point(body, key, consts):
    match = re.search(rf"\b{key}:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]", body)
    if match:
        return float(match.group(1)), float(match.group(2))

    match = re.search(rf"\b{key}:\s*([A-Z_0-9]+)", body)
    if match and match.group(1) in consts:
        return consts[match.group(1)]

    return None


def point_in_ring(point, ring):
    x, z = point
    inside = False
    count = len(ring)

    for index in range(count):
        x0, z0 = ring[index]
        x1, z1 = ring[(index + 1) % count]
        if (z0 > z) != (z1 > z):
            crossing = x0 + (z - z0) / (z1 - z0) * (x1 - x0)
            if crossing > x:
                inside = not inside

    return inside


def on_land(chart, x, z):
    """True if the point is inside the shoreline.

    Rings are tagged by nesting depth at build time: a `hole` is a lagoon or
    inland pond punched back out of the land around it, so a point inside one
    is water again.
    """
    if any(
        ring["hole"] and point_in_ring((x, z), ring["points"]) for ring in chart["land"]
    ):
        return False

    return any(
        not ring["hole"] and point_in_ring((x, z), ring["points"])
        for ring in chart["land"]
    )


def read_id(body):
    match = re.search(r'\bid:\s*"([^"]+)"', body)
    return match.group(1) if match else "?"


def read_layouts():
    known = chart_ids()
    scenes = {}

    for name in sorted(os.listdir(MARINAS)):
        if not name.endswith(".ts") or name in SKIP_FILES:
            continue

        text = open(os.path.join(MARINAS, name)).read()
        consts = constants(text)

        # One file can hold several scenes (parks.ts has four), so cut it at
        # each scene id the chart index knows about.
        marks = sorted(
            (match.start(), match.group(1))
            for match in re.finditer(r'id:\s*"([^"]+)"', text)
            if match.group(1) in known
        )

        for index, (offset, scene_id) in enumerate(marks):
            stop = marks[index + 1][0] if index + 1 < len(marks) else len(text)
            block = text[offset:stop]

            entries = []
            for key, point_key in (("berths", "center"), ("spawns", "position")):
                match = re.search(rf"\n  {key}:\s*\[", block)
                if not match:
                    continue

                array = balanced(block, block.index("[", match.start()), "[", "]")
                for body in split_objects(array):
                    point = read_point(body, point_key, consts)
                    if point is None:
                        continue
                    entries.append(
                        {
                            "kind": key[:-1],
                            "id": read_id(body),
                            "departure": '"departure"' in body,
                            "x": point[0],
                            "z": point[1],
                            "open_water": '"buoy"' in body or "anchor" in body,
                        }
                    )

            scenes[scene_id] = {"file": name, "entries": entries}

    return scenes


def main():
    problems = []
    layouts = read_layouts()

    if not layouts:
        print("no layouts found — has src/lib/marinas moved?")
        return 1

    for scene_id, data in sorted(layouts.items()):
        chart = load_chart(scene_id)
        print(f"\n{scene_id}  ({data['file']})")

        for entry in data["entries"]:
            # Layouts and charts are both authored east-positive; the mirror
            # into the render world happens at load in marinas/index.ts.
            depth = depth_at(chart, entry["x"], entry["z"])

            beached = on_land(chart, entry["x"], entry["z"])
            note = ""

            if beached:
                note = "   <-- ON LAND"
                problems.append(f"{scene_id}/{entry['id']}: inside the shoreline")
            elif (entry["kind"] == "spawn" and not entry["departure"]) or entry[
                "open_water"
            ]:
                floor = (
                    MIN_SPAWN_DEPTH_M if entry["kind"] == "spawn" else MIN_OPEN_WATER_DEPTH_M
                )
                if depth < floor:
                    note = f"   <-- TOO SHALLOW (wants {floor:.1f} m)"
                    problems.append(
                        f"{scene_id}/{entry['id']}: {depth:.1f} m, wants {floor:.1f} m"
                    )

            print(f"  {entry['kind']:<6} {entry['id']:<26} {depth:7.1f} m{note}")

    print()
    if problems:
        print(f"{len(problems)} problem(s):")
        for problem in problems:
            print(f"  {problem}")
        return 1

    print("all berths and spawns are in navigable water")
    return 0


if __name__ == "__main__":
    sys.exit(main())
