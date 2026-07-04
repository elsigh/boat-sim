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
    departLocal: "2026-08-15T14:30:00-07:00",
    arriveLocal: "2026-08-15T14:30:00-07:00",
    navNotes: ["Depart from Bellingham harbor and clear the breakwater before bringing up cruise power."],
    operationalNotes: ["Baseline departure scene for controller and propulsion verification."],
  },
  {
    id: "sucia-fossil-bay",
    date: "2026-08-15",
    name: "Sucia Island (Fossil Bay)",
    shortName: "Sucia / Fossil",
    sceneId: "fossil-bay-anchorage",
    ddm: {
      lat: "48 45.000 N",
      lon: "122 54.033 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 45, "N"),
      lon: ddmToDecimal(122, 54.033, "W"),
    },
    departLocal: "2026-08-15T14:30:00-07:00",
    arriveLocal: "2026-08-15T16:30:00-07:00",
    navNotes: ["Tide: ebb push west.", "Caution: reefs near South Finger Island."],
    operationalNotes: ["Anchor in Fossil or Echo Bay."],
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
    departLocal: "2026-08-16T10:00:00-07:00",
    arriveLocal: "2026-08-16T11:30:00-07:00",
    navNotes: ["Tide: mid-morning ebb."],
    operationalNotes: ["Arrive by noon for dock space.", "Excellent mud bottom for anchoring."],
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
    departLocal: "2026-08-17T13:00:00-07:00",
    arriveLocal: "2026-08-17T13:45:00-07:00",
    navNotes: ["Tide: afternoon flood."],
    operationalNotes: [
      "VHF 78A: contact for slip.",
      "Check-in after 12 PM.",
      "50 Amp power required.",
    ],
  },
  {
    id: "friday-harbor-marina",
    date: "2026-08-18",
    name: "Friday Harbor Marina",
    shortName: "Friday Hbr",
    sceneId: "friday-harbor-marina",
    ddm: {
      lat: "48 32.183 N",
      lon: "123 00.983 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 32.183, "N"),
      lon: ddmToDecimal(123, 0.983, "W"),
    },
    departLocal: "2026-08-18T11:00:00-07:00",
    arriveLocal: "2026-08-18T12:30:00-07:00",
    navNotes: ["Tide: ride the flood south.", "Watch for heavy state ferry wakes."],
    operationalNotes: ["VHF 66A: contact for slip."],
  },
  {
    id: "jones-north-cove",
    date: "2026-08-19",
    name: "Jones Island (North Cove)",
    shortName: "Jones / North",
    sceneId: "jones-north-cove",
    ddm: {
      lat: "48 36.883 N",
      lon: "123 02.750 W",
    },
    coordinate: {
      lat: ddmToDecimal(48, 36.883, "N"),
      lon: ddmToDecimal(123, 2.75, "W"),
    },
    departLocal: "2026-08-19T12:30:00-07:00",
    arriveLocal: "2026-08-19T13:15:00-07:00",
    navNotes: ["Tide: flood push north.", "Caution: reef at NE entrance."],
    operationalNotes: ["Tame deer ashore; no pets allowed."],
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
    departLocal: "2026-08-20T09:30:00-07:00",
    arriveLocal: "2026-08-20T11:00:00-07:00",
    navNotes: ["Tide: cross Rosario at slack."],
    operationalNotes: ["Use free DNR buoys.", "No garbage service; pack out all waste."],
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
    departLocal: "2026-08-21T09:00:00-07:00",
    arriveLocal: "2026-08-21T10:30:00-07:00",
    navNotes: ["Tide: morning flood return."],
    operationalNotes: ["Hard deadline: return boat by 12:00 PM to avoid $300/hr penalty."],
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
    buildLeg(stops[0], stops[1]),
    buildLeg(stops[1], stops[2]),
    buildLeg(stops[2], stops[3]),
    buildLeg(stops[3], stops[4]),
    buildLeg(stops[4], stops[5]),
    buildLeg(stops[5], stops[6]),
    buildLeg(stops[6], stops[7]),
  ],
};
