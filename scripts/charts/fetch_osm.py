"""Pull OpenStreetMap features for each scene window.

Two things come out of OSM that the DEM cannot give us:
  * place names (islands, bays, channels, points) for chart labels
  * built structures -- piers, floating docks, breakwaters, marina outlines --
    which are the actual dock geometry the sim needs.

Output: scripts/charts/cache/<scene-id>.osm.json
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import SCENES  # noqa: E402
from projection import meters_per_degree  # noqa: E402

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")


def scene_bbox(scene):
    lat0 = scene["origin"]["lat"]
    lon0 = scene["origin"]["lon"]
    m_lat, m_lon = meters_per_degree(lat0)
    # a little margin so labels just outside the window still resolve
    dlat = (scene["half_h_m"] * 1.15) / m_lat
    dlon = (scene["half_w_m"] * 1.15) / m_lon
    return (lat0 - dlat, lon0 - dlon, lat0 + dlat, lon0 + dlon)


def build_query(bbox):
    s, w, n, e = bbox
    box = f"{s},{w},{n},{e}"
    # Deliberately excludes natural=coastline: the shoreline comes from the
    # DEM so that land, depth shading and contours all agree with each other.
    # Coastline ways here would only ever disagree at the metre level.
    return f"""
[out:json][timeout:90];
(
  node["place"~"island|islet|locality|hamlet|village"]({box});
  node["natural"~"bay|strait|cape|beach|reef|peak"]({box});
  way["man_made"~"pier|breakwater|groyne"]({box});
  way["leisure"="marina"]({box});
  way["natural"~"bay|reef"]({box});
  way["place"~"island|islet"]({box});
);
out geom;
(
  relation["place"~"island|islet"]({box});
  relation["natural"="bay"]({box});
);
out center tags;
"""


def fetch(scene, force=False):
    os.makedirs(CACHE_DIR, exist_ok=True)
    out = os.path.join(CACHE_DIR, f"{scene['id']}.osm.json")

    if os.path.exists(out) and not force:
        print(f"  cached  {scene['id']}")
        with open(out) as handle:
            return json.load(handle)

    query = build_query(scene_bbox(scene))
    encoded = urllib.parse.urlencode({"data": query})

    for attempt in range(6):
        endpoint = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            request = urllib.request.Request(
                f"{endpoint}?{encoded}",
                headers={"User-Agent": "boat-sim-chart-builder/1.0 (github.com/elsigh)"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.loads(response.read())
            break
        except Exception as error:  # noqa: BLE001
            print(f"  retry {attempt + 1} for {scene['id']}: {error}")
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"failed to fetch OSM for {scene['id']}")

    with open(out, "w") as handle:
        json.dump(data, handle)
    print(f"  fetched {scene['id']}  {len(data.get('elements', []))} elements")
    return data


def fetch_coastline(scene, force=False):
    """OSM coastline ways, used to unflood marina basins in the DEM.

    Lidar-derived DEMs read covered moorage and float decking as terrain, so
    Squalicum's basins come back as solid ground. The coastline gives us a
    barrier to flood-fill against and recover the water.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    out = os.path.join(CACHE_DIR, f"{scene['id']}.coast.json")

    if os.path.exists(out) and not force:
        print(f"  cached  {scene['id']} coastline")
        with open(out) as handle:
            return json.load(handle)

    s, w, n, e = scene_bbox(scene)
    query = f'[out:json][timeout:90];way["natural"="coastline"]({s},{w},{n},{e});out geom;'
    encoded = urllib.parse.urlencode({"data": query})

    for attempt in range(6):
        endpoint = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            request = urllib.request.Request(
                f"{endpoint}?{encoded}",
                headers={"User-Agent": "boat-sim-chart-builder/1.0 (github.com/elsigh)"},
            )
            with urllib.request.urlopen(request, timeout=150) as response:
                data = json.loads(response.read())
            break
        except Exception as error:  # noqa: BLE001
            print(f"  retry {attempt + 1} for {scene['id']} coastline: {error}")
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"failed to fetch coastline for {scene['id']}")

    with open(out, "w") as handle:
        json.dump(data, handle)
    print(f"  fetched {scene['id']} coastline  {len(data.get('elements', []))} ways")
    return data


def main():
    force = "--force" in sys.argv
    print("Fetching OSM features")
    for scene in SCENES:
        fetch(scene, force=force)
        time.sleep(1.5)

        # The coastline is what unflood.py uses as a barrier, but every scene
        # wants it now: check_georef.py verifies the DEM against it, and that
        # check is the only thing standing between us and another silently
        # misplaced chart.
        fetch_coastline(scene, force=force)
        time.sleep(1.5)


if __name__ == "__main__":
    main()
