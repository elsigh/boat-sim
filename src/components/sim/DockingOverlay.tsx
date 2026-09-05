"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEventHandler, WheelEventHandler } from "react";

import type { BoatProfile } from "@/lib/boats/catalog";
import { helmCssVars, helmThemeFor } from "@/lib/boats/helm-theme";
import { getChart } from "@/lib/charts";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { EngineChannelState, TwinEngineState } from "@/hooks/useEngineState";
import type { VhfRadioState } from "@/hooks/useVhfRadio";
import type { Berth, MarinaLayout, SpawnPoint } from "@/lib/marinas/types";
import type { CruiseScenario } from "@/lib/scenarios/san-juan-aug-2026";
import type { BerthGuidance } from "@/lib/sim/berth-guidance";
import type { DockingTelemetry } from "@/lib/sim/boat-physics";
import { draftFeet as draftFeetFor } from "@/lib/boats/stats";
import type { TrafficTarget } from "./MarinaTraffic";

import type { ChartMode } from "@/lib/charts/palette";
import { geoToChart } from "@/lib/charts";
import { useTimelineImport } from "@/hooks/useTimelineImport";

import { ChartPlotter, type PlotterRange, rangeForDistance } from "./helm/ChartPlotter";
import {
  HelmActionButton,
  HelmButton,
  HelmSegmented,
  HelmSelect,
} from "./helm/Controls";
import {
  DepthSounder,
  FlowDial,
  Tachometer,
} from "./helm/Instruments";
import { Chip, Lamp, Metric, Panel, PanelHeader, PanelLabel, Readout, Well } from "./helm/Panel";
import { TimelineImportPanel } from "./helm/TimelineImportPanel";

type ViewMode = "plan" | "forward" | "backward";

type DockingOverlayProps = {
  activeLegIndex: number;
  audioEnabled: boolean;
  audioSupported: boolean;
  availableBoats: BoatProfile[];
  conditionsMode: "typical" | "calm";
  controls: GamepadSnapshot;
  currentStopId: string;
  depthFeet?: number;
  engineState: TwinEngineState;
  guidance: BerthGuidance | null;
  hardwareHelmConnected: boolean;
  onSelectStop: (stopId: string) => void;
  hudVisible: boolean;
  leversSwapped: boolean;
  mapBoatCoordinate: { lat: number; lon: number } | null;
  plotterTrack?: Array<{ lat: number; lon: number }>;
  plotterWorldTrack?: Array<{ x: number; z: number }>;
  marina: MarinaLayout;
  onCalibrateQuadrantIdle: () => void;
  onClearQuadrantIdle: () => void;
  onToggleHud: () => void;
  onToggleLeverSwap: () => void;
  onToggleAnchor?: () => void;
  onAdjustChain?: (deltaMeters: number) => void;
  onToggleTender?: () => void;
  tenderAvailable?: boolean;
  tenderActive?: boolean;
  onRequestTenderReturn?: () => void;
  onBoatChange: (slug: string) => void;
  quadrantIdleCalibrated: boolean;
  onConditionsModeChange: (mode: "typical" | "calm") => void;
  onEnableEngines: () => void;
  onEnableAudio: (nextEnabled?: boolean) => void;
  onRestartBoat: () => void;
  onSelectBerth: (berthId: string) => void;
  onSelectSpawn: (spawnId: string) => void;
  onStartEngines: () => void;
  onSelectLeg: (index: number) => void;
  onResetToStop: (stopId: string) => void;
  onOpenLocationDialog?: (stopId: string) => void;
  onTogglePortEngine: () => void;
  onToggleStarboardEngine: () => void;
  selectedBerth: Berth | null;
  selectedBoat: BoatProfile;
  selectedSpawn: SpawnPoint;
  vhfRadio: VhfRadioState;
  onViewportWheel: WheelEventHandler<HTMLDivElement>;
  scenario: CruiseScenario;
  telemetry: DockingTelemetry;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewportBindings: {
    onPointerCancel: PointerEventHandler<HTMLDivElement>;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
  };
  viewportDragging: boolean;
  /** Lifted so the simulator can idle its render loop behind the full-screen chart. */
  plotterExpanded: boolean;
  onPlotterExpandedChange: (expanded: boolean) => void;
  /** Vessels under way, shown as AIS targets on the plotter. */
  trafficTargets?: TrafficTarget[];
  bellinghamStatus?: { fuelOccupied: boolean; pumpoutOccupied: boolean };
  anchorActive?: boolean;
  anchorPoint?: { x: number; z: number } | null;
  chainMeters?: number;
};

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

