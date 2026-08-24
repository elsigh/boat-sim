"use client";

import type { ImpactIncident } from "@/lib/sim/collision-damage";
import type { BoatProfile } from "@/lib/boats/catalog";

import styles from "./DamageOverlay.module.css";

type DamageOverlayProps = {
  hullIntegrityPct: number;
  incidents: ImpactIncident[];
  selectedBoat?: BoatProfile;
};

function integrityColor(pct: number) {
  if (pct > 70) {
    return "bg-emerald-400";
  }

  if (pct > 40) {
    return "bg-amber-400";
  }

  return "bg-red-500";
}

const SEVERITY_LABEL: Record<ImpactIncident["severity"], string> = {
  scuff: "Scuff",
  minor: "Minor",
  major: "Major",
  severe: "Severe",
};

const SEVERITY_TEXT: Record<ImpactIncident["severity"], string> = {
  scuff: "text-slate-300",
  minor: "text-amber-300",
  major: "text-orange-400",
  severe: "text-red-400",
};

function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function DamageOverlay({ hullIntegrityPct, incidents, selectedBoat }: DamageOverlayProps) {
  const latest = incidents[incidents.length - 1] ?? null;
  const breached = hullIntegrityPct <= 0;
  const damagePct = Math.max(0, 100 - hullIntegrityPct);
  const replacement = selectedBoat?.economics?.replacementValueUsd ?? null;
  const estimatedCost =
    replacement !== null
      ? Math.min(
          replacement * 0.4,
          Math.round(Math.pow(damagePct / 100, 1.35) * 0.25 * replacement),
        )
      : null;

  return (
    <>
      {/* full-screen red flash on impact */}
      {latest ? (
        <div
          key={`flash-${latest.id}`}
          className={`pointer-events-none absolute inset-0 z-30 bg-red-600 ${
            latest.severity === "major" || latest.severity === "severe"
              ? styles.flashSevere
              : latest.severity === "minor"
                ? styles.flash
                : ""
          }`}
          style={{ opacity: 0 }}
        />
      ) : null}

      {/* damage panel: only appears once something has happened */}
      {incidents.length > 0 || hullIntegrityPct < 100 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(26rem,90vw)] -translate-x-1/2">
          <div className="rounded-2xl border border-white/12 bg-slate-950/74 px-4 py-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-red-100/70">
                Hull integrity
              </p>
              <p
                className={`font-mono text-sm font-semibold ${
                  breached ? "text-red-400" : "text-white"
                }`}
              >
                {Math.max(0, Math.round(hullIntegrityPct))}%
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${integrityColor(hullIntegrityPct)}`}
                style={{ width: `${Math.max(0, hullIntegrityPct)}%` }}
              />
            </div>
            {estimatedCost !== null ? (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[0.62rem] uppercase tracking-[0.24em] text-red-100/70">Est. repair</p>
                <p className="font-mono text-[0.9rem] text-red-200">{formatUsd(estimatedCost)}</p>
              </div>
            ) : null}

            {breached ? (
              <p className="mt-2 text-xs font-semibold text-red-400">
                Hull breached — she's taking on water. Restart the exercise.
              </p>
            ) : null}

            {latest ? (
              <div key={`incident-${latest.id}`} className={styles.incident}>
                <p className="mt-2 text-xs leading-snug text-slate-200">
                  <span
                    className={`mr-1.5 font-semibold uppercase tracking-wide ${SEVERITY_TEXT[latest.severity]}`}
                  >
                    {SEVERITY_LABEL[latest.severity]}
                  </span>
                  {latest.description}
                </p>
              </div>
            ) : null}

            {incidents.length > 1 ? (
              <p className="mt-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                {incidents.length} incidents this exercise
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
