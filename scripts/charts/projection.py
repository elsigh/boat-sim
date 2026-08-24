"""Local tangent-plane projection used by every chart in this project.

Over a few kilometres an equirectangular projection about the scene origin is
accurate to well under a metre, which is far tighter than anything the
simulator cares about, and it keeps the maths trivial in both Python and TS.
"""

from __future__ import annotations

import math


def meters_per_degree(lat_deg: float) -> tuple[float, float]:
    """Metres per degree of latitude and of longitude at `lat_deg` (WGS84)."""
    lat = math.radians(lat_deg)
    m_lat = (
        111132.92
        - 559.82 * math.cos(2 * lat)
        + 1.175 * math.cos(4 * lat)
        - 0.0023 * math.cos(6 * lat)
    )
    m_lon = (
        111412.84 * math.cos(lat)
        - 93.5 * math.cos(3 * lat)
        + 0.118 * math.cos(5 * lat)
    )
    return m_lat, m_lon


def to_local(lat: float, lon: float, origin: dict) -> tuple[float, float]:
    """Return (east_m, north_m) of a coordinate relative to a scene origin."""
    m_lat, m_lon = meters_per_degree(origin["lat"])
    return (lon - origin["lon"]) * m_lon, (lat - origin["lat"]) * m_lat


def to_geo(east_m: float, north_m: float, origin: dict) -> tuple[float, float]:
    """Inverse of `to_local`: returns (lat, lon)."""
    m_lat, m_lon = meters_per_degree(origin["lat"])
    return origin["lat"] + north_m / m_lat, origin["lon"] + east_m / m_lon