function formatHeading(value: number) {
  return (Math.round(((value % 360) + 360) % 360) % 360).toString().padStart(3, "0");
}

function stopPointerPropagation(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

/** Chart-frame angles are stored world-frame (mirrored); compass is the negation. */
function toCompass(worldDeg: number) {
  return ((-worldDeg % 360) + 360) % 360;
}

export function DockingOverlay(props: DockingOverlayProps) {
  const {
    audioEnabled,
    audioSupported,
    availableBoats,
    conditionsMode,
    currentStopId,
    depthFeet,
    engineState,
    guidance,
    hudVisible,
    marina,
    onToggleHud,
    onBoatChange,
    onConditionsModeChange,
    onEnableAudio,
    onRestartBoat,
    onSelectBerth,
    onSelectSpawn,
    onSelectStop,
    onStartEngines,
    onTogglePortEngine,
    onToggleStarboardEngine,
    plotterWorldTrack,
    scenario,
    selectedBerth,
    selectedBoat,
    selectedSpawn,
    telemetry,
    vhfRadio,
    viewMode,
    onViewModeChange,
    onViewportWheel,
    viewportBindings,
    viewportDragging,
    plotterExpanded,
    onPlotterExpandedChange,
    trafficTargets,
    bellinghamStatus,
    anchorActive,
    anchorPoint,
    chainMeters,
  } = props;

  const theme = useMemo(() => helmThemeFor(selectedBoat), [selectedBoat]);
  const themeVars = useMemo(() => helmCssVars(theme), [theme]);
  // The plotter draws in the chart frame (x east), so it takes the unmirrored
  // chart and converts the world-frame boat, track and berth itself.
  const chart = useMemo(() => getChart(marina.chartId ?? marina.id), [marina]);

  const [boatPanelExpanded, setBoatPanelExpanded] = useState(false);
  const [plotterNorthUp, setPlotterNorthUp] = useState(true);
  const [plotterRange, setPlotterRange] = useState<PlotterRange>(600);
  const [chartMode, setChartMode] = useState<ChartMode>("day");
  const [timelinePanelOpen, setTimelinePanelOpen] = useState(false);
  const [plotterFocus, setPlotterFocus] = useState<{
    x: number;
    z: number;
    nonce: number;
  } | null>(null);

  // Imported "where we actually went" tracks. The state lives here so the
  // overlay survives collapsing and reopening the plotter.
  const timeline = useTimelineImport();

  const enginesRunning = engineState.port.running && engineState.starboard.running;
  const worldTrack = plotterWorldTrack ?? [];
  const boatWorld = worldTrack.length > 0 ? worldTrack[worldTrack.length - 1] : null;
  const draft = draftFeetFor(selectedBoat);
  // What the plotter shades as shoal: draft plus a metre of margin, which is
  // the same thing Garmin's "safe depth" setting means.
  const safeDepthM = draft * 0.3048 + 1;

  // Pick a plotter range that frames the run in whenever the exercise changes,
  // so a two-mile passage doesn't open on a 600 m screen showing empty water.
  const lastFramedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${selectedSpawn.id}:${selectedBerth?.id ?? ""}`;

    if (lastFramedRef.current === key || !selectedBerth) {
      return;
    }

    lastFramedRef.current = key;
    const distance = Math.hypot(
      selectedSpawn.position[0] - selectedBerth.center[0],
      selectedSpawn.position[1] - selectedBerth.center[1],
    );
    setPlotterRange(rangeForDistance(Math.max(120, distance), chart ?? undefined));
  }, [chart, selectedBerth, selectedSpawn]);

  /**
   * Frame the imported track. It routinely runs past the edge of one harbour's
   * survey, so this deliberately allows a range wider than the chart — you end
   * up looking at the track over the no-data area, which is the honest picture.
   */
  const fitImportedTrack = () => {
    if (!chart || !timeline.track) {
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const point of timeline.track.points) {
      const [x, z] = geoToChart(chart, point.lat, point.lon);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    if (!Number.isFinite(minX)) {
      return;
    }

    const spanZ = Math.max(maxZ - minZ, (maxX - minX) * 0.5, 200);
    setPlotterRange(spanZ * 0.62);
    setPlotterFocus((current) => ({
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 p-3 text-white lg:p-4"
      style={{ ...themeVars, fontFamily: "var(--helm-font-body)" }}
    >
      <div
        {...viewportBindings}
        onWheel={onViewportWheel}
        className={`pointer-events-auto absolute inset-0 ${
          viewportDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      />

      {/* Keep the compact helm available when the desktop columns do not fit. */}
      <div className="pointer-events-auto absolute right-3 top-3 z-20 lg:hidden">
        <CameraPanel
          audioEnabled={audioEnabled}
          audioSupported={audioSupported}
          onEnableAudio={onEnableAudio}
          onToggleHud={onToggleHud}
          onViewModeChange={onViewModeChange}
          viewMode={viewMode}
        />
      </div>
      {hudVisible ? (
        <div className="absolute inset-0 lg:hidden">
          <MinimalHud
            engineState={engineState}
            guidance={guidance}
            onToggleHud={onToggleHud}
            selectedSpawn={selectedSpawn}
            telemetry={telemetry}
          />
        </div>
      ) : null}

      {!hudVisible ? (
        <>
          <div className="pointer-events-auto absolute right-4 top-4 z-20 hidden lg:block">
            <CameraPanel
              audioEnabled={audioEnabled}
              audioSupported={audioSupported}
              onEnableAudio={onEnableAudio}
              onToggleHud={onToggleHud}
              onViewModeChange={onViewModeChange}
              viewMode={viewMode}
            />
          </div>
          <MinimalHud
            engineState={engineState}
            guidance={guidance}
            onToggleHud={onToggleHud}
            selectedSpawn={selectedSpawn}
            telemetry={telemetry}
          />
        </>
      ) : (
        <>
          {/* Left column: what you're driving and what you're practising. */}
          <div className="pointer-events-auto absolute inset-y-3 left-3 hidden w-[clamp(18rem,23vw,21.5rem)] flex-col gap-3 overflow-y-auto pr-1 lg:flex lg:inset-y-4 lg:left-4">
            <BoatPlate
              availableBoats={availableBoats}
              expanded={boatPanelExpanded}
              onBoatChange={onBoatChange}
              onToggle={() => setBoatPanelExpanded((value) => !value)}
              selectedBoat={selectedBoat}
            />

            <ExercisePanel
              bellinghamStatus={bellinghamStatus}
              conditionsMode={conditionsMode}
              currentStopId={currentStopId}
              guidance={guidance}
              marina={marina}
              onConditionsModeChange={onConditionsModeChange}
              onRestart={onRestartBoat}
              onSelectBerth={onSelectBerth}
              onSelectSpawn={onSelectSpawn}
              onSelectStop={onSelectStop}
              scenario={scenario}
              selectedBerth={selectedBerth}
              selectedSpawn={selectedSpawn}
            />
          </div>

          {/* Right column: the instruments. */}
          <div className="pointer-events-auto absolute bottom-3 right-4 top-4 hidden w-[clamp(17rem,21vw,20rem)] flex-col gap-2 overflow-y-auto pl-1 lg:flex [&>div]:shrink-0">
            <div className="flex justify-end">
              <CameraPanel
                audioEnabled={audioEnabled}
                audioSupported={audioSupported}
                onEnableAudio={onEnableAudio}
                onToggleHud={onToggleHud}
                onViewModeChange={onViewModeChange}
                viewMode={viewMode}
              />
            </div>

            <RadioPanel radio={vhfRadio} channel={marina.vhfChannel} />

            <EnginePanel
              engineState={engineState}
              instrument={theme.instrument}
              onTogglePort={onTogglePortEngine}
              onToggleStarboard={onToggleStarboardEngine}
            />

            <ConditionsPanel
              conditionsMode={conditionsMode}
              depthFeet={depthFeet}
              draftFeet={draft}
              headingDeg={telemetry.headingDeg}
              marina={marina}
              sogKnots={telemetry.speedKnots}
              stwKnots={telemetry.speedThroughWaterKnots}
            />

            {chart && !plotterExpanded ? (
              <Panel glass={false}>
                <ChartPlotter
                  anchor={anchorActive ? (anchorPoint ?? null) : null}
                  berth={selectedBerth}
                  boat={boatWorld}
                  chainMeters={chainMeters}
                  chart={chart}
                  headingDeg={telemetry.headingDeg}
                  height="clamp(8rem, calc(100dvh - 37rem), 15.5rem)"
                  layout={marina}
                  importedTrack={timeline.track}
                  mode={chartMode}
                  northUp={plotterNorthUp}
                  onModeChange={setChartMode}
                  onExpand={() => onPlotterExpandedChange(true)}
                  onRangeChange={setPlotterRange}
                  onToggleNorthUp={() => setPlotterNorthUp((value) => !value)}
                  rangeM={plotterRange}
                  safeDepthM={safeDepthM}
                  showImportedTrack={timeline.visible}
                  sogKnots={telemetry.speedKnots}
                  theme={theme}
                  track={worldTrack}
                  traffic={trafficTargets}
                />
              </Panel>
            ) : null}
          </div>
        </>
      )}

      {!enginesRunning ? (
        <EngineStartOverlay
          boatName={selectedBoat.displayName}
          engineNotes={selectedBoat.stats.engineNotes}
          engineState={engineState}
          marinaName={marina.name}
          onStartEngines={onStartEngines}
        />
      ) : null}

      {plotterExpanded && chart ? (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-[min(96vw,1500px)]">
            <Panel glass={false}>
              <ChartPlotter
                anchor={anchorActive ? (anchorPoint ?? null) : null}
                berth={selectedBerth}
                boat={boatWorld}
                chainMeters={chainMeters}
                chart={chart}
                headingDeg={telemetry.headingDeg}
                height="min(78vh, 900px)"
                layout={marina}
                focus={plotterFocus}
                headerExtra={
                  <HelmButton
                    size="sm"
                    tone="accent"
                    active={timelinePanelOpen || Boolean(timeline.track)}
                    onClick={() => setTimelinePanelOpen((open) => !open)}
                    title="Import a Google Maps Timeline track"
                  >
                    Track
                  </HelmButton>
                }
                importedTrack={timeline.track}
                mode={chartMode}
                northUp={plotterNorthUp}
                onModeChange={setChartMode}
                onCollapse={() => onPlotterExpandedChange(false)}
                onRangeChange={setPlotterRange}
                onToggleNorthUp={() => setPlotterNorthUp((value) => !value)}
                rangeM={plotterRange}
                safeDepthM={safeDepthM}
                showImportedTrack={timeline.visible}
                sogKnots={telemetry.speedKnots}
                theme={theme}
                track={worldTrack}
                traffic={trafficTargets}
              >
                {timelinePanelOpen ? (
                  <TimelineImportPanel
                    canFit={Boolean(timeline.track)}
                    onClose={() => setTimelinePanelOpen(false)}
                    onFit={fitImportedTrack}
                    timeline={timeline}
                  />
                ) : null}
              </ChartPlotter>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CameraPanel({
  audioEnabled,
  audioSupported,
  onEnableAudio,
  onToggleHud,
  onViewModeChange,
  viewMode,
}: {
  audioEnabled: boolean;
  audioSupported: boolean;
  onEnableAudio: (nextEnabled?: boolean) => void;
  onToggleHud: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  viewMode: ViewMode;
}) {
  return (
    <Panel>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <HelmSegmented<ViewMode>
          value={viewMode}
          onChange={onViewModeChange}
          options={[
            { value: "plan", label: "Top" },
            { value: "forward", label: "Fwd" },
            { value: "backward", label: "Aft" },
          ]}
        />
        <HelmButton
          size="sm"
          tone="good"
          active={audioEnabled}
          disabled={!audioSupported}
          onClick={() => onEnableAudio(!audioEnabled)}
          ariaLabel={
            !audioSupported ? "Audio unsupported" : audioEnabled ? "Mute audio" : "Enable audio"
          }
        >
          <AudioIcon enabled={audioEnabled} muted={!audioSupported || !audioEnabled} />
        </HelmButton>
        <HelmButton className="hidden lg:inline-flex" size="sm" onClick={onToggleHud} title="Hide panels (H)">
          H
        </HelmButton>
      </div>
    </Panel>
  );
}

// --- left column --------------------------------------------------------------

function BoatPlate({
  availableBoats,
  expanded,
  onBoatChange,
  onToggle,
  selectedBoat,
}: {
  availableBoats: BoatProfile[];
  expanded: boolean;
  onBoatChange: (slug: string) => void;
  onToggle: () => void;
  selectedBoat: BoatProfile;
}) {
  return (
    <Panel className="shrink-0">
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <PanelLabel dim className="!text-[0.62rem]">
            Active boat
          </PanelLabel>
          <p
            className="mt-1 truncate text-[1.05rem] leading-tight"
            style={{
              fontFamily: "var(--helm-font-label)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--helm-text)",
            }}
          >
            {selectedBoat.displayName}
          </p>
          <p className="truncate text-[0.8rem]" style={{ color: "var(--helm-text-dim)" }}>
            {selectedBoat.manufacturer} {selectedBoat.model}
          </p>
        </div>
        <HelmButton size="sm" onClick={onToggle} ariaLabel={expanded ? "Collapse" : "Expand"}>
          {expanded ? "−" : "+"}
        </HelmButton>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 pb-2.5">
        <Metric label="LOA" value={selectedBoat.stats.loa} />
        <Metric label="Beam" value={selectedBoat.stats.beam} />
        <Metric label="Draft" value={selectedBoat.stats.draft} />
      </div>

      {expanded ? (
        <div className="space-y-2.5 px-3 pb-3">
          <HelmSelect
            label="Switch boat"
            value={selectedBoat.profileSlug}
            onChange={onBoatChange}
            options={availableBoats.map((boat) => ({
              value: boat.profileSlug,
              label: `${boat.displayName} · ${boat.manufacturer} ${boat.model}`,
            }))}
          />
          <Well className="px-2.5 py-2">
            <p className="text-[0.82rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
              {selectedBoat.summary}
            </p>
          </Well>
          <div className="flex items-center justify-between gap-2">
            <Chip tone={selectedBoat.simStatus === "ready" ? "good" : "warn"}>
              {selectedBoat.simStatus}
            </Chip>
            <div className="flex items-center gap-2">
              <Link
                href={`/boats/${selectedBoat.profileSlug}`}
                className="text-[0.72rem] uppercase tracking-[0.18em] underline underline-offset-4"
                style={{ color: "var(--helm-accent)", fontFamily: "var(--helm-font-label)" }}
              >
                Profile
              </Link>
              <Link
                href="/boats"
                className="text-[0.72rem] uppercase tracking-[0.18em] underline underline-offset-4"
                style={{ color: "var(--helm-text-dim)", fontFamily: "var(--helm-font-label)" }}
              >
                All boats
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ExercisePanel({
  bellinghamStatus,
  conditionsMode,
  currentStopId,
  guidance,
  marina,
  onConditionsModeChange,
  onRestart,
  onSelectBerth,
  onSelectSpawn,
  onSelectStop,
  scenario,
  selectedBerth,
  selectedSpawn,
}: {
  bellinghamStatus?: { fuelOccupied: boolean; pumpoutOccupied: boolean };
  conditionsMode: "typical" | "calm";
  currentStopId: string;
  guidance: BerthGuidance | null;
  marina: MarinaLayout;
  onConditionsModeChange: (mode: "typical" | "calm") => void;
  onRestart: () => void;
  onSelectBerth: (berthId: string) => void;
  onSelectSpawn: (spawnId: string) => void;
  onSelectStop: (stopId: string) => void;
  scenario: CruiseScenario;
  selectedBerth: Berth | null;
  selectedSpawn: SpawnPoint;
}) {
  const [briefingOpen, setBriefingOpen] = useState(false);

  const locationStops = useMemo(() => {
    const seen = new Set<string>();
    return scenario.stops.filter((stop) => {
      if (seen.has(stop.sceneId)) {
        return false;
      }
      seen.add(stop.sceneId);
      return true;
    });
  }, [scenario.stops]);

  const currentSceneId = scenario.stops.find((stop) => stop.id === currentStopId)?.sceneId;
  const selectedLocationId =
    locationStops.find((stop) => stop.sceneId === currentSceneId)?.id ?? locationStops[0]?.id;

  const isDeparture = selectedSpawn.kind === "departure";
  const docked = !isDeparture && Boolean(guidance?.docked);
  const departed = isDeparture && guidance !== null && guidance.rangeM > 25;
  const hotApproach =
    !isDeparture && guidance !== null && guidance.rangeM < 45 && guidance.closureKnots > 1.2;

  return (
    <Panel className="shrink-0">
      <PanelHeader
        title="Docking practice"
        right={
          <>
            {marina.vhfChannel ? <Chip>VHF {marina.vhfChannel}</Chip> : null}
            <HelmButton size="sm" onClick={onRestart} ariaLabel="Restart exercise" title="Restart exercise">
              ↻ Restart
            </HelmButton>
          </>
        }
      />

      {marina.id === "bellingham-marina" && bellinghamStatus ? (
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          <Chip tone={bellinghamStatus.fuelOccupied ? "danger" : "good"}>
            Fuel {bellinghamStatus.fuelOccupied ? "occupied" : "open"}
          </Chip>
          <Chip tone={bellinghamStatus.pumpoutOccupied ? "warn" : "good"}>
            Pumpout {bellinghamStatus.pumpoutOccupied ? "occupied" : "open"}
          </Chip>
        </div>
      ) : null}

      <div className="space-y-2 px-3 pb-2">
        <HelmSelect
          label="Location"
          value={selectedLocationId}
          onChange={onSelectStop}
          options={locationStops.map((stop) => ({ value: stop.id, label: stop.name }))}
          hint={marina.name}
        />

        <HelmSelect
          label="Exercise"
          value={selectedSpawn.id}
          onChange={onSelectSpawn}
          options={marina.spawns.map((spawn) => ({ value: spawn.id, label: spawn.label }))}
          hint={
            selectedSpawn.brief ? (
              <span>
                {selectedSpawn.range ? (
                  <span
                    className="mr-1.5 uppercase"
                    style={{ color: "var(--helm-accent)", letterSpacing: "0.14em" }}
                  >
                    {selectedSpawn.range}
                  </span>
                ) : null}
                {selectedSpawn.brief}
              </span>
            ) : undefined
          }
        />

        {marina.berths.length > 1 ? (
          <HelmSelect
            label="Target berth"
            value={selectedBerth?.id ?? ""}
            onChange={onSelectBerth}
            options={marina.berths.map((berth) => ({ value: berth.id, label: berth.label }))}
          />
        ) : null}
      </div>

      {docked || departed || hotApproach ? (
        <div className="px-3 pb-2">
          <StatusBanner
            tone={hotApproach ? "warn" : "good"}
            text={
              docked
                ? "Docked — get your lines across"
                : departed
                  ? "Clear of the berth — under way"
                  : "Hot approach — come back on the levers"
            }
          />
        </div>
      ) : null}

      <div className="px-3 pb-2">
        <Well className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <PanelLabel dim className="!text-[0.62rem]">
              Conditions
            </PanelLabel>
            <p
              className="mt-1 text-[0.78rem] leading-snug"
              style={{ color: "var(--helm-text-dim)" }}
            >
              {conditionsMode === "calm" ? "Practice mode — no wind or current" : marina.conditions.summary}
            </p>
          </div>
          <HelmSegmented
            value={conditionsMode}
            onChange={onConditionsModeChange}
            options={[
              { value: "typical", label: "Typical" },
              { value: "calm", label: "Calm" },
            ]}
          />
        </Well>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onClick={() => setBriefingOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 transition hover:bg-white/5"
          style={{
            background: "var(--helm-well)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <PanelLabel dim className="!text-[0.62rem]">
            Local knowledge
          </PanelLabel>
          <span style={{ color: "var(--helm-text-dim)" }}>{briefingOpen ? "−" : "+"}</span>
        </button>

        {briefingOpen ? (
          <ul className="mt-2 space-y-1.5 text-[0.82rem] leading-snug" style={{ color: "var(--helm-text-dim)" }}>
            {marina.briefing.map((line) => (
              <li key={line} className="flex gap-2">
                <span style={{ color: "var(--helm-accent)" }}>·</span>
                <span>{line}</span>
              </li>
            ))}
            {selectedBerth?.notes ? (
              <li className="flex gap-2">
                <span style={{ color: "var(--helm-good)" }}>·</span>
                <span>{selectedBerth.notes}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

function StatusBanner({ text, tone }: { text: string; tone: "good" | "warn" | "danger" }) {
  const color = `var(--helm-${tone})`;

  return (
    <div
      className="rounded-md px-3 py-2 text-center text-[0.8rem] leading-none"
      style={{
        fontFamily: "var(--helm-font-label)",
        fontWeight: 600,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {text}
    </div>
  );
}

// --- right column ---------------------------------------------------------------

function EnginePanel({
  engineState,
  instrument,
  onTogglePort,
  onToggleStarboard,
}: {
  engineState: TwinEngineState;
  instrument: "digital" | "analog";
  onTogglePort: () => void;
  onToggleStarboard: () => void;
}) {
  return (
    <Panel>
      <PanelHeader title="Engines" className="!pt-2 !pb-1" />
      <div className="grid grid-cols-2 gap-2 px-3 pb-2">
        <Tachometer
          armed={engineState.port.masterOn}
          demand={engineState.port.demandThrottle}
          instrument={instrument}
          label="Port"
          onToggle={onTogglePort}
          rpm={engineState.port.rpm}
          gear={engineState.port.gear}
          shifting={engineState.port.shifting}
          running={engineState.port.running}
          starting={engineState.port.starting}
        />
        <Tachometer
          armed={engineState.starboard.masterOn}
          demand={engineState.starboard.demandThrottle}
          instrument={instrument}
          label="Stbd"
          onToggle={onToggleStarboard}
          rpm={engineState.starboard.rpm}
          gear={engineState.starboard.gear}
          shifting={engineState.starboard.shifting}
          running={engineState.starboard.running}
          starting={engineState.starboard.starting}
        />
      </div>
    </Panel>
  );
}

function ConditionsPanel({
  conditionsMode,
  depthFeet,
  draftFeet,
  headingDeg,
  marina,
  sogKnots,
  stwKnots,
}: {
  conditionsMode: "typical" | "calm";
  depthFeet?: number;
  draftFeet: number;
  headingDeg: number;
  marina: MarinaLayout;
  sogKnots: number;
  stwKnots: number;
}) {
  const calm = conditionsMode === "calm";

  return (
    <Panel>
      <PanelHeader
        title="Conditions"
        className="!pt-2 !pb-1"
        right={<Readout value={sogKnots.toFixed(1)} unit="kn SOG" size="sm" tone="readout" />}
      />
      <div className="space-y-1.5 px-3 pb-2">
        <div className="flex items-center justify-between" title="Speed through water: hull motion relative to the tide. SOG is GPS speed over ground.">
          <PanelLabel dim>Through water</PanelLabel>
          <Readout value={stwKnots.toFixed(1)} unit="kn STW" size="sm" tone="readout" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Well className="px-2 py-1.5">
            <FlowDial
              headingDeg={headingDeg}
              knots={calm ? 0 : marina.conditions.windKnots}
              label="Wind"
              sizeRem={2.8}
              tone="accent"
              towardDeg={toCompass(marina.conditions.windTowardDeg)}
            />
          </Well>
          <Well className="px-2 py-1.5">
            <FlowDial
              headingDeg={headingDeg}
              knots={calm ? 0 : marina.conditions.currentKnots}
              label="Current"
              sizeRem={2.8}
              tone="good"
              towardDeg={toCompass(marina.conditions.currentTowardDeg)}
            />
          </Well>
        </div>
        <DepthSounder draftFeet={draftFeet} feet={depthFeet} />
      </div>
    </Panel>
  );
}

function RadioPanel({
  channel,
  radio,
}: {
  channel: string | undefined;
  radio: VhfRadioState;
}) {
  if (!radio.supported) {
    return null;
  }

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <PanelLabel>VHF</PanelLabel>
          <Readout value={`CH ${channel ?? "16"}`} size="sm" tone="readout" />
          {radio.monitoring ? (
            <Lamp
              on
              pulse={radio.receiving}
              tone={radio.receiving ? "good" : "accent"}
              title={radio.receiving ? "Receiving" : "Monitoring"}
            />
          ) : null}
        </div>
        <HelmButton
          size="sm"
          tone="good"
          active={radio.monitoring}
          onClick={radio.toggleMonitoring}
        >
          {radio.monitoring ? "Monitor" : "Off"}
        </HelmButton>
      </div>
      <p
        className="px-3 pb-1.5 text-[0.74rem] leading-snug"
        style={{ color: "var(--helm-text-dim)" }}
      >
        {radio.monitoring
          ? radio.receiving
            ? "Traffic on the harbour channel…"
            : "Squelch closed — standing by."
          : "Radio is off. Harbour traffic goes unheard."}
      </p>
    </Panel>
  );
}

function MinimalHud({
  engineState,
  guidance,
  onToggleHud,
  selectedSpawn,
  telemetry,
}: {
  engineState: TwinEngineState;
  guidance: BerthGuidance | null;
  onToggleHud: () => void;
  selectedSpawn: SpawnPoint;
  telemetry: DockingTelemetry;
}) {
  const isDeparture = selectedSpawn.kind === "departure";
  const docked = !isDeparture && Boolean(guidance?.docked);
  const departed = isDeparture && guidance !== null && guidance.rangeM > 25;
  const portRpm = engineState.port.running ? engineState.port.rpm : 0;
  const stbdRpm = engineState.starboard.running ? engineState.starboard.rpm : 0;

  return (
    <div className="pointer-events-none flex h-full flex-col items-center justify-end">
      <div className="pointer-events-auto mb-1 max-w-[96vw]">
        <Panel>
          <div className="flex items-center gap-1.5 overflow-x-auto px-2.5 py-1.5">
            {docked || departed ? (
              <Chip tone="good">{docked ? "Docked" : "Under way"}</Chip>
            ) : null}
            <Metric label="Port" value={formatSigned(engineState.port.effectiveThrottle, 2)} />
            <Metric label="Stbd" value={formatSigned(engineState.starboard.effectiveThrottle, 2)} />
            <Metric label="SOG" value={telemetry.speedKnots.toFixed(1)} unit="kn" />
            <Metric label="STW" value={telemetry.speedThroughWaterKnots.toFixed(1)} unit="kn" />
            <Metric label="RPM" value={Math.round((portRpm + stbdRpm) * 0.5)} />
            <Metric label="HDG" value={formatHeading(telemetry.headingDeg)} unit="T" />
            {guidance ? (
              <>
                <Metric label="Rng" value={guidance.rangeM.toFixed(0)} unit="m" />
                <Metric label="Cls" value={formatSigned(guidance.closureKnots, 1)} />
              </>
            ) : null}
            <HelmButton className="hidden lg:inline-flex" size="sm" onClick={onToggleHud} title="Show panels (H)">
              HUD
            </HelmButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// --- engine start ----------------------------------------------------------------

function EngineStartOverlay({
  boatName,
  engineNotes,
  engineState,
  marinaName,
  onStartEngines,
}: {
  boatName: string;
  engineNotes: string;
  engineState: TwinEngineState;
  marinaName: string;
  onStartEngines: () => void;
}) {
  const starting = engineState.port.starting || engineState.starboard.starting;
  const needsNeutral = engineState.port.demandThrottle !== 0 || engineState.starboard.demandThrottle !== 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[26rem] max-w-full">
        <Panel>
          <div className="px-6 py-6 text-center">
            <PanelLabel className="!text-[0.72rem]">{boatName}</PanelLabel>
            <p className="mt-1 text-[0.8rem]" style={{ color: "var(--helm-text-dim)" }}>
              {marinaName}
            </p>

            <h2
              className={`mt-5 text-[1.15rem] leading-tight ${starting ? "animate-pulse" : ""}`}
              style={{
                fontFamily: "var(--helm-font-label)",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--helm-text)",
              }}
            >
              {starting ? "Starting engines…" : "Engines are shut down"}
            </h2>
            <p className="mt-2 text-[0.84rem] leading-relaxed" style={{ color: "var(--helm-text-dim)" }}>
              {starting ? "Give them a moment to catch." : needsNeutral ? "Return both levers to neutral to start. Press Space when using the keyboard." : engineNotes}
            </p>

            <div className="mt-4 flex justify-center gap-2">
              <EngineStatusChip channel={engineState.port} label="Port" />
              <EngineStatusChip channel={engineState.starboard} label="Stbd" />
            </div>

            <div className="mt-5">
              <HelmActionButton disabled={starting || needsNeutral} onClick={onStartEngines} tone="good">
                {starting ? "Starting…" : "Start engines"}
              </HelmActionButton>
            </div>

            <p
              className="mt-5 text-[0.72rem] leading-relaxed"
              style={{
                fontFamily: "var(--helm-font-label)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--helm-label-dim)",
              }}
            >
              Throttles W/S · I/K &nbsp;·&nbsp; Neutral Space &nbsp;·&nbsp; Bow thruster A/D &nbsp;·&nbsp; Hide panels H
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function EngineStatusChip({ channel, label }: { channel: EngineChannelState; label: string }) {
  const state = channel.running
    ? { text: "Running", tone: "good" as const }
    : channel.starting
      ? { text: "Starting", tone: "warn" as const }
      : channel.masterOn
        ? { text: "Armed", tone: "accent" as const }
        : { text: "Off", tone: "neutral" as const };

  return (
    <Chip tone={state.tone}>
      <Lamp on={state.tone !== "neutral"} tone={state.tone === "neutral" ? "accent" : state.tone} />
      {label} · {state.text}
    </Chip>
  );
}

function AudioIcon({ enabled, muted }: { enabled: boolean; muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.25 6.2H5.4L8.4 3.6v8.8L5.4 9.8H3.25z" />
      {muted ? (
        <path d="m10.8 5.1 2.5 2.5m0-2.5-2.5 2.5" />
      ) : enabled ? (
        <>
          <path d="M10.75 6.1a2.2 2.2 0 0 1 0 3.8" />
          <path d="M12.55 4.6a4.15 4.15 0 0 1 0 6.8" />
        </>
      ) : (
        <path d="M10.9 8h2.1" />
      )}
    </svg>
  );
}
