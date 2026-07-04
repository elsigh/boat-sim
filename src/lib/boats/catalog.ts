import type { BoatConfiguration } from "@/lib/sim/boat-physics";

export type BoatVisualProfile = {
  aftDeckLengthRatio: number;
  aftDeckOffsetZRatio: number;
  deckhouseAftHalfWidthRatio: number;
  deckhouseBowHalfWidthRatio: number;
  deckhouseHeight: number;
  deckhouseLengthRatio: number;
  deckhouseOffsetZRatio: number;
  flybridgeHeight: number;
  flybridgeLengthRatio: number;
  flybridgeOffsetZRatio: number;
  flybridgeWidthRatio: number;
  hullColor: string;
  houseColor: string;
  mastHeight: number;
  mastOffsetZRatio: number;
  railColor: string;
  roofColor: string;
  superstructureStyle: "classic" | "expedition";
  swimPlatformLengthRatio: number;
  upperHelmHeight: number;
  upperHelmLengthRatio: number;
  upperHelmOffsetZRatio: number;
  upperHelmWidthRatio: number;
  windowColor: string;
};

export type BoatProfile = {
  charterUrl: string;
  description: string;
  displayName: string;
  highlights: string[];
  homePort?: string;
  manufacturer: string;
  model: string;
  profileSlug: string;
  simStatus: "ready" | "experimental";
  sources: Array<{
    label: string;
    url: string;
  }>;
  stats: {
    beam: string;
    cabins: number;
    cruiseSpeed: string;
    displacement: string;
    draft: string;
    engineNotes: string;
    fuel: string;
    holding: string;
    loa: string;
    maxSpeed: string;
    passengers?: string;
    sleeps: number;
    sternThruster?: string;
    thruster: string;
    stabilizers: string;
    water: string;
  };
  summary: string;
  visual: BoatVisualProfile;
} & BoatConfiguration;

export const DEFAULT_BOAT_SLUG = "52-grand-banks-bonum-vitae";

