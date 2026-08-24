"""Download NOAA NCEI bathymetry/topography for each scene window.

Source: NOAA NCEI "DEM_all" mosaic ImageServer (1/9 arc-second coastal DEMs
where available, coarser elsewhere). Values are metres relative to the DEM
vertical datum: positive above water, negative below.

Output: scripts/charts/cache/<scene-id>.npy  (float32, north-up)
"""

from __future__ import annotations

import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
import tifffile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenes import SCENES  # noqa: E402
from projection import meters_per_degree  # noqa: E402

SERVICE = (
    "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/"
    "ImageServer/exportImage"
)

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")

# Native DEM resolution in this region is ~3.4 m. Sampling finer than that
# just interpolates, so cap the request size accordingly.
TARGET_SAMPLE_M = 4.0
MAX_PIXELS = 1800


def scene_bbox(scene):
    lat0 = scene["origin"]["lat"]
    lon0 = scene["origin"]["lon"]
    m_lat, m_lon = meters_per_degree(lat0)
    dlat = scene["half_h_m"] / m_lat
    dlon = scene["half_w_m"] / m_lon
    return (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat)


def request_size(scene):
    """Pixel grid for the export.

    ArcGIS lays exported pixels out in the image spatial reference, and ours
    is EPSG:4326 — degrees. Sizing the request from metres therefore asks for
    an aspect ratio the bbox doesn't have, and the service quietly widens the
    bbox to match rather than refusing: at this latitude a degree of longitude
    is 0.66 of a degree of latitude, so every feature came back squashed
    north-south. Mt Constitution landed 1.1 km from where it lives.

    So the aspect here has to be the *degree* aspect of the bbox. Resolution
    is then chosen so that whichever axis is coarser still meets the sample
    target, before the pixel cap applies.
    """
    west, south, east, north = scene_bbox(scene)
    dlon, dlat = east - west, north - south

    by_width = 2 * scene["half_w_m"] / TARGET_SAMPLE_M
    by_height = (2 * scene["half_h_m"] / TARGET_SAMPLE_M) * dlon / dlat
    w = max(by_width, by_height)
    h = w * dlat / dlon

    scale = min(1.0, MAX_PIXELS / max(w, h))
    return max(64, int(round(w * scale))), max(64, int(round(h * scale)))


def fetch(scene, force=False):
    os.makedirs(CACHE_DIR, exist_ok=True)
    out = os.path.join(CACHE_DIR, f"{scene['id']}.npy")

    if os.path.exists(out) and not force:
        print(f"  cached  {scene['id']}")
        return np.load(out)

    minlon, minlat, maxlon, maxlat = scene_bbox(scene)
    width, height = request_size(scene)
    params = {
        "bbox": f"{minlon},{minlat},{maxlon},{maxlat}",
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": f"{width},{height}",
        "format": "tiff",
        "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation",
        "noDataInterpretation": "esriNoDataMatchAny",
        "f": "image",
    }
    url = f"{SERVICE}?{urllib.parse.urlencode(params)}"

    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=180) as response:
                payload = response.read()
            break
        except Exception as error:  # noqa: BLE001
            print(f"  retry {attempt + 1} for {scene['id']}: {error}")
            time.sleep(4 * (attempt + 1))
    else:
        raise RuntimeError(f"failed to fetch DEM for {scene['id']}")

    tmp = os.path.join(CACHE_DIR, f"{scene['id']}.tif")
    with open(tmp, "wb") as handle:
        handle.write(payload)

    grid = tifffile.imread(tmp).astype("float32")
    grid[grid < -1e30] = np.nan
    grid[grid > 1e30] = np.nan
    np.save(out, grid)
    print(f"  fetched {scene['id']}  {grid.shape}  {os.path.getsize(tmp) // 1024} KiB")
    return grid


def main():
    force = "--force" in sys.argv
    print("Fetching NOAA DEM tiles")
    for scene in SCENES:
        fetch(scene, force=force)


if __name__ == "__main__":
    main()
