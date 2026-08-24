"use client";

import { useMemo, useState } from "react";

import type { CruiseScenario } from "@/lib/scenarios/san-juan-aug-2026";

type ScenarioCardProps = {
  activeLegIndex: number;
  className?: string;
  mapBoatCoordinate: {
    lat: number;
    lon: number;
  } | null;
  onSelectLeg: (index: number) => void;
  onResetToStop: (stopId: string) => void;
  onOpenLocationDialog?: (stopId: string) => void;
  scenario: CruiseScenario;
};

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function ScenarioCard({
  activeLegIndex,
  className,
  mapBoatCoordinate,
  onSelectLeg,
  onResetToStop,
  onOpenLocationDialog,
  scenario,
}: ScenarioCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const totalDistanceNm = scenario.legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const totalDurationMinutes = scenario.legs.reduce(
    (sum, leg) => sum + leg.scheduledDurationMinutes,
    0,
  );
  const activeLeg = scenario.legs[activeLegIndex] ?? null;
  const activeFrom = activeLeg ? labelForStop(scenario, activeLeg.fromStopId) : null;
  const activeTo = activeLeg ? labelForStop(scenario, activeLeg.toStopId) : null;
  const tripSummary = useMemo(
    () => `${scenario.legs.length} legs, ${totalDistanceNm.toFixed(1)} nm, ${formatDuration(totalDurationMinutes)}`,
    [scenario.legs.length, totalDistanceNm, totalDurationMinutes],
  );

  return (
    <div
      className={`flex flex-col rounded-2xl border border-white/12 bg-slate-950/70 px-4 py-3 shadow-2xl backdrop-blur-xl ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cyan-100/70">Scenario</p>
          <div className="mt-2">
            <p className="text-lg font-semibold text-white">{scenario.title}</p>
            <p className="text-xs text-slate-300">{tripSummary}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand scenario" : "Collapse scenario"}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-400">Departure</p>
          <p className="font-mono text-slate-100">{scenario.departurePort}</p>
        </div>
        <div>
          <p className="text-slate-400">Return</p>
          <p className="font-mono text-slate-100">{scenario.returnPort}</p>
        </div>
      </div>

      {activeLeg ? (
        <div className="mt-3 rounded-xl border border-cyan-200/12 bg-cyan-300/6 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-cyan-100/70">
                Active Leg
              </p>
              <p className="mt-1 text-xs text-slate-100">
                {activeFrom} {"->"} {activeTo}
              </p>
            </div>
            <div className="text-right font-mono text-xs text-cyan-100">
              <p>{activeLeg.distanceNm.toFixed(1)} nm</p>
              <p>{formatDuration(activeLeg.scheduledDurationMinutes)}</p>
            </div>
          </div>
        </div>
      ) : null}

      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <RouteMiniMap
            activeLegIndex={activeLegIndex}
            boatCoordinate={mapBoatCoordinate}
            onOpenLocationDialog={onOpenLocationDialog}
            onResetToStop={onResetToStop}
            scenario={scenario}
          />

          <div className="mt-3 space-y-1.5">
            {scenario.legs.map((leg, index) => (
              <button
                key={leg.id}
                type="button"
                onClick={() => onSelectLeg(index)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                  index === activeLegIndex
                    ? "bg-cyan-300/12 text-white ring-1 ring-cyan-200/20"
                    : "bg-white/5 text-slate-200 hover:bg-white/8"
                }`}
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate text-xs">
                    {labelForStop(scenario, leg.fromStopId)} {"->"} {labelForStop(scenario, leg.toStopId)}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-slate-400">
                    {leg.courseTrueDeg.toFixed(0).padStart(3, "0")}T
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono text-[0.68rem]">
                  <p>{leg.distanceNm.toFixed(1)} nm</p>
                  <p className="text-slate-400">
                    {formatDuration(leg.scheduledDurationMinutes)} / {leg.targetSpeedKnots.toFixed(1)} kn
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RouteMiniMap({
  activeLegIndex,
  boatCoordinate,
  onOpenLocationDialog,
  onResetToStop,
  scenario,
}: {
  activeLegIndex: number;
  boatCoordinate: {
    lat: number;
    lon: number;
  } | null;
  onOpenLocationDialog?: (stopId: string) => void;
  onResetToStop: (stopId: string) => void;
  scenario: CruiseScenario;
}) {
  const lats = scenario.stops.map((stop) => stop.coordinate.lat);
  const lons = scenario.stops.map((stop) => stop.coordinate.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latPadding = (maxLat - minLat) * 0.12 || 0.02;
  const lonPadding = (maxLon - minLon) * 0.12 || 0.02;
  const bounds = {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLon: minLon - lonPadding,
    maxLon: maxLon + lonPadding,
  };

  const project = (coordinate: { lat: number; lon: number }) => {
    const x = ((coordinate.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100;
    const y = (1 - (coordinate.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;

    return { x, y };
  };

  const routePoints = scenario.stops.map((stop) => {
    const point = project(stop.coordinate);
    return `${point.x},${point.y}`;
  });
  const activeLeg = scenario.legs[activeLegIndex];
  const activeFromStop = scenario.stops.find((stop) => stop.id === activeLeg?.fromStopId);
  const activeToStop = scenario.stops.find((stop) => stop.id === activeLeg?.toStopId);
  const activeLegPoints =
    activeFromStop && activeToStop
      ? `${project(activeFromStop.coordinate).x},${project(activeFromStop.coordinate).y} ${project(activeToStop.coordinate).x},${project(activeToStop.coordinate).y}`
      : null;
  const boatPoint = boatCoordinate ? project(boatCoordinate) : null;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-400">Route Map</p>
          <p className="mt-1 text-xs text-slate-300">
            Click a stop to switch location
          </p>
        </div>
        {boatCoordinate ? (
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
            Live boat marker
          </p>
        ) : null}
      </div>

      <div className="relative mt-3 h-[clamp(7.5rem,23vh,12rem)] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,_rgba(54,92,122,0.35),_rgba(6,16,26,0.92))]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <polyline
            points={routePoints.join(" ")}
            fill="none"
            stroke="rgba(108, 211, 255, 0.35)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {activeLegPoints ? (
            <polyline
              points={activeLegPoints}
              fill="none"
              stroke="rgba(158, 242, 255, 0.95)"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          ) : null}
          {boatPoint ? (
            <>
              <circle cx={boatPoint.x} cy={boatPoint.y} r="2.4" fill="rgba(255,255,255,0.95)" />
              <circle cx={boatPoint.x} cy={boatPoint.y} r="4.2" fill="none" stroke="rgba(171,244,255,0.55)" strokeWidth="0.7" />
            </>
          ) : null}
        </svg>

        {scenario.stops.map((stop, index) => {
          const point = project(stop.coordinate);
          const isActive =
            stop.id === activeLeg?.fromStopId || stop.id === activeLeg?.toStopId;
          const displayNumber = index > 0 ? index : null;

          return (
            <button
              key={stop.id}
              type="button"
              onClick={() => {
                if (onOpenLocationDialog) {
                  onOpenLocationDialog(stop.id);
                } else {
                  onResetToStop(stop.id);
                }
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              <span
                className={`block h-3.5 w-3.5 rounded-full border ${
                  isActive
                    ? "border-cyan-100 bg-cyan-300 shadow-[0_0_0_4px_rgba(110,231,255,0.15)]"
                    : "border-white/70 bg-slate-950/90"
                }`}
              />
              {displayNumber !== null ? (
                <span
                  className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.55rem] font-semibold ${
                    isActive ? "text-slate-900" : "text-slate-100"
                  }`}
                >
                  {displayNumber}
                </span>
              ) : null}
              <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/85 px-2 py-1 text-[0.55rem] uppercase tracking-[0.18em] text-slate-200">
                {displayNumber !== null ? `${displayNumber} · ${stop.shortName}` : stop.shortName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function labelForStop(scenario: CruiseScenario, stopId: string) {
  return scenario.stops.find((stop) => stop.id === stopId)?.shortName ?? stopId;
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
