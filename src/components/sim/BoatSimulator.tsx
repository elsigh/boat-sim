"use client";

import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Physics, type RapierRigidBody } from "@react-three/rapier";
import type { Object3D } from "three";
import type { WheelEventHandler } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOAT_CATALOG, DEFAULT_BOAT_SLUG, getBoatProfile } from "@/lib/boats/catalog";
import { useGamepad } from "@/hooks/useGamepad";
import { useEngineAudio } from "@/hooks/useEngineAudio";
import { useEngineState } from "@/hooks/useEngineState";
import { useVhfRadio } from "@/hooks/useVhfRadio";
import { chartToGeo, getWorldChart } from "@/lib/charts";
import { getMarinaLayout } from "@/lib/marinas";
import type { MarinaLayout, SpawnPoint } from "@/lib/marinas/types";
import { SAN_JUAN_AUG_2026_SCENARIO } from "@/lib/scenarios/san-juan-aug-2026";
import { computeBerthGuidance } from "@/lib/sim/berth-guidance";
import {
  buildEnvironment,
  CALM_TEST_ENVIRONMENT,
  DEFAULT_DOCKING_TELEMETRY,
  type DockingTelemetry,
} from "@/lib/sim/boat-physics";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";
import {
  type ImpactIncident,
  ImpactTracker,
  type RawImpact,
} from "@/lib/sim/collision-damage";
import { estimateDepthMeters } from "@/lib/sim/bathymetry";
import { useViewportCamera } from "@/hooks/useViewportCamera";

import { Boat } from "./Boat";
import { DamageOverlay } from "./DamageOverlay";
import { DockingCelebration } from "./DockingCelebration";
import { DockingOverlay } from "./DockingOverlay";
import { ImpactMarks } from "./ImpactMarks";
import { Marina } from "./Marina";
import { MarinaTraffic, type TrafficTarget } from "./MarinaTraffic";
import { HazardSpawners } from "./HazardSpawners";
import type { Hazard } from "./HazardSpawners";
import { MooredBoats } from "./MooredBoats";
import { SimCameraRig } from "./SimCameraRig";
import { TurboModeOverlay } from "./TurboModeOverlay";
import { Wildlife } from "./Wildlife";
import { Wayline } from "./Wayline";
import { Water } from "./Water";
import { TenderCraft } from "./TenderCraft";

type BoatSimulatorProps = {
  initialBoatSlug?: string;
};

function computeLocalCurrent(
  marina: MarinaLayout,
  world: { x: number; z: number },
): { x: number; z: number } {
  // Simple tide-rip model: near the entrance edges and prominent points, add a localized set.
  // Use approach lines and dock edges as hints; push toward the entrance headings.
  const candidates: Array<{ center: [number, number]; towardDeg: number; strength: number; reach: number }> = [];
  Object.entries(marina.approachLines ?? {}).forEach(([, line]) => {
    if (!line || line.length < 2) return;
    const a = line[0];
    const b = line[1];
    const center: [number, number] = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const towardDeg = (Math.atan2(dz, dx) * 180) / Math.PI + 90; // rough outward direction
    candidates.push({ center, towardDeg, strength: 0.6, reach: 120 });
  });
  // Add a weak general set along the marina's typical currentTowardDeg
  candidates.push({
    center: [0, 0],
    towardDeg: ((-marina.conditions.currentTowardDeg % 360) + 360) % 360,
    strength: 0.25,
    reach: 9999,
  });

  let vx = 0;
  let vz = 0;
  candidates.forEach((r) => {
    const dx = world.x - r.center[0];
    const dz = world.z - r.center[1];
    const d = Math.hypot(dx, dz);
    const w = Math.max(0, 1 - d / r.reach);
    if (w <= 0) return;
    const rad = (r.towardDeg * Math.PI) / 180;
    vx += Math.sin(rad) * r.strength * w;
    vz += Math.cos(rad) * r.strength * w;
  });

  // Scale (knots -> m/s) — base currentKnots is already applied elsewhere; here we add small deltas.
  const KTS_TO_MS = 0.514444;
  return { x: vx * KTS_TO_MS, z: vz * KTS_TO_MS };
}

const TELEMETRY_UPDATE_INTERVAL_MS = 100;
const BOAT_WATERLINE_Y = 0.9;

function spawnToPose(spawn: SpawnPoint) {
  return {
    position: [spawn.position[0], BOAT_WATERLINE_Y, spawn.position[1]] as [
      number,
      number,
      number,
    ],
    yawDeg: spawn.yawDeg,
  };
}

function defaultSpawnFor(marina: MarinaLayout) {
  // Docking practice is the point: prefer an arrival exercise when the
  // marina offers one.
  return (
    marina.spawns.find((spawn) => spawn.kind === "arrival") ?? marina.spawns[0]
  );
}

