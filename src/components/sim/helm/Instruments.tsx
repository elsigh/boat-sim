"use client";

import { useMemo } from "react";

import { rpmFromThrottle, type EngineGear } from "@/lib/sim/engine-dynamics";

import type { HelmTheme } from "@/lib/boats/helm-theme";

import { PanelLabel, Readout, Well } from "./Panel";

// Instruments are drawn as single self-contained SVGs with everything measured
// from one centre point. That's deliberate: the previous wind and current dials
// rotated a positioned <div>, and the arrows never sat in the middle of their
// circles. Rotating an SVG group about an explicit centre can't drift.

const TACH_MAX_RPM = 2400;
const TACH_IDLE_RPM = 600;
const TACH_REDLINE_RPM = 2150;

type TachProps = {
  label: string;
  rpm: number;
  /** -1..1 lever demand, drawn as the commanded mark. */
  demand: number;
  gear: EngineGear;
  shifting: boolean;
  running: boolean;
  starting: boolean;
  armed: boolean;
  instrument: HelmTheme["instrument"];
  onToggle?: () => void;
};

/**
 * Bonum Vitae's helm has digital tachs, so the default is a lit numeric with a
 * segment bar. Boats with analog panels get a needle instead.
 */
export function Tachometer({
  label,
  rpm,
  demand,
  gear,
  shifting,
  running,
  starting,
  armed,
  instrument,
  onToggle,
}: TachProps) {
  const state = starting ? "starting" : running ? "running" : armed ? "armed" : "off";
  const stateTone =
    state === "running"
      ? "var(--helm-good)"
      : state === "starting"
        ? "var(--helm-warn)"
        : state === "armed"
          ? "var(--helm-accent)"
          : "var(--helm-text-dim)";

  return (
    <Well className="px-2 pb-1.5 pt-1">
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={(event) => event.stopPropagation()}
        className="flex w-full items-center justify-between gap-2 rounded px-0.5 py-0.5 transition hover:bg-white/5"
        title={running ? "Shut this engine down" : "Engine master on"}
      >
        <PanelLabel className="!text-[0.62rem]">{label}</PanelLabel>
        <span
          className="flex items-center gap-1 text-[0.58rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: stateTone,
          }}
        >
          <span
            className={`inline-block h-[0.35rem] w-[0.35rem] rounded-full ${state === "starting" ? "animate-pulse" : ""}`}
            style={{
              background: state === "off" ? "var(--helm-inset)" : stateTone,
              boxShadow: state === "off" ? undefined : `0 0 7px ${stateTone}`,
            }}
          />
          {state}
        </span>
      </button>

      <div className="mt-0.5 flex items-center justify-between px-0.5 text-[0.58rem] uppercase tracking-widest" style={{ color: shifting ? "var(--helm-warn)" : "var(--helm-text-dim)" }}>
        <span>Gear</span>
        <span>{!running ? "—" : shifting && demand !== 0 ? "Shifting" : gear > 0 ? "Ahead" : gear < 0 ? "Astern" : "Neutral"}</span>
      </div>
      {instrument === "analog" ? (
        <AnalogTach rpm={rpm} demand={demand} live={running || starting} />
      ) : (
        <DigitalTach rpm={rpm} demand={demand} live={running || starting} />
      )}
    </Well>
  );
}