export const BOAT_CATALOG: BoatProfile[] = [
  {
    profileSlug: "52-grand-banks-bonum-vitae",
    displayName: "Bonum Vitae",
    manufacturer: "Grand Banks",
    model: "52 Heritage Motoryacht",
    charterUrl: "https://www.nwexplorations.com/charter-boats/52-grand-banks-2/",
    sources: [
      {
        label: "NW Explorations charter listing",
        url: "https://www.nwexplorations.com/charter-boats/52-grand-banks-2/",
      },
      {
        label: "Grand Banks / boats.com measured listing",
        url: "https://ca.boats.com/power-boats/2000-grand-banks-heritage-europa-52-8178843/",
      },
    ],
    summary:
      "Custom Grand Banks 52 motoryacht with cockpit, covered aft deck, flybridge, twin Caterpillar diesels, stabilizers, and bow thruster.",
    description:
      "Bonum Vitae is the simulator’s primary docking platform: a semi-displacement Grand Banks with a rare cockpit layout, strong low-speed maneuvering cues, and the classic covered-aft-deck / flybridge profile you’ll actually be handling.",
    highlights: [
      "Custom 52 MY built on the Grand Banks 49 platform with cockpit",
      "Twin Caterpillar 3126 diesels",
      "Bow thruster and stabilizers",
      "Covered aft deck, sundeck, and flybridge",
    ],
    homePort: "Bellingham, WA",
    simStatus: "ready",
    label: "Grand Banks 52 Heritage",
    massKg: 58_000 * 0.45359237,
    lengthM: 52 * 0.3048,
    beamM: (15 + 5 / 12) * 0.3048,
    engineLateralOffsetM: ((15 + 5 / 12) * 0.3048) * 0.34,
    forwardYawAuthorityScale: 0.9,
    reverseYawAuthorityScale: 0.72,
    engineLongitudinalOffsetM: -(52 * 0.3048) * 0.34,
    bowThrusterLongitudinalOffsetM: (52 * 0.3048) * 0.37,
    windCenterLongitudinalOffsetM: (52 * 0.3048) * 0.08,
    maxForwardThrustN: 7_200,
    maxReverseThrustN: 6_400,
    maxBowThrusterForceN: 2_600,
    maxPropWalkForceN: 680,
    throttleExponent: 1.7,
    throttleLinearBlend: 0.18,
    waterLinearDragSurge: 800,
    waterLinearDragSway: 18_000,
    waterDragSurge: 280,
    waterDragSway: 12_000,
    yawLinearDrag: 120_000,
    yawDrag: 180_000,
    windageAreaM2: 34,
    windLongitudinalCoefficient: 0.55,
    windLateralCoefficient: 1.2,
    propellerHandedness: {
      port: "left",
      starboard: "right",
    },
    visual: {
      aftDeckLengthRatio: 0.16,
      aftDeckOffsetZRatio: 0.29,
      deckhouseAftHalfWidthRatio: 0.22,
      deckhouseBowHalfWidthRatio: 0.155,
      deckhouseHeight: 0.92,
      deckhouseLengthRatio: 0.16,
      deckhouseOffsetZRatio: -0.165,
      flybridgeHeight: 0.36,
      flybridgeLengthRatio: 0.18,
      flybridgeOffsetZRatio: 0.29,
      flybridgeWidthRatio: 0.4,
      hullColor: "#efe7d3",
      houseColor: "#d5c6a7",
      mastHeight: 0.92,
      mastOffsetZRatio: -0.04,
      railColor: "#d7b97d",
      roofColor: "#f7f4eb",
      superstructureStyle: "classic",
      swimPlatformLengthRatio: 0.09,
      upperHelmHeight: 0.3,
      upperHelmLengthRatio: 0.08,
      upperHelmOffsetZRatio: -0.135,
      upperHelmWidthRatio: 0.18,
      windowColor: "#89a9bf",
    },
    stats: {
      beam: "15' 5\"",
      cabins: 3,
      cruiseSpeed: "15 kn",
      displacement: "58,000 lb",
      draft: "5' 2\"",
      engineNotes: "Twin Caterpillar 3126, 420 hp each",
      fuel: "1,200 gal",
      holding: "50 gal",
      loa: "52'",
      maxSpeed: "20 kn",
      sleeps: 4,
      sternThruster: "No",
      thruster: "Bow thruster",
      stabilizers: "Yes",
      water: "500 gal",
    },
  },
  {
    profileSlug: "86-nordhavn-serendipity",
    displayName: "Serendipity",
    manufacturer: "Nordhavn",
    model: "N86",
    charterUrl: "https://www.nwexplorations.com/charter-boats/serendipity-86-nordhavn/",
    sources: [
      {
        label: "NW Explorations charter listing",
        url: "https://www.nwexplorations.com/charter-boats/serendipity-86-nordhavn/",
      },
      {
        label: "Nordhavn N86 official specs",
        url: "https://nordhavn.com/nordhavn-yacht-models/n86/",
      },
    ],
    summary:
      "Crewed Nordhavn 86 expedition yacht with twin C18 diesels, 4,000 nm range, huge beam, and megayacht-scale systems.",
    description:
      "Serendipity is not a casual bareboat. It is a big, heavy, ocean-capable expedition platform whose official N86 spec sheet gives us a solid baseline for a second simulated profile and a useful contrast against Bonum Vitae.",
    highlights: [
      "Official N86 dimensions and displacement from Nordhavn",
      "Twin 600 hp Caterpillar C18s per Nordhavn N86 spec",
      "4,000 nm range at 9-10 kn",
      "Crewed charter only on NW Explorations",
    ],
    homePort: "Bellingham, WA",
    simStatus: "experimental",
    label: "Nordhavn 86",
    massKg: 400_000 * 0.45359237,
    lengthM: (86 + 7 / 12) * 0.3048,
    beamM: 24 * 0.3048,
    engineLateralOffsetM: (24 * 0.3048) * 0.29,
    forwardYawAuthorityScale: 0.9,
    reverseYawAuthorityScale: 0.74,
    engineLongitudinalOffsetM: -((86 + 7 / 12) * 0.3048) * 0.35,
    bowThrusterLongitudinalOffsetM: ((86 + 7 / 12) * 0.3048) * 0.4,
    windCenterLongitudinalOffsetM: ((86 + 7 / 12) * 0.3048) * 0.09,
    maxForwardThrustN: 16_000,
    maxReverseThrustN: 12_800,
    maxBowThrusterForceN: 8_000,
    maxPropWalkForceN: 1_500,
    throttleExponent: 1.85,
    throttleLinearBlend: 0.14,
    waterLinearDragSurge: 1_600,
    waterLinearDragSway: 55_000,
    waterDragSurge: 250,
    waterDragSway: 28_000,
    yawLinearDrag: 360_000,
    yawDrag: 560_000,
    windageAreaM2: 82,
    windLongitudinalCoefficient: 0.68,
    windLateralCoefficient: 1.46,
    propellerHandedness: {
      port: "left",
      starboard: "right",
    },
    visual: {
      aftDeckLengthRatio: 0.12,
      aftDeckOffsetZRatio: 0.22,
      deckhouseAftHalfWidthRatio: 0.34,
      deckhouseBowHalfWidthRatio: 0.26,
      deckhouseHeight: 1.24,
      deckhouseLengthRatio: 0.26,
      deckhouseOffsetZRatio: -0.08,
      flybridgeHeight: 0.44,
      flybridgeLengthRatio: 0.14,
      flybridgeOffsetZRatio: 0.05,
      flybridgeWidthRatio: 0.42,
      hullColor: "#e6e0d0",
      houseColor: "#d5cfbf",
      mastHeight: 1.3,
      mastOffsetZRatio: -0.01,
      railColor: "#cba968",
      roofColor: "#f5f1e7",
      superstructureStyle: "expedition",
      swimPlatformLengthRatio: 0.05,
      upperHelmHeight: 0.42,
      upperHelmLengthRatio: 0.09,
      upperHelmOffsetZRatio: -0.03,
      upperHelmWidthRatio: 0.22,
      windowColor: "#7b9ab0",
    },
    stats: {
      beam: "24' 0\"",
      cabins: 3,
      cruiseSpeed: "10 kn",
      displacement: "400,000 lb",
      draft: "6' 11\"",
      engineNotes: "Twin Caterpillar C18, 600 hp each",
      fuel: "7,000 gal",
      holding: "250 gal black / 210 gal grey",
      loa: "87' 7\"",
      maxSpeed: "12 kn",
      sleeps: 6,
      sternThruster: "Yes",
      thruster: "Bow and stern thrusters",
      stabilizers: "Yes",
      water: "900 gal",
    },
  },
];

export function getBoatProfile(slug: string | null | undefined) {
  if (!slug) {
    return BOAT_CATALOG[0];
  }

  return BOAT_CATALOG.find((boat) => boat.profileSlug === slug) ?? BOAT_CATALOG[0];
}
