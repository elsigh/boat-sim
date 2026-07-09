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
import { useViewportCamera } from "@/hooks/useViewportCamera";

import { BerthBearingLine } from "./BerthBearingLine";
import { Boat } from "./Boat";
import { DockingCelebration } from "./DockingCelebration";
import { DockingOverlay } from "./DockingOverlay";
import { Marina } from "./Marina";
import { SimCameraRig } from "./SimCameraRig";
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
      celebrationArmedRef.current = false;
      setCelebration((current) =>
        current.active ? { ...current, active: false } : current,
      );

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

  const waylinePoints = useMemo(() => {
    if (!selectedBerth) {
      return [];
    }

    return marina.approachLines?.[selectedBerth.id] ?? [];
  }, [marina.approachLines, selectedBerth]);

  return (
    <main className="relative h-dvh min-h-dvh overflow-hidden bg-[#07131c] text-white">
      <Canvas
        className="!absolute !inset-0 !h-full !w-full"
        shadows
        camera={{ position: [28, 18, 38], fov: 42 }}
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
          shadow-camera-left={-160}
          shadow-camera-right={160}
          shadow-camera-top={160}
          shadow-camera-bottom={-160}
          shadow-camera-far={600}
        />

        <Water />
        <Wayline points={waylinePoints} />
        <BerthBearingLine bodyRef={boatBodyRef} berth={selectedBerth} />
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
          <Boat
            bodyRef={boatBodyRef}
            boat={selectedBoat}
            controls={controls}
            engineState={engineState}
            environment={environment}
            initialPose={spawnToPose(initialSpawn)}
            onPositionSample={handleBoatPositionSample}
            onTelemetry={handleTelemetrySample}
            resetRequest={resetRequest}
          />
        </Physics>
      </Canvas>

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
