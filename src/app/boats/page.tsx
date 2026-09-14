import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BOAT_CATALOG } from "@/lib/boats/catalog";

export const metadata: Metadata = {
  title: "Meet the fleet | boat-sim",
  description: "Explore seven simulator boats, from a Cranchi runabout to a 114-foot motor yacht. See each boat, compare specs and estimated values, then take the helm.",
  alternates: { canonical: "/boats" },
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function BoatsPage() {
  return (
    <main className="min-h-dvh bg-[#07131c] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-sky-200/70">
              Boat Catalog
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Meet the fleet</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              From a runabout to a 114-foot motor yacht. Get a closer look, compare
              the specs, and find your next boat to bring into the slip.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
          >
            Back To Simulator
          </Link>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {BOAT_CATALOG.map((boat, index) => (
            <article
              key={boat.profileSlug}
              className="flex flex-col overflow-hidden rounded-3xl border border-white/12 bg-slate-950/70 shadow-2xl"
            >
              <Link
                href={`/boats/${boat.profileSlug}`}
                aria-label={`View ${boat.displayName} profile`}
                className="group relative block overflow-hidden bg-[#122631] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-sky-200"
              >
                <Image
                  src={`/media/boats/${boat.profileSlug}.webp`}
                  alt={`Three-quarter rendering of ${boat.displayName}, ${boat.manufacturer} ${boat.model}, showing the hull and deck layout`}
                  width={1200}
                  height={750}
                  sizes="(min-width: 1200px) 568px, (min-width: 1024px) calc((100vw - 64px) / 2), calc(100vw - 48px)"
                  loading={index < 2 ? "eager" : "lazy"}
                  className="h-auto w-full transition-transform duration-300 motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none"
                />
                <span className="absolute bottom-3 left-4 rounded-full border border-white/10 bg-[#07131c]/80 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.16em] text-sky-100/75">
                  Simulator rendering
                </span>
              </Link>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.24em] text-fuchsia-100/70">
                      {boat.manufacturer}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{boat.displayName}</h2>
                    <p className="text-slate-300">{boat.model}</p>
                  </div>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-slate-300">
                    {boat.simStatus}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300">{boat.summary}</p>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-200">
                  <div className="col-span-2 mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/10 pb-4">
                    <p className="text-slate-400">Est. Value <span className="text-xs">· USD</span></p>
                    <p className="font-mono text-xl tabular-nums text-sky-100">{usd.format(boat.economics.replacementValueUsd)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">LOA</p>
                    <p className="font-mono">{boat.stats.loa}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Beam</p>
                    <p className="font-mono">{boat.stats.beam}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Displacement</p>
                    <p className="font-mono">{boat.stats.displacement}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Engines</p>
                    <p className="font-mono">{boat.stats.engineNotes}</p>
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap gap-3 pt-5">
                  <Link
                    href={`/?boat=${boat.profileSlug}`}
                    className="rounded-full bg-sky-300/15 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-300/20"
                  >
                    Open In Simulator
                  </Link>
                  <Link
                    href={`/boats/${boat.profileSlug}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-6 text-slate-400">
          Estimated values are rounded USD baselines for comparable boats, reviewed
          September 2026. <a href="https://github.com/elsigh/boat-sim/blob/main/docs/vessel-values.md" className="text-sky-200 underline underline-offset-4 hover:text-sky-100">Value notes and sources</a>.
        </p>
      </div>
    </main>
  );
}
