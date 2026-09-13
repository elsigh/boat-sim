"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoatProfile } from "@/lib/boats/catalog";
import type { DamageCostEstimate } from "@/lib/sim/damage-cost";
import type { VesselDamage } from "@/lib/sim/vessel-damage";
import { GroundingOverlay } from "./GroundingOverlay";

type OutcomeProps = {
  boat: BoatProfile;
  damage: VesselDamage;
  cost: DamageCostEstimate;
  grounding: { depthFeet: number; draftFeet: number } | null;
  onRestart: () => void;
};

export function ExerciseOutcomeOverlay(props: OutcomeProps) {
  // Ground contact is still physical, but cannot override a vessel write-off.
  // Re-evaluate on every damage sample so a grounding can escalate into a loss.
  if (props.cost.totalLoss) return <TotalLossOverlay {...props} />;
  if (props.grounding) return <GroundingOverlay boat={props.boat} {...props.grounding} onRestart={props.onRestart} />;
  return null;
}

const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function TotalLossOverlay({ boat, damage, cost, onRestart }: OutcomeProps) {
  const [reportVisible, setReportVisible] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!reportVisible) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [reportVisible]);

  if (!reportVisible) return (
    <button type="button" onClick={() => setReportVisible(true)}
      className="pointer-events-auto absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-300/35 bg-slate-950/90 px-4 py-3 text-sm font-semibold text-red-200 shadow-xl hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-red-300">
      View loss report
    </button>
  );

  const destroyed = damage.hullIntegrityPct <= 0 || damage.breakup >= 0.65;
  const condition = damage.sinking >= 1 ? "has sunk" : destroyed ? "is destroyed"
    : damage.sinking > 0 ? "is sinking" : "is a total loss";
  const status = damage.sinking >= 1 ? "Vessel sunk" : damage.sinking > 0 ? "Sinking"
    : damage.breakup >= 0.65 ? "Hull breaking apart" : "Beyond economic repair";

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); setReportVisible(false); }}
      className="pointer-events-auto m-auto max-h-[calc(100dvh-2rem)] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border border-red-300/30 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-red-950/30 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">
        {destroyed ? "Total destruction" : "Total loss"}
      </p>
      <h2 id={titleId} className="mt-2 text-2xl font-semibold leading-tight">{`${boat.displayName} ${condition}`}</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-slate-300">
        The vessel is a total loss. The damage estimate includes its full value and any damage to the marina or other boats.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3">
        <div><dt className="text-xs text-slate-400">Hull integrity</dt><dd className="mt-1 font-mono text-lg text-red-200">{Math.max(0, Math.round(damage.hullIntegrityPct))}%</dd></div>
        <div><dt className="text-xs text-slate-400">Flooding</dt><dd className="mt-1 font-mono text-lg text-sky-200">{Math.round(damage.floodingPct)}%</dd></div>
      </dl>
      <p role="status" className="mt-2 text-xs font-semibold text-red-300">
        {status}{damage.fire > 0 && damage.sinking < 1 ? " · Active fire" : ""}
      </p>

      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <div className="flex justify-between gap-3"><dt>Vessel · total loss</dt><dd className="font-mono text-white">{cost.vesselUsd === null ? "Unvalued" : usd.format(cost.vesselUsd)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Docks &amp; pilings</dt><dd className="font-mono">{usd.format(cost.docksUsd)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Other boats</dt><dd className="font-mono">{usd.format(cost.otherBoatsUsd)}</dd></div>
        <div className="flex items-baseline justify-between gap-3 border-t border-white/15 pt-3"><dt className="font-semibold text-white">Est. total damage</dt><dd className="font-mono text-xl font-semibold text-red-200">{usd.format(cost.totalUsd)}</dd></div>
      </dl>

      <button type="button" onClick={onRestart}
        className="mt-5 w-full rounded-xl border border-red-300/35 bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-400/25 focus-visible:outline-2 focus-visible:outline-red-300">
        Restart exercise
      </button>
      <button type="button" onClick={() => setReportVisible(false)}
        className="mt-2 w-full rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-red-300">
        Watch the wreck
      </button>
    </dialog>
  );
}