function DigitalTach({ rpm, demand, live }: { rpm: number; demand: number; live: boolean }) {
  const segments = 22;
  const fraction = live
    ? Math.min(1, Math.max(0, (rpm - TACH_IDLE_RPM) / (TACH_MAX_RPM - TACH_IDLE_RPM)))
    : 0;
  const lit = Math.round(fraction * segments);
  const redlineSegment = Math.round(
    ((TACH_REDLINE_RPM - TACH_IDLE_RPM) / (TACH_MAX_RPM - TACH_IDLE_RPM)) * segments,
  );
  const demandFraction = Math.min(1, Math.max(0, (rpmFromThrottle(demand) - TACH_IDLE_RPM) / (TACH_MAX_RPM - TACH_IDLE_RPM)));

  return (
    <div className="mt-1">
      <div className="flex items-baseline justify-between">
        <Readout value={live ? Math.round(rpm) : "----"} size="lg" tone={live ? "readout" : "text"} />
        <span
          className="text-[0.6rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--helm-text-dim)",
          }}
        >
          rpm
        </span>
      </div>

      <div className="mt-1 flex h-[0.55rem] items-stretch gap-[2px]">
        {Array.from({ length: segments }, (_, index) => {
          const isLit = index < lit;
          const isRed = index >= redlineSegment;
          const color = isRed ? "var(--helm-danger)" : "var(--helm-readout)";

          return (
            <span
              key={index}
              className="flex-1 rounded-[1px]"
              style={{
                background: isLit ? color : "var(--helm-inset)",
                boxShadow: isLit ? `0 0 6px -1px ${color}` : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="relative mt-0.5 h-[0.3rem]">
        <span
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
          style={{ background: "var(--helm-inset-edge)" }}
        />
        <span
          className="absolute top-1/2 h-[0.3rem] w-[2px] -translate-y-1/2 rounded-full transition-[left]"
          style={{
            left: `calc(${demandFraction * 100}% - 1px)`,
            background: demand < 0 ? "var(--helm-warn)" : "var(--helm-accent)",
            boxShadow: `0 0 6px ${demand < 0 ? "var(--helm-warn)" : "var(--helm-accent)"}`,
          }}
        />
      </div>

      <div className="mt-0.5 flex items-center justify-between">
        <PanelLabel dim className="!text-[0.57rem]">
          {demand < -0.02 ? "astern" : demand > 0.02 ? "ahead" : "neutral"}
        </PanelLabel>
        <Readout value={formatSigned(demand)} size="sm" tone="text" />
      </div>
    </div>
  );
}

function AnalogTach({ rpm, demand, live }: { rpm: number; demand: number; live: boolean }) {
  const fraction = live
    ? Math.min(1, Math.max(0, (rpm - TACH_IDLE_RPM) / (TACH_MAX_RPM - TACH_IDLE_RPM)))
    : 0;
  const angle = -132 + fraction * 264;
  const ticks = useMemo(() => Array.from({ length: 13 }, (_, index) => -132 + index * 22), []);

  return (
    <div className="mt-1">
      <svg viewBox="0 0 100 100" className="mx-auto h-24 w-24">
        <circle cx="50" cy="50" r="47" fill="rgba(0,0,0,0.20)" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="var(--helm-edge)"
          strokeWidth="1"
        />
        {ticks.map((tick, index) => (
          <line
            key={tick}
            x1="50"
            y1="10"
            x2="50"
            y2={index % 2 === 0 ? 17 : 14}
            stroke={
              index >= 11 ? "var(--helm-danger)" : "var(--helm-text-dim)"
            }
            strokeWidth={index % 2 === 0 ? 1.6 : 1}
            transform={`rotate(${tick} 50 50)`}
          />
        ))}
        <g transform={`rotate(${angle} 50 50)`}>
          <polygon
            points="50,14 47.4,52 52.6,52"
            fill="var(--helm-danger)"
            opacity={live ? 1 : 0.35}
          />
        </g>
        <circle cx="50" cy="50" r="4.2" fill="var(--helm-trim)" />
        <circle cx="50" cy="50" r="4.2" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
        <text
          x="50"
          y="74"
          textAnchor="middle"
          style={{
            fontFamily: "var(--helm-font-readout)",
            fontSize: "11px",
            fill: "var(--helm-text)",
          }}
        >
          {live ? Math.round(rpm) : "----"}
        </text>
        <text
          x="50"
          y="84"
          textAnchor="middle"
          style={{
            fontFamily: "var(--helm-font-label)",
            fontSize: "6.5px",
            letterSpacing: "1.4px",
            fill: "var(--helm-text-dim)",
          }}
        >
          RPM
        </text>
      </svg>
      <div className="mt-0.5 flex items-center justify-between">
        <PanelLabel dim className="!text-[0.57rem]">
          {demand < -0.02 ? "astern" : demand > 0.02 ? "ahead" : "neutral"}
        </PanelLabel>
        <Readout value={formatSigned(demand)} size="sm" tone="text" />
      </div>
    </div>
  );
}

function formatSigned(value: number, digits = 2) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
}

// --- compass -----------------------------------------------------------------

/**
 * A card compass: the card turns under a fixed lubber line, the way a real one
 * does. The digital heading sits in the middle for the boats that have one.
 */
export function CompassRose({
  headingDeg,
  sizeRem = 5.5,
  showDigits = true,
}: {
  headingDeg: number;
  sizeRem?: number;
  showDigits?: boolean;
}) {
  const heading = ((headingDeg % 360) + 360) % 360;
  const cardinals: Array<[number, string]> = [
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
      className="shrink-0"
    >
      <defs>
        <radialGradient id="compass-face" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.30)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="48" fill="url(#compass-face)" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--helm-edge)" strokeWidth="1.2" />

      {/* The card rotates the opposite way to the boat. */}
      <g transform={`rotate(${-heading} 50 50)`}>
        {Array.from({ length: 72 }, (_, index) => {
          const angle = index * 5;
          const major = angle % 30 === 0;
          return (
            <line
              key={angle}
              x1="50"
              y1="5"
              x2="50"
              y2={major ? 12 : 8.5}
              stroke={major ? "var(--helm-label)" : "var(--helm-text-dim)"}
              strokeWidth={major ? 1.3 : 0.7}
              opacity={major ? 0.85 : 0.45}
              transform={`rotate(${angle} 50 50)`}
            />
          );
        })}
        {cardinals.map(([angle, name]) => (
          <text
            key={name}
            x="50"
            y="21"
            textAnchor="middle"
            transform={`rotate(${angle} 50 50)`}
            style={{
              fontFamily: "var(--helm-font-label)",
              fontSize: name.length > 1 ? "6px" : "8.5px",
              letterSpacing: "0.5px",
              fill: name === "N" ? "var(--helm-accent)" : "var(--helm-label)",
              opacity: name.length > 1 ? 0.6 : 0.95,
            }}
          >
            {name}
          </text>
        ))}
      </g>

      {/* Fixed lubber line at the top. */}
      <polygon points="50,2 46.6,10 53.4,10" fill="var(--helm-accent)" />

      {showDigits ? (
        <>
          <rect
            x="31"
            y="43"
            width="38"
            height="16"
            rx="3"
            fill="rgba(0,0,0,0.45)"
            stroke="var(--helm-edge)"
            strokeWidth="0.7"
          />
          <text
            x="50"
            y="55"
            textAnchor="middle"
            style={{
              fontFamily: "var(--helm-font-readout)",
              fontSize: "12px",
              fill: "var(--helm-readout)",
            }}
          >
            {Math.round(heading).toString().padStart(3, "0")}
          </text>
        </>
      ) : null}
    </svg>
  );
}

// --- wind / current ----------------------------------------------------------

/**
 * Flow dial. The arrow points the way the wind or tide pushes the boat, drawn
 * through the exact centre of the rose; the small tick on the bezel is the
 * boat's own heading so you can read the set relative to your bow at a glance.
 */
export function FlowDial({
  label,
  knots,
  towardDeg,
  headingDeg,
  sizeRem = 3.4,
  tone = "accent",
}: {
  label: string;
  knots: number;
  towardDeg: number;
  headingDeg?: number;
  sizeRem?: number;
  tone?: "accent" | "good" | "warn";
}) {
  const active = knots > 0.05;
  const fromDeg = (((towardDeg + 180) % 360) + 360) % 360;
  const color = `var(--helm-${tone})`;

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 100 100"
        style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem` }}
        className="shrink-0"
        role="img"
        aria-label={
          active
            ? `${label} ${knots.toFixed(1)} knots from ${Math.round(fromDeg)} degrees true`
            : `No ${label.toLowerCase()}`
        }
      >
        <circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.25)" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--helm-edge)" strokeWidth="1.2" />

        {[0, 90, 180, 270].map((angle) => (
          <line
            key={angle}
            x1="50"
            y1="7"
            x2="50"
            y2="14"
            stroke="var(--helm-text-dim)"
            strokeWidth="1.1"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
        <text
          x="50"
          y="20"
          textAnchor="middle"
          style={{
            fontFamily: "var(--helm-font-label)",
            fontSize: "9px",
            fill: "var(--helm-label-dim)",
          }}
        >
          N
        </text>

        {headingDeg !== undefined ? (
          <g transform={`rotate(${headingDeg} 50 50)`}>
            <polygon points="50,3 47,10 53,10" fill="var(--helm-text-dim)" opacity="0.9" />
          </g>
        ) : null}

        {active ? (
          <g transform={`rotate(${towardDeg} 50 50)`}>
            <line
              x1="50"
              y1="72"
              x2="50"
              y2="32"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <polygon points="50,24 40,40 60,40" fill={color} />
          </g>
        ) : (
          <line
            x1="40"
            y1="50"
            x2="60"
            y2="50"
            stroke="var(--helm-text-dim)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
      </svg>

      <div className="min-w-0 leading-tight">
        <PanelLabel dim className="!text-[0.62rem]">
          {label}
        </PanelLabel>
        <div className="mt-0.5">
          <Readout value={knots.toFixed(1)} unit="kn" size="sm" tone="text" />
        </div>
        <span
          className="block text-[0.62rem] leading-none"
          style={{
            fontFamily: "var(--helm-font-label)",
            letterSpacing: "0.12em",
            color: "var(--helm-text-dim)",
          }}
        >
          {active ? `FROM ${Math.round(fromDeg).toString().padStart(3, "0")}T` : "CALM"}
        </span>
      </div>
    </div>
  );
}

/** Depth sounder: big lit number, plus a shoal warning when it gets thin. */
export function DepthSounder({
  feet,
  draftFeet,
  compact,
}: {
  feet: number | undefined;
  draftFeet: number;
  compact?: boolean;
}) {
  const underKeel = feet === undefined ? undefined : feet - draftFeet;
  const tone =
    underKeel === undefined
      ? "text"
      : underKeel < 2
        ? "danger"
        : underKeel < 6
          ? "warn"
          : "readout";
  const displayedDepth =
    feet === undefined ? "--" : feet < 10 ? feet.toFixed(1) : Math.round(feet);

  return (
    <Well className={compact ? "px-2 py-1.5" : "px-2.5 py-2"}>
      <div className="flex items-baseline justify-between gap-2">
        <PanelLabel dim className="!text-[0.62rem]">
          Depth
        </PanelLabel>
        <Readout
          value={displayedDepth}
          unit="ft"
          size={compact ? "sm" : "md"}
          tone={tone}
        />
      </div>
      {!compact ? (
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <PanelLabel dim className="!text-[0.57rem]">
            Under keel
          </PanelLabel>
          <Readout
            value={underKeel === undefined ? "--" : underKeel.toFixed(1)}
            unit="ft"
            size="sm"
            tone={tone}
          />
        </div>
      ) : null}
    </Well>
  );
}
