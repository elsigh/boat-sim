"use client";

import Link from "next/link";
import { useState } from "react";
import type { PointerEventHandler, WheelEventHandler } from "react";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { TwinEngineState } from "@/hooks/useEngineState";
import type { Berth, MarinaLayout, SpawnPoint } from "@/lib/marinas/types";
import type { CruiseScenario } from "@/lib/scenarios/san-juan-aug-2026";
import type { BerthGuidance } from "@/lib/sim/berth-guidance";
import type { DockingTelemetry } from "@/lib/sim/boat-physics";

import { ScenarioCard } from "./ScenarioCard";

type DockingOverlayProps = {
  activeLegIndex: number;
  audioEnabled: boolean;
  audioSupported: boolean;
  availableBoats: BoatProfile[];
  conditionsMode: "typical" | "calm";
  controls: GamepadSnapshot;
  engineState: TwinEngineState;
  guidance: BerthGuidance | null;
  mapBoatCoordinate: {
    lat: number;
    lon: number;
  } | null;
  marina: MarinaLayout;
  onBoatChange: (slug: string) => void;
  onConditionsModeChange: (mode: "typical" | "calm") => void;
  onEnableEngines: () => void;
  onEnableAudio: (nextEnabled?: boolean) => void;
  onRestartBoat: () => void;
  onSelectBerth: (berthId: string) => void;
  onSelectSpawn: (spawnId: string) => void;
  onStartEngines: () => void;
  onSelectLeg: (index: number) => void;
  onResetToStop: (stopId: string) => void;
  onTogglePortEngine: () => void;
  onToggleStarboardEngine: () => void;
  selectedBerth: Berth | null;
  selectedBoat: BoatProfile;
  selectedSpawn: SpawnPoint;
  onViewportWheel: WheelEventHandler<HTMLDivElement>;
  scenario: CruiseScenario;
  telemetry: DockingTelemetry;
  viewMode: "plan" | "forward";
  onViewModeChange: (mode: "plan" | "forward") => void;
  viewportBindings: {
    onPointerCancel: PointerEventHandler<HTMLDivElement>;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
  };
  viewportDragging: boolean;
};

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatHeading(value: number) {
  return (Math.round(value) % 360).toString().padStart(3, "0");
}

