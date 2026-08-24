const KILOMETERS_TO_NAUTICAL_MILES = 0.539956803;

type Coordinate = {
  lat: number;
  lon: number;
};

type DdmCoordinate = {
  lat: string;
  lon: string;
};

export type TripStop = {
  id: string;
  date: string;
  name: string;
  shortName: string;
  sceneId: string;
  ddm: DdmCoordinate;
  coordinate: Coordinate;
  departLocal: string;
  arriveLocal: string;
  navNotes: string[];
  operationalNotes: string[];
};

export type TripLeg = {
  id: string;
  fromStopId: string;
  toStopId: string;
  distanceNm: number;
  courseTrueDeg: number;
  scheduledDurationMinutes: number;
  targetSpeedKnots: number;
};

export type CruiseScenario = {
  id: string;
  title: string;
  timezone: string;
  departurePort: string;
  returnPort: string;
  stops: TripStop[];
  legs: TripLeg[];
};

function ddmToDecimal(degrees: number, minutes: number, hemisphere: "N" | "S" | "E" | "W") {
  const absolute = degrees + minutes / 60;
  return hemisphere === "S" || hemisphere === "W" ? -absolute : absolute;
}

function computeDistanceNm(from: Coordinate, to: Coordinate) {
  const earthRadiusKm = 6371;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c * KILOMETERS_TO_NAUTICAL_MILES;
}

