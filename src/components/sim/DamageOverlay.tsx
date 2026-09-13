"use client";

import { damageHandling, type VesselDamage } from "@/lib/sim/vessel-damage";
import type { ImpactIncident } from "@/lib/sim/collision-damage";
import type { DamageCostEstimate } from "@/lib/sim/damage-cost";

import styles from "./DamageOverlay.module.css";

type DamageOverlayProps = {
  damage: VesselDamage;
  onRestart: () => void;
  incidents: ImpactIncident[];
  cost: DamageCostEstimate;
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

export function DamageOverlay({ damage, incidents, cost, onRestart }: DamageOverlayProps) {
  const { hullIntegrityPct } = damage;
  const handling = damageHandling(damage);
  const sunk = damage.sinking >= 1;
  const status = sunk ? "Vessel lost" : damage.sinking > 0 ? "Sinking · abandon the exercise" : damage.breakup > 0.15 ? "Hull breaking apart · uncontrolled flooding" : handling.stopped ? "Engines flooded · adrift" : damage.fire > 0 ? "Machinery fire" : damage.breach > 0 ? "Taking on water · bilge pump running" : "";
  const latest = incidents[incidents.length - 1] ?? null;
  const breached = damage.breach > 0;

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
      {incidents.length > 0 || hullIntegrityPct < 100 || cost.totalUsd > 0 ? (
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
            {cost.vesselUsd !== null || cost.totalUsd > 0 ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.62rem] uppercase tracking-[0.24em] text-red-100/70">{cost.vesselUsd === null ? "Est. property damage" : "Est. damage"}</p>
                  <p className="font-mono text-[0.9rem] text-red-200">{formatUsd(cost.totalUsd)}</p>
                </div>
                <dl className="mt-1 space-y-0.5 text-[0.65rem] text-slate-300">
                  {cost.vesselUsd !== null ? <div className="flex justify-between gap-3"><dt>{cost.totalLoss ? "Vessel · total loss" : "Vessel repairs"}</dt><dd className="font-mono">{formatUsd(cost.vesselUsd)}</dd></div> : null}
                  {cost.docksUsd > 0 ? <div className="flex justify-between gap-3"><dt>Docks & pilings</dt><dd className="font-mono">{formatUsd(cost.docksUsd)}</dd></div> : null}
                  {cost.otherBoatsUsd > 0 ? <div className="flex justify-between gap-3"><dt>Other boats</dt><dd className="font-mono">{formatUsd(cost.otherBoatsUsd)}</dd></div> : null}
                </dl>
              </div>
            ) : null}

            {status ? <p role="status" className="mt-2 text-xs font-semibold text-red-300">{status}</p> : null}
            {breached ? <div className="mt-2">
              <div className="flex justify-between text-[0.65rem] text-sky-200"><span>Flooding</span><span className="font-mono">{Math.round(damage.floodingPct)}%</span></div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${damage.floodingPct}%` }} /></div>
            </div> : null}
            {handling.portPower < 0.98 || handling.starboardPower < 0.98 ? <p className="mt-2 text-[0.65rem] text-amber-200">
              Available drive · port {Math.round(handling.portPower * 100)}% / starboard {Math.round(handling.starboardPower * 100)}%
            </p> : null}
            {breached || damage.fire > 0 ? <button type="button" onClick={onRestart} className="pointer-events-auto mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-sky-300">Repair & restart</button> : null}

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
