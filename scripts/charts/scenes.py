# Scene definitions for the San Juan Islands chart pipeline.
#
# Every scene is a window of real geography centred on a harbour. `half_w_m` /
# `half_h_m` are half-extents in metres, so the chart covers origin +/- half in
# each direction. Origins were taken from OSM feature centroids rather than
# guessed, because two of them were wrong the first time round.
#
# The chart frame is east/north metres (x east, z north). The renderer mirrors
# x at load time (see src/lib/marinas/index.ts), so nothing here is mirrored.

SCENES = [
    {
        "id": "bellingham-marina",
        "name": "Squalicum Harbor",
        # Squalicum Harbor sits on the north shore of Bellingham Bay; the
        # window reaches south far enough to run the breakwater approach.
        "origin": {"lat": 48.7535, "lon": -122.5060},
        "half_w_m": 2500,
        "half_h_m": 2200,
        "grid": 190,
        # Lidar reads Squalicum's covered moorage as terrain; recover the
        # basins by flood-filling against the OSM coastline.
        "unflood_basins": True,
    },
    {
        "id": "fossil-bay-anchorage",
        "name": "Sucia Island — Fossil Bay",
        # Covers Fossil Bay (48.7502 N) and Echo Bay (48.7578 N) together.
        "origin": {"lat": 48.7530, "lon": -122.8975},
        "half_w_m": 2000,
        "half_h_m": 1700,
        "grid": 175,
    },
    {
        "id": "reid-harbor-anchorage",
        "name": "Stuart Island — Reid Harbor",
        # Big window: Reid Harbor at the NW corner, the west end of Spieden
        # Channel at the SE, so the arrival is the passage you actually make.
        "origin": {"lat": 48.6545, "lon": -123.1700},
        "half_w_m": 3000,
        "half_h_m": 2750,
        "grid": 190,
    },
    {
        "id": "roche-harbor-marina",
        "name": "Roche Harbor",
        "origin": {"lat": 48.6095, "lon": -123.1570},
        "half_w_m": 2100,
        "half_h_m": 1800,
        "grid": 180,
    },
    {
        "id": "friday-harbor-marina",
        "name": "Friday Harbor",
        "origin": {"lat": 48.5375, "lon": -123.0080},
        "half_w_m": 2000,
        "half_h_m": 1700,
        "grid": 175,
    },
    {
        "id": "jones-north-cove",
        "name": "Jones Island — North Cove",
        "origin": {"lat": 48.6205, "lon": -123.0450},
        "half_w_m": 1700,
        "half_h_m": 1500,
        "grid": 170,
    },
    {
        "id": "eagle-harbor",
        "name": "Cypress Island — Eagle Harbor",
        "origin": {"lat": 48.5885, "lon": -122.6975},
        "half_w_m": 1800,
        "half_h_m": 1600,
        "grid": 170,
    },
]

SCENES_BY_ID = {scene["id"]: scene for scene in SCENES}