function computeCourseTrueDeg(from: Coordinate, to: Coordinate) {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

function durationMinutes(fromLocal: string, toLocal: string) {
  const start = new Date(fromLocal);
  const end = new Date(toLocal);
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function buildLeg(from: TripStop, to: TripStop): TripLeg {
  const distanceNm = computeDistanceNm(from.coordinate, to.coordinate);
  const scheduledDurationMinutes = durationMinutes(to.departLocal, to.arriveLocal);
  const targetSpeedKnots = distanceNm / (scheduledDurationMinutes / 60);

  return {
    id: `${from.id}-to-${to.id}`,
    fromStopId: from.id,
    toStopId: to.id,
    distanceNm: Number(distanceNm.toFixed(2)),
    courseTrueDeg: Number((computeCourseTrueDeg(from.coordinate, to.coordinate) % 360).toFixed(0)),
    scheduledDurationMinutes,
    targetSpeedKnots: Number(targetSpeedKnots.toFixed(1)),
  };
}

const stops: TripStop[] = [
  {
    id: "bellingham-departure",
    date: "2026-08-15",
    name: "Bellingham, WA",
    shortName: "Bellingham",
    sceneId: "bellingham-marina",
    ddm: {
      lat: "48 45.200 N",
      lon: "122 30.533 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 45.2, "N"),
      lon: ddmToDecimal(122, 30.533, "W"),
    },
    departLocal: "2026-08-15T12:00:00-07:00",
    arriveLocal: "2026-08-15T12:00:00-07:00",
    navNotes: ["Depart from Bellingham harbor and clear the breakwater before bringing up cruise power."],
    operationalNotes: ["Baseline departure scene for controller and propulsion verification."],
  },
  {
    id: "sucia-echo-bay",
    date: "2026-08-15",
    name: "Sucia Island (Echo Bay)",
    shortName: "Sucia / Echo",
    // Reuse Fossil Bay layout as an anchorage stand‑in for Echo; both are Sucia.
    sceneId: "fossil-bay-anchorage",
    ddm: {
      lat: "48 45.400 N",
      lon: "122 52.600 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 45.4, "N"),
      lon: ddmToDecimal(122, 52.6, "W"),
    },
    departLocal: "2026-08-15T12:15:00-07:00",
    arriveLocal: "2026-08-15T15:00:00-07:00",
    navNotes: [
      "Rosario Strait crossing timing; favor slack/ebb.",
      "Anchor mid-bay with swing room; protect from westerly.",
    ],
    operationalNotes: ["Arrived ~3:00 PM; mid‑bay anchor set and verified."],
  },
  {
    id: "stuart-reid-harbor",
    date: "2026-08-16",
    name: "Stuart Island (Reid Harbor)",
    shortName: "Stuart / Reid",
    sceneId: "reid-harbor-anchorage",
    ddm: {
      lat: "48 40.333 N",
      lon: "123 11.583 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 40.333, "N"),
      lon: ddmToDecimal(123, 11.583, "W"),
    },
    departLocal: "2026-08-16T09:30:00-07:00",
    arriveLocal: "2026-08-16T12:00:00-07:00",
    navNotes: [
      "Transit via Spieden Channel under Spieden Island; expect tide rips at the west end.",
      "Pass under Spieden; glassy conditions in Reid on arrival.",
    ],
    operationalNotes: ["Anchored in Reid Harbor; calm, glassy night."],
  },
  {
    id: "roche-harbor-marina",
    date: "2026-08-17",
    name: "Roche Harbor Marina",
    shortName: "Roche",
    sceneId: "roche-harbor-marina",
    ddm: {
      lat: "48 36.600 N",
      lon: "123 09.000 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 36.6, "N"),
      lon: ddmToDecimal(123, 9, "W"),
    },
    departLocal: "2026-08-17T10:00:00-07:00",
    arriveLocal: "2026-08-17T11:00:00-07:00",
    navNotes: ["Tide: afternoon flood."],
    operationalNotes: ["VHF 78A for slip assignment.", "Slip I‑9 confirmed for nights 3–4."],
  },
  {
    id: "roche-harbor-marina-2",
    date: "2026-08-18",
    name: "Roche Harbor Marina (Night 4)",
    shortName: "Roche (I‑9)",
    sceneId: "roche-harbor-marina",
    ddm: {
      lat: "48 36.600 N",
      lon: "123 09.000 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 36.6, "N"),
      lon: ddmToDecimal(123, 9, "W"),
    },
    departLocal: "2026-08-18T00:00:00-07:00",
    arriveLocal: "2026-08-18T00:00:00-07:00",
    navNotes: ["Lay day at Roche Harbor."],
    operationalNotes: ["Stayed second night at Slip I‑9."],
  },
  {
    id: "lopez-hunter-bay",
    date: "2026-08-19",
    name: "Lopez Island (Hunter Bay)",
    shortName: "Hunter Bay",
    // Use Jones North Cove layout as a temporary anchorage stand‑in for Hunter Bay.
    sceneId: "jones-north-cove",
    ddm: {
      lat: "48 27.900 N",
      lon: "122 50.900 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 27.9, "N"),
      lon: ddmToDecimal(122, 50.9, "W"),
    },
    departLocal: "2026-08-19T10:00:00-07:00",
    arriveLocal: "2026-08-19T13:30:00-07:00",
    navNotes: [
      "Proceed south/east to Lopez; anchor with lee from prevailing wind.",
    ],
    operationalNotes: ["Day and night in Hunter Bay; tender ops practical."],
  },
  {
    id: "cypress-eagle-harbor",
    date: "2026-08-20",
    name: "Cypress (Eagle Harbor)",
    shortName: "Cypress / Eagle",
    sceneId: "eagle-harbor",
    ddm: {
      lat: "48 35.483 N",
      lon: "122 41.917 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 35.483, "N"),
      lon: ddmToDecimal(122, 41.917, "W"),
    },
    departLocal: "2026-08-20T09:00:00-07:00",
    arriveLocal: "2026-08-21T11:00:00-07:00",
    navNotes: ["Cross Rosario at slack; arrived ~11:00 AM."],
    operationalNotes: ["Pick up DNR mooring buoy. Early AM departure planned."],
  },
  {
    id: "bellingham-return",
    date: "2026-08-21",
    name: "Return to Bellingham",
    shortName: "Bellingham",
    sceneId: "bellingham-marina",
    ddm: {
      lat: "48 45.200 N",
      lon: "122 30.533 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 45.2, "N"),
      lon: ddmToDecimal(122, 30.533, "W"),
    },
    departLocal: "2026-08-21T06:30:00-07:00",
    arriveLocal: "2026-08-21T10:00:00-07:00",
    navNotes: ["Return boat by 10:00 AM; watch early traffic at the South Entrance."],
    operationalNotes: ["Fuel/pumpout training scenario TBD; on-time return 10:00 AM."],
  },
];

export const SAN_JUAN_AUG_2026_SCENARIO: CruiseScenario = {
  id: "san-juan-aug-2026",
  title: "San Juan Aug 2026",
  timezone: "America/Los_Angeles",
  departurePort: "Bellingham, WA",
  returnPort: "Bellingham, WA",
  stops,
  legs: [
    buildLeg(stops[0], stops[1]), // Bellingham → Sucia Echo Bay
    buildLeg(stops[1], stops[2]), // Echo → Reid Harbor via Spieden
    buildLeg(stops[2], stops[3]), // Reid → Roche (I‑9 night 3)
    buildLeg(stops[3], stops[4]), // Roche (night 4, lay day) → Hunter Bay
    buildLeg(stops[4], stops[5]), // Hunter Bay → Eagle Harbor
    buildLeg(stops[5], stops[6]), // Eagle Harbor → Bellingham
  ],
};
