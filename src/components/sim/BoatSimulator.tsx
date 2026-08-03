"use client";

import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Physics, type RapierRigidBody } from "@react-three/rapier";
import type { WheelEventHandler } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BOAT_CATALOG, DEFAULT_BOAT_SLUG, getBoatProfile } from "@/lib/boats/catalog";
import { useGamepad } from "@/hooks/useGamepad";
import { useEngineAudio } from "@/hooks/useEngineAudio";
import { useEngineState } from "@/hooks/useEngineState";
import { useVhfRadio } from "@/hooks/useVhfRadio";
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
import {
  type ImpactIncident,
  ImpactTracker,
  type RawImpact,
} from "@/lib/sim/collision-damage";
import { useViewportCamera } from "@/hooks/useViewportCamera";

import { Boat } from "./Boat";
import { DamageOverlay } from "./DamageOverlay";
import { DockingCelebration } from "./DockingCelebration";
import { DockingOverlay } from "./DockingOverlay";
import { ImpactMarks } from "./ImpactMarks";
import { Marina } from "./Marina";
import { MarinaTraffic } from "./MarinaTraffic";
import { MooredBoats } from "./MooredBoats";
import { SimCameraRig } from "./SimCameraRig";
import { TurboModeOverlay } from "./TurboModeOverlay";
import { Wayline } from "./Wayline";
import { Water } from "./Water";

type BoatSimulatorProps = {
  initialBoatSlug?: string;
};

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
  const [viewMode, setViewMode] = useState<"plan" | "forward">("plan");
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
  const [leversSwapped, setLeversSwapped] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("boat-sim:levers-swapped") === "1",
  );
  const [quadrantIdle, setQuadrantIdle] = useState<{
    port: number;
    starboard: number;
  } | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const stored = window.localStorage.getItem("boat-sim:quadrant-idle");
      const parsed = stored ? JSON.parse(stored) : null;

      if (
        parsed &&
        typeof parsed.port === "number" &&
        typeof parsed.starboard === "number"
      ) {
        return parsed;
      }
    } catch {
      // fall through to uncalibrated
    }

    return null;
  });

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
  const environment = useMemo(
    () =>
      conditionsMode === "calm"
        ? CALM_TEST_ENVIRONMENT
        : buildEnvironment(marina.conditions),
    [conditionsMode, marina.conditions],
  );
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
  const handleViewModeChange = (mode: "plan" | "forward") => {
    viewportCamera.resetView();
    setViewMode(mode);
  };
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

    const anchor = mapAnchorRef.current;
    const deltaX = position.x - anchor.worldPosition.x;
    const deltaZ = position.z - anchor.worldPosition.z;
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLon =
      111_320 * Math.cos((anchor.coordinate.lat * Math.PI) / 180);

    // World +x is west, so eastward longitude change is -deltaX.
    setMapBoatCoordinate({
      lat: anchor.coordinate.lat + deltaZ / metersPerDegreeLat,
      lon: anchor.coordinate.lon - deltaX / metersPerDegreeLon,
    });
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
  const handleSelectSpawn = (spawnId: string) => {
    const spawn = marina.spawns.find((entry) => entry.id === spawnId);

    if (!spawn) {
      return;
    }

    setSelectedSpawnId(spawn.id);
    setSelectedBerthId(spawn.berthId);
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

  return (
    <main className="relative h-dvh min-h-dvh overflow-hidden bg-[#07131c] text-white">
      <Canvas
        className="!absolute !inset-0 !h-full !w-full"
        shadows
        // near=1.5 (vs the 0.1 default) is what keeps coplanar detail — deck
        // caps, rub rails, dock skirts — from z-fighting at plan-view
        // distances; nothing renderable ever gets within 1.5 m of the camera.
        camera={{ position: [28, 18, 38], fov: 42, near: 1.5, far: 5000 }}
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
          pitchOffset={viewportCamera.pitch}
          planZoom={planZoom}
          turboCinematic={turboAnnouncement.visible}
          viewMode={viewMode}
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
          <MooredBoats layout={marina} />
          <MarinaTraffic layout={marina} playerBodyRef={boatBodyRef} />
          <ImpactMarks incidents={incidents} />
          <Boat
            bodyRef={boatBodyRef}
            boat={selectedBoat}
            controls={controls}
            engineState={engineState}
            environment={environment}
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

      <DamageOverlay hullIntegrityPct={hullIntegrityPct} incidents={incidents} />

      <DockingOverlay
        audioEnabled={engineAudio.audioEnabled}
        audioSupported={engineAudio.audioSupported}
        controls={controls}
        mapBoatCoordinate={mapBoatCoordinate}
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
        onTogglePortEngine={handleTogglePortEngine}
        onToggleStarboardEngine={handleToggleStarboardEngine}
        selectedBerth={selectedBerth}
        selectedBoat={selectedBoat}
        selectedSpawn={selectedSpawn}
        vhfRadio={vhfRadio}
        onBoatChange={handleBoatChange}
        onSelectLeg={setActiveLegIndex}
        onResetToStop={handleResetToStop}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        viewportBindings={viewportCamera.viewportBindings}
        viewportDragging={viewportCamera.dragging}
        onViewportWheel={handleViewportWheel}
      />
    </main>
  );
}
