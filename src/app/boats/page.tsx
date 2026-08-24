import Link from "next/link";

import { listBoatProfiles } from "@/lib/boats/catalog";

export default function BoatsPage() {
  const boats = listBoatProfiles();

  return (
    <main className="min-h-dvh bg-[#07131c] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-sky-200/70">
              Boat Catalog
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Available Yacht Profiles</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Each profile is a shared source of truth for simulator dimensions, handling data,
              and reference specs.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
          >
            Back To Simulator
          </Link>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {boats.map((boat) => (
            <article
              key={boat.profileSlug}
              className="rounded-3xl border border-white/12 bg-slate-950/70 p-5 shadow-2xl"
            >
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

              <div className="mt-5 flex flex-wrap gap-3">
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
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
