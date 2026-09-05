"use client";

import type { BoatProfile } from "@/lib/boats/catalog";

type GroundingOverlayProps = {
  boat: BoatProfile;
  depthFeet: number;
  draftFeet: number;
  onRestart: () => void;
};

function formatFeet(feet: number) {
  const totalInches = Math.round(feet * 12);
  const wholeFeet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${wholeFeet}' ${inches}\"`;
}

export function GroundingOverlay({
  boat,
  depthFeet,
  draftFeet,
  onRestart,
}: GroundingOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-amber-950/25 p-4 backdrop-blur-[2px]">
      <div className="pointer-events-auto w-[26rem] max-w-full rounded-3xl border border-amber-300/30 bg-slate-950/92 px-6 py-6 text-center shadow-2xl">
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.34em] text-amber-300">
          Aground
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">{boat.displayName} is beached</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          The charted water depth fell below the boat&apos;s draft. The keel is on the bottom and the exercise is over.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 font-mono">
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">Depth</p>
            <p className="mt-1 text-lg text-amber-200">{depthFeet.toFixed(1)} ft</p>
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">Draft</p>
            <p className="mt-1 text-lg text-white">{formatFeet(draftFeet)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRestart}
          className="mt-5 w-full rounded-xl border border-amber-300/35 bg-amber-300/15 px-4 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-300/22"
        >
          Restart exercise
        </button>
      </div>
    </div>
  );
}