export function BoatSimulator({ initialBoatSlug }: BoatSimulatorProps) {
  const router = useRouter();
  const scenario = useMemo(() => SAN_JUAN_AUG_2026_SCENARIO, []);
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [currentStopId, setCurrentStopId] = useState(scenario.stops[0].id);
  const [telemetry, setTelemetry] = useState(DEFAULT_DOCKING_TELEMETRY);
  const [viewMode, setViewMode] = useState<"plan" | "forward" | "backward">("plan");
  const [planZoom, setPlanZoom] = useState(48);
  const [selectedBoatSlug, setSelectedBoatSlug] = useState(initialBoatSlug ?? DEFAULT_BOAT_SLUG);
  const [conditionsMode, setConditionsMode] = useState<"typical" | "calm">("typical");
  const [hudVisible, setHudVisible] = useState(true);
  const [turboActive, setTurboActive] = useState(false);
  const [turboAnnouncement, setTurboAnnouncement] = useState({
    id: 0,
    visible: false,
  });
  const turboAnnouncementTimerRef = useRef<number | null>(null);
  // Saved helm preferences are read after mount, not in the state initialiser.
  // localStorage doesn't exist on the server, so seeding state from it makes
  // the server and the first client render disagree the moment anything is
  // stored — and React treats that as a hydration mismatch, which in dev
  // throws and leaves you looking at a blank page. The cost is that the first
  // frame uses defaults, which nobody can perceive.
  const [leversSwapped, setLeversSwapped] = useState(false);
  const [quadrantIdle, setQuadrantIdle] = useState<{
    port: number;
    starboard: number;
  } | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem("boat-sim:levers-swapped") === "1") {
      setLeversSwapped(true);
    }

    try {
      const stored = window.localStorage.getItem("boat-sim:quadrant-idle");
      const parsed = stored ? JSON.parse(stored) : null;

      if (
        parsed &&
        typeof parsed.port === "number" &&
        typeof parsed.starboard === "number"
      ) {
        setQuadrantIdle(parsed);
      }
    } catch {
      // Leave the quadrant uncalibrated; the user can redo it from the panel.
    }
  }, []);

  const handleToggleLeverSwap = () => {
    setLeversSwapped((value) => {
      const next = !value;
      window.localStorage.setItem("boat-sim:levers-swapped", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      setHudVisible((value) => !value);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [softwareEngineControls, setSoftwareEngineControls] = useState({
    portMasterOn: false,
    starboardMasterOn: false,
    ignitionRequestId: 0,
  });

  const currentStop = useMemo(
    () => scenario.stops.find((stop) => stop.id === currentStopId) ?? scenario.stops[0],
    [currentStopId, scenario.stops],
  );
  const marina = useMemo(() => getMarinaLayout(currentStop.sceneId), [currentStop.sceneId]);
  const initialSpawn = defaultSpawnFor(marina);
  const [selectedSpawnId, setSelectedSpawnId] = useState(initialSpawn.id);
  const [selectedBerthId, setSelectedBerthId] = useState(initialSpawn.berthId);

  const selectedSpawn = useMemo(
    () =>
      marina.spawns.find((spawn) => spawn.id === selectedSpawnId) ?? defaultSpawnFor(marina),
    [marina, selectedSpawnId],
  );
  const selectedBerth = useMemo(
    () => marina.berths.find((berth) => berth.id === selectedBerthId) ?? marina.berths[0] ?? null,
    [marina, selectedBerthId],
  );

  const [mapBoatCoordinate, setMapBoatCoordinate] = useState(
    scenario.stops[0]?.coordinate ?? null,
  );
  const [breadcrumb, setBreadcrumb] = useState<Array<{ lat: number; lon: number }>>([]);
  const [breadcrumbWorld, setBreadcrumbWorld] = useState<Array<{ x: number; z: number }>>([]);
  const [depthFeet, setDepthFeet] = useState<number | null>(null);
  const lastWorldRef = useRef<{ x: number; z: number } | null>(null);
  const [anchor, setAnchor] = useState<{
    active: boolean;
    point: { x: number; z: number } | null;
    chainMeters: number;
  }>({ active: false, point: null, chainMeters: 0 });
  const [tenderActive, setTenderActive] = useState(false);
  const [tenderAutoReturn, setTenderAutoReturn] = useState<{
    active: boolean;
  } | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [trafficTargets, setTrafficTargets] = useState<TrafficTarget[]>([]);
  // The expanded plotter is an opaque full-screen panel. Rendering a 3D scene
  // nobody can see behind it costs a whole frame budget and makes dragging the
  // chart feel awful — and pausing the sim while you study the chart is the
  // behaviour you'd want anyway.
  const [plotterExpanded, setPlotterExpanded] = useState(false);
  const tenderRef = useRef<Object3D | null>(null);
  const [bellinghamStatus, setBellinghamStatus] = useState<{ fuelOccupied: boolean; pumpoutOccupied: boolean }>({
    fuelOccupied: false,
    pumpoutOccupied: false,
  });
  const bellinghamTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (marina.id !== "bellingham-marina") {
      if (bellinghamTimerRef.current) {
        window.clearTimeout(bellinghamTimerRef.current);
        bellinghamTimerRef.current = null;
      }
      setBellinghamStatus({ fuelOccupied: false, pumpoutOccupied: false });
      return;
    }
    const tick = () => {
      // Bias toward "open" on fuel; pumpout moderately busy.
      setBellinghamStatus((s) => {
        const next = { ...s };
        // Fuel: if open, small chance to become occupied; if occupied, decent chance to free up.
        if (!s.fuelOccupied) {
          if (Math.random() < 0.14) next.fuelOccupied = true;
        } else {
          if (Math.random() < 0.42) next.fuelOccupied = false;
        }
        // Pumpout: slightly higher occupancy than fuel, but still turns over.
        if (!s.pumpoutOccupied) {
          if (Math.random() < 0.22) next.pumpoutOccupied = true;
        } else {
          if (Math.random() < 0.36) next.pumpoutOccupied = false;
        }
        return next;
      });
      bellinghamTimerRef.current = window.setTimeout(tick, 18_000 + Math.random() * 18_000);
    };
    bellinghamTimerRef.current = window.setTimeout(tick, 8_000);
    return () => {
      if (bellinghamTimerRef.current) {
        window.clearTimeout(bellinghamTimerRef.current);
        bellinghamTimerRef.current = null;
      }
    };
  }, [marina.id]);
  const [resetRequest, setResetRequest] = useState<{
    id: number;
    position: [number, number, number];
    yawDeg: number;
  } | null>({
    id: 0,
    ...spawnToPose(initialSpawn),
  });
  const boatBodyRef = useRef<RapierRigidBody | null>(null);
  const resetIdRef = useRef(0);
  const mapAnchorRef = useRef({
    coordinate: scenario.stops[0].coordinate,
    worldPosition: {
      x: initialSpawn.position[0],
      z: initialSpawn.position[1],
    },
  });
  const lastTelemetryUpdateAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastMapSampleAtRef = useRef(0);
  const viewportCamera = useViewportCamera();
  const selectedBoat = useMemo(
    () => getBoatProfile(selectedBoatSlug),
    [selectedBoatSlug],
  );
  const throttleAxes = useMemo(
    () => (leversSwapped ? { port: 1, starboard: 0 } : { port: 0, starboard: 1 }),
    [leversSwapped],
  );
  const controls = useGamepad(
    useMemo(
      () => ({
        throttleMode: "dualAxis" as const,
        throttleAxes,
        invertThrottleAxes: true,
        bowThrusterButtons: { port: 4, starboard: 5 },
        quadrantIdle,
      }),
      [quadrantIdle, throttleAxes],
    ),
  );

  const hardwareHelmConnected =
    controls.connected && controls.gamepadId !== "Keyboard Helm";

  const handleCalibrateQuadrantIdle = () => {
    if (!hardwareHelmConnected) {
      return;
    }

    const next = {
      port: controls.rawAxes[throttleAxes.port] ?? 0,
      starboard: controls.rawAxes[throttleAxes.starboard] ?? 0,
    };

    setQuadrantIdle(next);
    window.localStorage.setItem("boat-sim:quadrant-idle", JSON.stringify(next));
  };

  const handleClearQuadrantIdle = () => {
    setQuadrantIdle(null);
    window.localStorage.removeItem("boat-sim:quadrant-idle");
  };

  const engineState = useEngineState(controls, softwareEngineControls);
  const engineAudio = useEngineAudio(engineState);
  const vhfRadio = useVhfRadio();
  const turboEligible =
    engineState.port.running &&
    engineState.starboard.running &&
    engineState.port.demandThrottle >= 0.96 &&
    engineState.starboard.demandThrottle >= 0.96;

  useEffect(() => {
    const dismissAnnouncement = () => {
      if (turboAnnouncementTimerRef.current) {
        window.clearTimeout(turboAnnouncementTimerRef.current);
        turboAnnouncementTimerRef.current = null;
      }

      setTurboAnnouncement((current) =>
        current.visible ? { ...current, visible: false } : current,
      );
    };
    const handleTurboKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyT" ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (turboActive) {
        setTurboActive(false);
        dismissAnnouncement();
        return;
      }

      if (!turboEligible) {
        return;
      }

      setTurboActive(true);
      setTurboAnnouncement((current) => ({
        id: current.id + 1,
        visible: true,
      }));

      if (turboAnnouncementTimerRef.current) {
        window.clearTimeout(turboAnnouncementTimerRef.current);
      }

      turboAnnouncementTimerRef.current = window.setTimeout(() => {
        turboAnnouncementTimerRef.current = null;
        setTurboAnnouncement((current) => ({ ...current, visible: false }));
      }, 3000);
    };

    window.addEventListener("keydown", handleTurboKeyDown);
    return () => window.removeEventListener("keydown", handleTurboKeyDown);
  }, [turboActive, turboEligible]);

  useEffect(() => {
    if (turboActive && !turboEligible) {
      setTurboActive(false);
      setTurboAnnouncement((current) => ({ ...current, visible: false }));

      if (turboAnnouncementTimerRef.current) {
        window.clearTimeout(turboAnnouncementTimerRef.current);
        turboAnnouncementTimerRef.current = null;
      }
    }
  }, [turboActive, turboEligible]);

  useEffect(
    () => () => {
      if (turboAnnouncementTimerRef.current) {
        window.clearTimeout(turboAnnouncementTimerRef.current);
      }
    },
    [],
  );
  // Build a persistent environment object so we can mutate currentVelocity dynamically.
  const environmentRefState = useRef<SimulationEnvironment>(
    conditionsMode === "calm" ? { ...CALM_TEST_ENVIRONMENT } : buildEnvironment(marina.conditions),
  );
  useEffect(() => {
    environmentRefState.current =
      conditionsMode === "calm" ? { ...CALM_TEST_ENVIRONMENT } : buildEnvironment(marina.conditions);
  }, [conditionsMode, marina.conditions]);
  const guidance = useMemo(
    () => (selectedBerth ? computeBerthGuidance(telemetry, selectedBerth) : null),
    [selectedBerth, telemetry],
  );

  // Collision damage: the physics callback streams raw contacts; the tracker
  // filters them into discrete incidents that cost hull integrity.
  const impactTrackerRef = useRef(new ImpactTracker());
  const [hullIntegrityPct, setHullIntegrityPct] = useState(100);
  const [incidents, setIncidents] = useState<ImpactIncident[]>([]);
  const boatLengthRef = useRef(selectedBoat.lengthM);

  useEffect(() => {
    boatLengthRef.current = selectedBoat.lengthM;
  }, [selectedBoat.lengthM]);

  const handleImpact = useCallback((raw: RawImpact) => {
    const incident = impactTrackerRef.current.register(raw, boatLengthRef.current);

    if (!incident) {
      return;
    }

    setHullIntegrityPct((current) => Math.max(0, current - incident.hullDamagePct));
    setIncidents((current) => [...current.slice(-39), incident]);
  }, []);

  // Docking celebration: armed only after the boat has genuinely been away
  // from the berth, so spawning already-docked never fires it.
  const [celebration, setCelebration] = useState({ id: 0, active: false });
  const celebrationArmedRef = useRef(false);
  const dockTimerRef = useRef<number | null>(null);
  const awayTimerRef = useRef<number | null>(null);
  const dockedNow = Boolean(guidance?.docked);

  useEffect(() => {
    if (dockedNow) {
      if (awayTimerRef.current) {
        window.clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }

      if (celebrationArmedRef.current && !dockTimerRef.current) {
        dockTimerRef.current = window.setTimeout(() => {
          dockTimerRef.current = null;
          celebrationArmedRef.current = false;
          setCelebration((current) => ({ id: current.id + 1, active: true }));
        }, 700);
      }

      return;
    }

    if (dockTimerRef.current) {
      window.clearTimeout(dockTimerRef.current);
      dockTimerRef.current = null;
    }

    if (!awayTimerRef.current) {
      awayTimerRef.current = window.setTimeout(() => {
        awayTimerRef.current = null;
        celebrationArmedRef.current = true;
        setCelebration((current) =>
          current.active ? { ...current, active: false } : current,
        );
      }, 3000);
    }
  }, [dockedNow]);

  const resetBoatTo = useCallback(
    (spawn: SpawnPoint, anchorCoordinate: { lat: number; lon: number }) => {
      setTurboActive(false);
      setTurboAnnouncement((current) => ({ ...current, visible: false }));

      if (turboAnnouncementTimerRef.current) {
        window.clearTimeout(turboAnnouncementTimerRef.current);
        turboAnnouncementTimerRef.current = null;
      }

      celebrationArmedRef.current = false;
      setCelebration((current) =>
        current.active ? { ...current, active: false } : current,
      );

      // A fresh exercise means a repaired boat and a repaired marina.
      impactTrackerRef.current.reset();
      setHullIntegrityPct(100);
      setIncidents([]);

      if (dockTimerRef.current) {
        window.clearTimeout(dockTimerRef.current);
        dockTimerRef.current = null;
      }

      if (awayTimerRef.current) {
        window.clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }

      // A new exercise starts with a clean track.
      setBreadcrumb([]);
      setBreadcrumbWorld([]);

      resetIdRef.current += 1;
      mapAnchorRef.current = {
        coordinate: anchorCoordinate,
        worldPosition: {
          x: spawn.position[0],
          z: spawn.position[1],
        },
      };
      setMapBoatCoordinate(anchorCoordinate);
      setResetRequest({
        id: resetIdRef.current,
        ...spawnToPose(spawn),
      });
    },
    [],
  );

  const handleViewportWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    if (viewMode !== "plan") {
      return;
    }

    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 6;
    setPlanZoom((current) => Math.min(300, Math.max(26, current + delta)));
  };
  const handleBoatChange = (slug: string) => {
    setSelectedBoatSlug(slug);
    router.replace(`/?boat=${slug}`);
  };
  const handleViewModeChange = (mode: "plan" | "forward" | "backward") => {
    viewportCamera.resetView();
    setViewMode(mode);
  };
  // Anchor/tender keybinds: Shift-A toggles panel (handled in overlay), Up/Down adjust chain
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        // Handled in overlay via prop; no-op here for now
      } else if (e.key === "ArrowDown") {
        setAnchor((a) => ({ ...a, chainMeters: Math.min(150, a.chainMeters + 1.5) }));
      } else if (e.key === "ArrowUp") {
        setAnchor((a) => ({ ...a, chainMeters: Math.max(0, a.chainMeters - 1.5) }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const handleTogglePortEngine = () => {
    setSoftwareEngineControls((current) => ({
      ...current,
      portMasterOn: !current.portMasterOn,
    }));
  };
  const handleToggleStarboardEngine = () => {
    setSoftwareEngineControls((current) => ({
      ...current,
      starboardMasterOn: !current.starboardMasterOn,
    }));
  };
  const handleEnableBothEngines = () => {
    setSoftwareEngineControls((current) => ({
      ...current,
      portMasterOn: true,
      starboardMasterOn: true,
    }));
  };
  const handleStartEngines = () => {
    setSoftwareEngineControls((current) => ({
      portMasterOn: current.portMasterOn || !engineState.port.masterOn,
      starboardMasterOn: current.starboardMasterOn || !engineState.starboard.masterOn,
      ignitionRequestId: current.ignitionRequestId + 1,
    }));
  };
  const handleBoatPositionSample = (position: { x: number; z: number }) => {
    const now = performance.now();

    if (now - lastMapSampleAtRef.current < 120) {
      return;
    }

    lastMapSampleAtRef.current = now;
    lastWorldRef.current = { x: position.x, z: position.z };

    const chart = getWorldChart(marina.chartId ?? marina.id);
    const mapAnchor = mapAnchorRef.current;
    let nextCoord: { lat: number; lon: number };

    if (chart) {
      nextCoord = chartToGeo(chart, position.x, position.z);
    } else {
      const deltaX = position.x - mapAnchor.worldPosition.x;
      const deltaZ = position.z - mapAnchor.worldPosition.z;
      const metersPerDegreeLat = 111_320;
      const metersPerDegreeLon =
        111_320 * Math.cos((mapAnchor.coordinate.lat * Math.PI) / 180);

      // World +x is west, so eastward longitude change is -deltaX.
      nextCoord = {
        lat: mapAnchor.coordinate.lat + deltaZ / metersPerDegreeLat,
        lon: mapAnchor.coordinate.lon - deltaX / metersPerDegreeLon,
      };
    }
    setMapBoatCoordinate(nextCoord);
    setBreadcrumb((track) => {
      const next = [...track, nextCoord];
      // Keep last ~800 points (~1–2 minutes at 10 Hz sample equiv)
      return next.slice(-800);
    });
    setBreadcrumbWorld((track) => {
      const previous = track[track.length - 1];
      // A jump this big is a reset or a scene change, not a boat moving.
      const teleported =
        previous !== undefined &&
        Math.hypot(position.x - previous.x, position.z - previous.z) > 200;
      const next = teleported
        ? [{ x: position.x, z: position.z }]
        : [...track, { x: position.x, z: position.z }];
      return next.slice(-800);
    });
    // Live depth from scene geometry
    const meters = estimateDepthMeters(marina, [position.x, position.z]);
    setDepthFeet(meters * 3.28084);
    // Dynamic local current (tide rips etc): mutate environment's currentVelocity
    const current = computeLocalCurrent(marina, position);
    environmentRefState.current.currentVelocity.set(current.x, 0, current.z);

    // Tender auto-return: if active, when close to anchor and slow, stow
    if (tenderAutoReturn?.active && anchor.point && tenderRef.current) {
      const dx = tenderRef.current.position.x - anchor.point.x;
      const dz = tenderRef.current.position.z - anchor.point.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        setTenderActive(false);
        setTenderAutoReturn(null);
      }
    }
  };
  const handleTelemetrySample = useCallback((nextTelemetry: DockingTelemetry) => {
    const now = performance.now();

    if (now - lastTelemetryUpdateAtRef.current < TELEMETRY_UPDATE_INTERVAL_MS) {
      return;
    }

    lastTelemetryUpdateAtRef.current = now;
    setTelemetry(nextTelemetry);
  }, []);
  const handleRestartBoat = useCallback(() => {
    resetBoatTo(selectedSpawn, currentStop.coordinate);
  }, [currentStop.coordinate, resetBoatTo, selectedSpawn]);
  const toggleAnchor = useCallback(() => {
    setAnchor((a) => {
      if (!a.active) {
        // Drop: set point at current world pos; start with 3x scope
        const w = lastWorldRef.current ?? { x: 0, z: 0 };
        const meters = (depthFeet ?? 0) / 3.28084;
        const chain = Math.max(10, meters * 3.5);
        return { active: true, point: { x: w.x, z: w.z }, chainMeters: chain };
      }
      // Retrieve
      setTenderActive(false);
      return { active: false, point: null, chainMeters: 0 };
    });
  }, [depthFeet]);
  const adjustChain = useCallback((deltaMeters: number) => {
    setAnchor((a) => ({ ...a, chainMeters: Math.max(0, Math.min(200, a.chainMeters + deltaMeters)) }));
  }, []);
  const tenderAvailable = anchor.active && anchor.chainMeters > 0 && (anchor.chainMeters / Math.max(1, (depthFeet ?? 0) / 3.28084)) >= 4;
  const toggleTender = useCallback(() => {
    if (!tenderAvailable) return;
    setTenderActive((v) => !v);
  }, [tenderAvailable]);
  const requestTenderReturn = useCallback(() => {
    if (!tenderActive || !anchor.point || !tenderRef.current) return;
    // Mark returning; proximity check will stow when within radius.
    setTenderAutoReturn({ active: true });
  }, [anchor.point, tenderActive]);
  useEffect(() => {
    if (!anchor.active) {
      setTenderActive(false);
    }
  }, [anchor.active]);
  const handleSelectSpawn = (spawnId: string) => {
    const spawn = marina.spawns.find((entry) => entry.id === spawnId);

    if (!spawn) {
      return;
    }

    setSelectedSpawnId(spawn.id);
    setSelectedBerthId(spawn.berthId);
    // Simple Bellingham queue logic: if fuel/pumpout is occupied, place the boat at a nearby holding point.
    if (marina.id === "bellingham-marina") {
      const waitingForFuel =
        spawn.berthId === "fuel-dock" && bellinghamStatus.fuelOccupied;
      const waitingForPumpout =
        spawn.berthId === "pumpout-side" && bellinghamStatus.pumpoutOccupied;
      if (waitingForFuel || waitingForPumpout) {
        const waiting =
          spawn.berthId === "fuel-dock"
            ? { x: -210, z: -140, yawDeg: 40 }
            : { x: -150, z: -60, yawDeg: 35 };
        resetIdRef.current += 1;
        setResetRequest({
          id: resetIdRef.current,
          position: [waiting.x, BOAT_WATERLINE_Y, waiting.z],
          yawDeg: waiting.yawDeg,
        });
        return;
      }
    }

    resetBoatTo(spawn, currentStop.coordinate);
  };
  const handleSelectBerth = (berthId: string) => {
    if (marina.berths.some((berth) => berth.id === berthId)) {
      setSelectedBerthId(berthId);
    }
  };
  const applyStop = useCallback(
    (stop: (typeof scenario.stops)[number]) => {
      const nextMarina = getMarinaLayout(stop.sceneId);
      const spawn = defaultSpawnFor(nextMarina);

      setCurrentStopId(stop.id);
      setSelectedSpawnId(spawn.id);
      setSelectedBerthId(spawn.berthId);
      resetBoatTo(spawn, stop.coordinate);

      const legIndex = scenario.legs.findIndex((leg) => leg.fromStopId === stop.id);

      if (legIndex >= 0) {
        setActiveLegIndex(legIndex);
      }
    },
    [resetBoatTo, scenario],
  );

  const handleSelectStop = (stopId: string) => {
    const stop = scenario.stops.find((entry) => entry.id === stopId);

    if (stop) {
      applyStop(stop);
    }
  };

  const handleResetToStop = (stopId: string) => {
    const stop = scenario.stops.find((entry) => entry.id === stopId);

    if (!stop) {
      return;
    }

    if (!window.confirm(`Move the boat to ${stop.name}?`)) {
      return;
    }

    applyStop(stop);
  };
  const [pendingLocationStopId, setPendingLocationStopId] = useState<string | null>(null);
  const handleOpenLocationDialog = (stopId: string) => {
    setPendingLocationStopId(stopId);
    setHudVisible(true);
  };
  const handleConfirmLocation = () => {
    if (!pendingLocationStopId) return;
    const stop = scenario.stops.find((s) => s.id === pendingLocationStopId);
    setPendingLocationStopId(null);
    if (stop) {
      applyStop(stop);
    }
  };
  const handleCancelLocation = () => setPendingLocationStopId(null);

  return (
    <main className="relative h-dvh min-h-dvh overflow-hidden bg-[#07131c] text-white">
      <Canvas
        className="!absolute !inset-0 !h-full !w-full"
        shadows
        // near=1.5 (vs the 0.1 default) is what keeps coplanar detail — deck
        // caps, rub rails, dock skirts — from z-fighting at plan-view
        // distances; nothing renderable ever gets within 1.5 m of the camera.
        camera={{ position: [28, 18, 38], fov: 42, near: 1.5, far: 5000 }}
        frameloop={plotterExpanded ? "never" : "always"}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#a9c2d2"]} />
        <fog attach="fog" args={["#a9c2d2", 150, 760]} />
        <Sky
          distance={4000}
          sunPosition={[240, 180, 130]}
          turbidity={5.5}
          rayleigh={1.6}
          mieCoefficient={0.004}
          mieDirectionalG={0.8}
        />
        <hemisphereLight args={["#cfe4f2", "#3d4a41", 0.55]} />
        <ambientLight intensity={0.32} />
        <directionalLight
          castShadow
          position={[120, 90, 65]}
          intensity={1.9}
          color="#fff2dd"
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          // Bias kills shadow acne — the flashing shadow-texel squares on
          // decks and cabin tops seen from the plan camera.
          shadow-bias={-0.0002}
          shadow-normalBias={0.5}
          shadow-camera-left={-160}
          shadow-camera-right={160}
          shadow-camera-top={160}
          shadow-camera-bottom={-160}
          shadow-camera-far={600}
        />

        <Water />
        <Wayline
          bodyRef={boatBodyRef}
          layout={marina}
          target={selectedBerth?.center ?? null}
        />
        <DockingCelebration
          active={celebration.active}
          celebrationId={celebration.id}
          berth={selectedBerth}
        />
        <SimCameraRig
          boatLengthM={selectedBoat.lengthM}
          bodyRef={boatBodyRef}
          tenderBodyRef={tenderRef as any}
          pitchOffset={viewportCamera.pitch}
          planZoom={planZoom}
          turboCinematic={turboAnnouncement.visible}
          viewMode={tenderActive ? "tender" : viewMode}
          yawOffset={viewportCamera.yaw}
        />

        <Physics
          gravity={[0, 0, 0]}
          colliders={false}
          contactNaturalFrequency={12}
          numSolverIterations={8}
          timeStep={1 / 60}
        >
          <Marina
            layout={marina}
            selectedBerthId={selectedBerth?.id ?? null}
            docked={guidance?.docked ?? false}
          />
          <HazardSpawners
            activeSpawn={selectedSpawn}
            layout={marina}
            onUpdate={setHazards}
          />
          <Wildlife regionKey={marina.id} />
          <MooredBoats layout={marina} />
          <MarinaTraffic
            layout={marina}
            onTraffic={setTrafficTargets}
            playerBodyRef={boatBodyRef}
          />
          <ImpactMarks incidents={incidents} />
          {tenderActive && anchor.point ? (
            <TenderCraft
              origin={anchor.point}
              onReturn={() => {
                setTenderActive(false);
                setTenderAutoReturn(null);
              }}
              onAttach={(obj) => (tenderRef.current = obj)}
            />
          ) : null}
          <Boat
            bodyRef={boatBodyRef}
            boat={selectedBoat}
            controls={controls}
            engineState={engineState}
            environment={environmentRefState.current}
            anchorConfig={
              anchor.active && anchor.point
                ? {
                    active: true,
                    point: anchor.point,
                    chainMeters: anchor.chainMeters,
                    stiffness: 650, // N/m
                    damping: 220, // N per m/s
                  }
                : null
            }
            hullDamageMarks={incidents}
            initialPose={spawnToPose(initialSpawn)}
            onImpact={handleImpact}
            onPositionSample={handleBoatPositionSample}
            onTelemetry={handleTelemetrySample}
            resetRequest={resetRequest}
            turboActive={turboActive}
          />
        </Physics>
      </Canvas>

      {turboAnnouncement.visible ? (
        <TurboModeOverlay key={turboAnnouncement.id} />
      ) : null}

      <DamageOverlay hullIntegrityPct={hullIntegrityPct} incidents={incidents} selectedBoat={selectedBoat} />

      <DockingOverlay
        audioEnabled={engineAudio.audioEnabled}
        audioSupported={engineAudio.audioSupported}
        controls={controls}
        mapBoatCoordinate={mapBoatCoordinate}
        depthFeet={depthFeet ?? undefined}
        plotterTrack={breadcrumb}
        plotterWorldTrack={breadcrumbWorld}
        scenario={scenario}
        engineState={engineState}
        telemetry={telemetry}
        activeLegIndex={activeLegIndex}
        availableBoats={BOAT_CATALOG}
        conditionsMode={conditionsMode}
        currentStopId={currentStop.id}
        guidance={guidance}
        hardwareHelmConnected={hardwareHelmConnected}
        onSelectStop={handleSelectStop}
        hudVisible={hudVisible}
        leversSwapped={leversSwapped}
        marina={marina}
        onCalibrateQuadrantIdle={handleCalibrateQuadrantIdle}
        onClearQuadrantIdle={handleClearQuadrantIdle}
        onToggleHud={() => setHudVisible((value) => !value)}
        onToggleLeverSwap={handleToggleLeverSwap}
        quadrantIdleCalibrated={quadrantIdle !== null}
        onConditionsModeChange={setConditionsMode}
        onEnableAudio={engineAudio.enableAudio}
        onEnableEngines={handleEnableBothEngines}
        onRestartBoat={handleRestartBoat}
        onSelectBerth={handleSelectBerth}
        onSelectSpawn={handleSelectSpawn}
        onStartEngines={handleStartEngines}
        onToggleAnchor={toggleAnchor}
        onAdjustChain={adjustChain}
        onToggleTender={toggleTender}
        tenderAvailable={tenderAvailable}
        tenderActive={tenderActive}
        onRequestTenderReturn={requestTenderReturn}
        onTogglePortEngine={handleTogglePortEngine}
        onToggleStarboardEngine={handleToggleStarboardEngine}
        selectedBerth={selectedBerth}
        selectedBoat={selectedBoat}
        selectedSpawn={selectedSpawn}
        vhfRadio={vhfRadio}
        onBoatChange={handleBoatChange}
        onSelectLeg={setActiveLegIndex}
        onResetToStop={handleResetToStop}
        onOpenLocationDialog={handleOpenLocationDialog}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        viewportBindings={viewportCamera.viewportBindings}
        viewportDragging={viewportCamera.dragging}
        onViewportWheel={handleViewportWheel}
        plotterExpanded={plotterExpanded}
        onPlotterExpandedChange={setPlotterExpanded}
        trafficTargets={trafficTargets}
        bellinghamStatus={bellinghamStatus}
        anchorActive={anchor.active}
        anchorPoint={anchor.point}
        chainMeters={anchor.chainMeters}
      />
      {pendingLocationStopId ? (
        <LocationConfirmDialog
          stopId={pendingLocationStopId}
          scenario={scenario}
          conditionsMode={conditionsMode}
          onCancel={handleCancelLocation}
          onConfirm={handleConfirmLocation}
        />
      ) : null}
    </main>
  );
}

function LocationConfirmDialog({
  stopId,
  scenario,
  conditionsMode,
  onCancel,
  onConfirm,
}: {
  stopId: string;
  scenario: typeof SAN_JUAN_AUG_2026_SCENARIO;
  conditionsMode: "typical" | "calm";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const stop = scenario.stops.find((s) => s.id === stopId);
  if (!stop) return null;
  const nextMarina = getMarinaLayout(stop.sceneId);
  const windTowardDeg = ((-nextMarina.conditions.windTowardDeg % 360) + 360) % 360;
  const windFromDeg = (windTowardDeg + 180) % 360;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
      <div className="pointer-events-auto w-[28rem] max-w-full rounded-3xl border border-white/14 bg-slate-950/85 px-6 py-6 text-center shadow-2xl backdrop-blur-xl">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-cyan-100/70">
          Location Switcher
        </p>
        <p className="mt-1 text-lg font-semibold text-white">{stop.name}</p>
        <p className="mt-1 text-[0.68rem] text-slate-400">{nextMarina.name}</p>
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[0.75rem] text-slate-300">
          {conditionsMode === "calm" ? (
            <p>Practice mode: no wind or current</p>
          ) : (
            <p>
              Wind {nextMarina.conditions.windKnots.toFixed(0)} kn from{" "}
              {Math.round(windFromDeg).toString().padStart(3, "0")}T · Current{" "}
              {nextMarina.conditions.currentKnots.toFixed(1)} kn →
              {(((-nextMarina.conditions.currentTowardDeg % 360) + 360) % 360)
                .toFixed(0)
                .padStart(3, "0")}
              T
            </p>
          )}
        </div>
        {nextMarina.briefing.length ? (
          <ul className="mt-3 space-y-1 text-left text-[0.8rem] leading-snug text-slate-300">
            {nextMarina.briefing.slice(0, 4).map((line) => (
              <li key={line} className="flex gap-1.5">
                <span className="text-sky-300/70">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-sky-300/35 bg-sky-300/12 px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-sky-100 transition hover:bg-sky-300/20"
          >
            Move Here
          </button>
        </div>
      </div>
    </div>
  );
}