function stopPointerPropagation(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

export function DockingOverlay({
  activeLegIndex,
  audioEnabled,
  audioSupported,
  availableBoats,
  conditionsMode,
  controls,
  engineState,
  guidance,
  mapBoatCoordinate,
  marina,
  onBoatChange,
  onConditionsModeChange,
  onEnableEngines,
  onEnableAudio,
  onRestartBoat,
  onSelectBerth,
  onSelectSpawn,
  onStartEngines,
  onSelectLeg,
  onResetToStop,
  onTogglePortEngine,
  onToggleStarboardEngine,
  selectedBerth,
  selectedBoat,
  selectedSpawn,
  onViewportWheel,
  scenario,
  telemetry,
  viewMode,
  onViewModeChange,
  viewportBindings,
  viewportDragging,
}: DockingOverlayProps) {
  const [boatPanelExpanded, setBoatPanelExpanded] = useState(false);
  const enginesArmed = engineState.port.masterOn && engineState.starboard.masterOn;
  const enginesRunning = engineState.port.running && engineState.starboard.running;
  const enginesStarting = engineState.port.starting || engineState.starboard.starting;

  return (
    <div className="pointer-events-none absolute inset-0 p-3 text-white lg:p-4">
      <div
        {...viewportBindings}
        onWheel={onViewportWheel}
        className={`pointer-events-auto absolute inset-0 ${
          viewportDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      />
      <div className="flex h-full flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="flex min-h-0 flex-col gap-3 lg:h-full lg:w-[clamp(24rem,32vw,30rem)]">
          <div className="pointer-events-auto max-w-[30rem] rounded-2xl border border-white/12 bg-slate-950/74 px-4 py-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-fuchsia-100/70">
                  Active Boat
                </p>
                <p className="mt-1 text-base font-semibold text-white">{selectedBoat.displayName}</p>
                <p className="text-xs text-slate-300">
                  {selectedBoat.manufacturer} {selectedBoat.model}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBoatPanelExpanded((value) => !value)}
                aria-label={boatPanelExpanded ? "Collapse active boat" : "Expand active boat"}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              >
                <ChevronIcon expanded={boatPanelExpanded} />
              </button>
            </div>

            {boatPanelExpanded ? (
              <>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link
                    href={`/boats/${selectedBoat.profileSlug}`}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.22em] text-slate-200 transition hover:bg-white/10"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/boats"
                    className="text-[0.65rem] uppercase tracking-[0.18em] text-sky-200 underline underline-offset-4"
                  >
                    All Boats
                  </Link>
                </div>

                <label className="mt-4 block">
                  <span className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">
                    Switch Boat
                  </span>
                  <select
                    value={selectedBoat.profileSlug}
                    onChange={(event) => onBoatChange(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none"
                  >
                    {availableBoats.map((boat) => (
                      <option key={boat.profileSlug} value={boat.profileSlug}>
                        {boat.displayName} · {boat.manufacturer} {boat.model}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <p>{selectedBoat.summary}</p>
                  <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
                    Sim status: {selectedBoat.simStatus}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <DockingPracticePanel
            conditionsMode={conditionsMode}
            guidance={guidance}
            marina={marina}
            onConditionsModeChange={onConditionsModeChange}
            onSelectBerth={onSelectBerth}
            onSelectSpawn={onSelectSpawn}
            selectedBerth={selectedBerth}
            selectedSpawn={selectedSpawn}
            telemetry={telemetry}
          />

          <div className="pointer-events-auto min-h-0 max-w-[30rem]">
            <ScenarioCard
              activeLegIndex={activeLegIndex}
              className="lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
              mapBoatCoordinate={mapBoatCoordinate}
              onSelectLeg={onSelectLeg}
              onResetToStop={onResetToStop}
              scenario={scenario}
            />
          </div>
        </div>

        <div className="pointer-events-auto flex max-w-[20rem] flex-col gap-2 lg:h-full lg:w-[20rem] 2xl:w-[21rem]">
          <div className="rounded-2xl border border-white/12 bg-slate-950/74 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-emerald-100/70">
                Sim View
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={stopPointerPropagation}
                  onClick={() => onEnableAudio(!audioEnabled)}
                  disabled={!audioSupported}
                  aria-label={
                    !audioSupported
                      ? "Audio unsupported"
                      : audioEnabled
                        ? "Mute audio"
                        : "Enable audio"
                  }
                  className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                    !audioSupported
                      ? "cursor-not-allowed border-white/6 bg-white/5 text-slate-500"
                      : audioEnabled
                        ? "border-emerald-300/20 bg-emerald-300/12 text-emerald-200"
                        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <AudioIcon enabled={audioEnabled} muted={!audioSupported || !audioEnabled} />
                </button>
                <button
                  type="button"
                  onPointerDown={stopPointerPropagation}
                  onClick={onRestartBoat}
                  aria-label="Restart boat at current practice start"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-300/18 bg-sky-300/10 text-sky-100 transition hover:bg-sky-300/14"
                >
                  <RestartIcon />
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <ViewModeButton
                active={viewMode === "plan"}
                label="Plan"
                onClick={() => onViewModeChange("plan")}
              />
              <ViewModeButton
                active={viewMode === "forward"}
                label="Forward"
                onClick={() => onViewModeChange("forward")}
              />
            </div>

          </div>

          <div className="rounded-2xl border border-white/12 bg-slate-950/74 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-amber-100/70">
              Controls
            </p>
            {!enginesArmed ? (
              <EngineNotice
                actionLabel="Enable both"
                body="Throttle input is live, but propulsion is disabled."
                label="Engines off"
                onAction={onEnableEngines}
              />
            ) : !enginesRunning ? (
              <EngineNotice
                actionLabel={enginesStarting ? "Starting" : "Start"}
                body="Engine masters are on; start engines to apply thrust."
                label={enginesStarting ? "Starting engines" : "Engines armed"}
                onAction={enginesStarting ? undefined : onStartEngines}
              />
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <EngineLever
                label="Port"
                value={engineState.port.effectiveThrottle}
                demandValue={engineState.port.demandThrottle}
                active={engineState.port.running}
                starting={engineState.port.starting}
              />
              <EngineLever
                label="Stbd"
                value={engineState.starboard.effectiveThrottle}
                demandValue={engineState.starboard.demandThrottle}
                active={engineState.starboard.running}
                starting={engineState.starboard.starting}
              />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <MappedButton
                label="Port Eng"
                value={engineState.port.masterOn ? 1 : 0}
                accent="bg-emerald-400/15 text-emerald-100"
                activeLabel="On"
                idleLabel="Off"
                onClick={onTogglePortEngine}
              />
              <MappedButton
                label="Stbd Eng"
                value={engineState.starboard.masterOn ? 1 : 0}
                accent="bg-emerald-400/15 text-emerald-100"
                activeLabel="On"
                idleLabel="Off"
                onClick={onToggleStarboardEngine}
              />
              <MappedButton
                label="Port Thr"
                value={controls.rawButtons[4] ?? 0}
                accent="bg-sky-400/15 text-sky-100"
              />
              <MappedButton
                label="Stbd Thr"
                value={controls.rawButtons[5] ?? 0}
                accent="bg-sky-400/15 text-sky-100"
              />
              <MappedButton
                label="Start"
                value={engineState.ignitionPressed || enginesStarting ? 1 : 0}
                accent="bg-amber-400/15 text-amber-100"
                activeLabel={enginesStarting ? "Start" : "Push"}
                idleLabel="Push"
                onClick={onStartEngines}
              />
            </div>

            <ControllerStatus controls={controls} />
          </div>

          <HelmInfoPanel telemetry={telemetry} />
        </div>
      </div>
    </div>
  );
}

function DockingPracticePanel({
  conditionsMode,
  guidance,
  marina,
  onConditionsModeChange,
  onSelectBerth,
  onSelectSpawn,
  selectedBerth,
  selectedSpawn,
  telemetry,
}: {
  conditionsMode: "typical" | "calm";
  guidance: BerthGuidance | null;
  marina: MarinaLayout;
  onConditionsModeChange: (mode: "typical" | "calm") => void;
  onSelectBerth: (berthId: string) => void;
  onSelectSpawn: (spawnId: string) => void;
  selectedBerth: Berth | null;
  selectedSpawn: SpawnPoint;
  telemetry: DockingTelemetry;
}) {
  const [briefingOpen, setBriefingOpen] = useState(false);
  const isDeparture = selectedSpawn.kind === "departure";
  const docked = !isDeparture && Boolean(guidance?.docked);
  const departed = isDeparture && guidance !== null && guidance.rangeM > 25;
  const hotApproach =
    !isDeparture &&
    guidance !== null &&
    guidance.rangeM < 45 &&
    guidance.closureKnots > 1.2;
  const windFromDeg = (marina.conditions.windTowardDeg + 180) % 360;
  const windRelativeDeg = marina.conditions.windTowardDeg - telemetry.headingDeg;

  return (
    <div className="pointer-events-auto max-w-[30rem] rounded-2xl border border-white/12 bg-slate-950/74 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cyan-100/70">
            Docking Practice
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{marina.name}</p>
        </div>
        {marina.vhfChannel ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-slate-300">
            VHF {marina.vhfChannel}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">
            Exercise
          </span>
          <select
            value={selectedSpawn.id}
            onChange={(event) => onSelectSpawn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none"
          >
            {marina.spawns.map((spawn) => (
              <option key={spawn.id} value={spawn.id}>
                {spawn.label}
              </option>
            ))}
          </select>
        </label>

        {marina.berths.length > 1 ? (
          <label className="block">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">
              Target berth
            </span>
            <select
              value={selectedBerth?.id ?? ""}
              onChange={(event) => onSelectBerth(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-slate-100 outline-none"
            >
              {marina.berths.map((berth) => (
                <option key={berth.id} value={berth.id}>
                  {berth.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {docked ? (
        <div className="mt-2 rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-emerald-100">
          Docked — get your lines across
        </div>
      ) : departed ? (
        <div className="mt-2 rounded-xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-emerald-100">
          Clear of the berth — under way
        </div>
      ) : hotApproach ? (
        <div className="mt-2 rounded-xl border border-amber-300/25 bg-amber-400/12 px-3 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-amber-100">
          Hot approach — come back on the levers
        </div>
      ) : null}

      {guidance && selectedBerth ? (
        <div className="mt-2 grid grid-cols-4 gap-1">
          <TelemetryMetric label="Range" value={guidance.rangeM.toFixed(0)} unit="m" />
          <TelemetryMetric
            label="Closure"
            value={formatSigned(guidance.closureKnots, 1)}
            unit="kn"
          />
          <TelemetryMetric
            label="Offset"
            value={`${Math.abs(guidance.acrossM).toFixed(1)}${guidance.acrossM >= 0 ? "S" : "P"}`}
            unit="m"
          />
          <TelemetryMetric
            label="Angle"
            value={formatSigned(guidance.headingErrorDeg, 0)}
            unit="deg"
          />
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/5 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <WindArrow relativeDeg={windRelativeDeg} calm={conditionsMode === "calm"} />
          <div className="min-w-0">
            <p className="truncate font-mono text-[0.62rem] uppercase tracking-[0.14em] text-slate-200">
              {conditionsMode === "calm"
                ? "Calm — no wind or current"
                : `Wind ${marina.conditions.windKnots.toFixed(0)} kn from ${Math.round(windFromDeg).toString().padStart(3, "0")}T`}
            </p>
            <p className="truncate text-[0.58rem] text-slate-400">
              {conditionsMode === "calm" ? "Practice mode" : marina.conditions.summary}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {(["typical", "calm"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onPointerDown={stopPointerPropagation}
              onClick={() => onConditionsModeChange(mode)}
              className={`rounded-lg border px-2 py-1 text-[0.55rem] uppercase tracking-[0.14em] transition ${
                conditionsMode === mode
                  ? "border-sky-300/35 bg-sky-300/12 text-sky-100"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onPointerDown={stopPointerPropagation}
        onClick={() => setBriefingOpen((value) => !value)}
        className="mt-2 w-full rounded-lg bg-white/5 px-2.5 py-1.5 text-left text-[0.6rem] uppercase tracking-[0.18em] text-slate-400 transition hover:bg-white/8"
      >
        Local knowledge {briefingOpen ? "−" : "+"}
      </button>
      {briefingOpen ? (
        <ul className="mt-1.5 space-y-1 text-[0.68rem] leading-snug text-slate-300">
          {marina.briefing.map((line) => (
            <li key={line} className="flex gap-1.5">
              <span className="text-sky-300/70">·</span>
              <span>{line}</span>
            </li>
          ))}
          {selectedBerth?.notes ? (
            <li className="flex gap-1.5">
              <span className="text-emerald-300/70">·</span>
              <span>{selectedBerth.notes}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function WindArrow({ relativeDeg, calm }: { relativeDeg: number; calm: boolean }) {
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/80">
      <span className="absolute top-0.5 text-[0.42rem] font-semibold uppercase text-slate-500">
        Bow
      </span>
      {calm ? (
        <span className="text-[0.6rem] text-slate-500">—</span>
      ) : (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4 text-sky-200"
          style={{ transform: `rotate(${relativeDeg}deg)` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 13.5v-11" />
          <path d="m4.5 6 3.5-3.5L11.5 6" />
        </svg>
      )}
    </div>
  );
}

function EngineNotice({
  actionLabel,
  body,
  label,
  onAction,
}: {
  actionLabel: string;
  body: string;
  label: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-amber-200/18 bg-amber-300/10 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.62rem] uppercase tracking-[0.18em] text-amber-100">
            {label}
          </div>
          <div className="mt-0.5 text-[0.68rem] leading-snug text-amber-50/72">
            {body}
          </div>
        </div>
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onClick={onAction}
          disabled={!onAction}
          className="shrink-0 rounded-lg border border-amber-100/16 bg-amber-100/12 px-2.5 py-1.5 text-[0.58rem] uppercase tracking-[0.14em] text-amber-50 transition hover:bg-amber-100/18 disabled:cursor-wait disabled:opacity-60"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function HelmInfoPanel({ telemetry }: { telemetry: DockingTelemetry }) {
  return (
    <div className="mt-auto rounded-2xl border border-white/12 bg-slate-950/76 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.65rem] uppercase tracking-[0.3em] text-sky-100/70">
          Helm Data
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
          HDG {formatHeading(telemetry.headingDeg)}
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <Compass headingDeg={telemetry.headingDeg} />
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
          <TelemetryMetric label="SOG" value={telemetry.speedKnots.toFixed(2)} unit="kn" />
          <TelemetryMetric label="HDG" value={formatHeading(telemetry.headingDeg)} unit="T" />
          <TelemetryMetric label="Surge" value={formatSigned(telemetry.surgeSpeedKnots, 2)} unit="kn" />
          <TelemetryMetric label="Drift" value={formatSigned(telemetry.lateralDriftKnots, 2)} unit="kn" />
          <TelemetryMetric label="Yaw" value={formatSigned(telemetry.yawRateDegPerSecond, 1)} unit="deg/s" />
        </div>
      </div>
    </div>
  );
}

function Compass({ headingDeg }: { headingDeg: number }) {
  return (
    <div className="relative h-[clamp(4.75rem,13vh,6.5rem)] w-[clamp(4.75rem,13vh,6.5rem)] shrink-0 rounded-full border border-sky-200/20 bg-slate-900/80 shadow-inner shadow-black/30">
      <div className="absolute inset-1.5 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-[0.58rem] font-semibold text-sky-100">
        N
      </div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[0.58rem] text-slate-500">
        S
      </div>
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 font-mono text-[0.58rem] text-slate-500">
        W
      </div>
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[0.58rem] text-slate-500">
        E
      </div>
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-100" />
      <div
        className="absolute left-1/2 top-1/2 h-[72%] w-2.5 origin-center"
        style={{ transform: `translate(-50%, -50%) rotate(${headingDeg}deg)` }}
      >
        <div className="absolute left-1/2 top-0 h-1/2 w-1 -translate-x-1/2 rounded-full bg-sky-200 shadow-[0_0_12px_rgba(125,211,252,0.65)]" />
        <div className="absolute bottom-1 left-1/2 h-[42%] w-px -translate-x-1/2 rounded-full bg-slate-500" />
      </div>
      <div className="absolute inset-x-0 bottom-[28%] text-center font-mono text-sm font-semibold text-white">
        {formatHeading(headingDeg)}
      </div>
    </div>
  );
}

function TelemetryMetric({
  label,
  unit,
  value,
}: {
  label: string;
  unit: string;
  value: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-white/5 px-1.5 py-1.5">
      <div className="truncate text-[0.58rem] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 min-w-0 font-mono">
        <div className="truncate text-xs font-semibold leading-none text-slate-100">{value}</div>
        <div className="mt-0.5 truncate text-[0.5rem] uppercase leading-none tracking-[0.06em] text-slate-500">
          {unit}
        </div>
      </div>
    </div>
  );
}

function ViewModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={stopPointerPropagation}
      onClick={onClick}
      className={`rounded-xl border px-2.5 py-1.5 text-left transition ${
        active
          ? "border-sky-300/35 bg-sky-300/12 text-sky-100"
          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/8"
      }`}
    >
      <span className="text-[0.66rem] uppercase tracking-[0.22em]">{label}</span>
    </button>
  );
}

function MappedButton({
  label,
  value,
  accent,
  activeLabel = "Active",
  idleLabel = "Idle",
  onClick,
}: {
  label: string;
  value: number;
  accent: string;
  activeLabel?: string;
  idleLabel?: string;
  onClick?: () => void;
}) {
  const active = value > 0.5;
  const className = `min-w-0 rounded-lg bg-white/5 px-2 py-1 text-left ${
    onClick ? "transition hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/20" : ""
  }`;
  const content = (
    <>
      <div className="truncate text-[0.5rem] uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.12em] ${
            active ? accent : "bg-white/8 text-slate-400"
          }`}
        >
          {active ? activeLabel : idleLabel}
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onPointerDown={stopPointerPropagation}
        onClick={onClick}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className}>{content}</div>
  );
}

function EngineLever({
  label,
  value,
  demandValue,
  active,
  starting,
}: {
  label: string;
  value: number;
  demandValue: number;
  active: boolean;
  starting: boolean;
}) {
  const command = Math.max(-1, Math.min(1, demandValue));
  const clamped = Math.max(-1, Math.min(1, active ? value : command));
  const magnitude = `${Math.abs(clamped) * 50}%`;
  const commandMagnitude = `${Math.abs(command) * 50}%`;
  const isForward = clamped >= 0;
  const commandIsForward = command >= 0;
  const showCommandOverlay = active && Math.abs(command - clamped) > 0.025;
  const hasCommand = Math.abs(command) > 0.025;

  return (
    <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[0.62rem] uppercase tracking-[0.18em] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">
          {starting ? "START" : active ? formatSigned(clamped, 2) : "OFF"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">
        <span>Fwd</span>
        <span>Rev</span>
      </div>
      <div
        className={`relative mx-auto mt-1 h-[clamp(4.35rem,11vh,7.25rem)] w-9 overflow-hidden rounded-full ${
          active || starting || hasCommand ? "bg-white/10" : "bg-white/5"
        }`}
      >
        <div className="absolute inset-x-1.5 top-1/2 h-px bg-white/30" />
        <div
          className={`absolute inset-x-1.5 rounded-full ${
            isForward ? "bottom-1/2 bg-emerald-400" : "top-1/2 bg-amber-400"
          }`}
          style={{ height: magnitude }}
        />
        {showCommandOverlay ? (
          <div
            className={`absolute inset-x-[0.95rem] rounded-full ${
              commandIsForward ? "bottom-1/2 bg-white/35" : "top-1/2 bg-white/35"
            }`}
            style={{ height: commandMagnitude }}
          />
        ) : null}
        {starting ? (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[0.58rem] uppercase tracking-[0.16em] text-amber-200">
            START
          </div>
        ) : null}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[0.58rem] uppercase tracking-[0.16em] text-slate-300">
          0
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[0.54rem] uppercase tracking-[0.12em] text-slate-500">
        <span>Cmd</span>
        <span className="text-slate-300">{formatSigned(command, 2)}</span>
      </div>
    </div>
  );
}

function ControllerStatus({ controls }: { controls: GamepadSnapshot }) {
  const activeButtons = controls.rawButtons
    .map((value, index) => (value > 0.5 ? index.toString() : null))
    .filter(Boolean);
  const axes = controls.rawAxes
    .slice(0, 4)
    .map((value, index) => `${index}:${formatSigned(value, 2)}`);

  return (
    <div className="mt-2 rounded-lg bg-white/5 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[0.55rem] uppercase tracking-[0.14em] text-slate-500">
        <span>Controller</span>
        <span className={controls.connected ? "text-emerald-200" : "text-slate-400"}>
          {controls.connected ? `GP ${controls.gamepadIndex}` : "None"}
        </span>
      </div>
      <div className="mt-1 truncate text-[0.58rem] text-slate-300">
        {controls.gamepadId ?? "Keyboard helm"}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-[0.54rem] uppercase tracking-[0.1em] text-slate-500">
        <div className="truncate">Axes {axes.length > 0 ? axes.join(" ") : "-"}</div>
        <div className="truncate text-right">
          Btn {activeButtons.length > 0 ? activeButtons.join(",") : "-"}
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 6.25 8 10.75l4.5-4.5" />
    </svg>
  );
}

function AudioIcon({
  enabled,
  muted,
}: {
  enabled: boolean;
  muted: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
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

function RestartIcon() {
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
      <path d="M3.2 5.9A5.1 5.1 0 1 1 5 12.7" />
      <path d="M3.1 2.9v3.6h3.6" />
    </svg>
  );
}
