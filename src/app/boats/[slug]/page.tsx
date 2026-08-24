import Link from "next/link";
import { notFound } from "next/navigation";

import { BOAT_CATALOG, findBoatProfile } from "@/lib/boats/catalog";

type BoatProfilePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return BOAT_CATALOG.map((boat) => ({ slug: boat.profileSlug }));
}

export default async function BoatProfilePage({ params }: BoatProfilePageProps) {
  const { slug } = await params;
  const boat = findBoatProfile(slug);

  if (!boat) {
    notFound();
  }

  return (
    <main className="min-h-dvh bg-[#07131c] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-sky-200/70">
              Boat Profile
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              {boat.displayName} · {boat.manufacturer} {boat.model}
            </h1>
            <p className="mt-3 max-w-4xl text-slate-300">{boat.description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/?boat=${boat.profileSlug}`}
              className="rounded-full bg-sky-300/15 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-300/20"
            >
              Open In Simulator
            </Link>
            <Link
              href="/boats"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
            >
              All Boats
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/12 bg-slate-950/70 p-5 shadow-2xl">
            <p className="text-[0.65rem] uppercase tracking-[0.24em] text-cyan-100/70">
              Operating Profile
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{boat.summary}</p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {boat.highlights.map((highlight) => (
                <div key={highlight} className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200">
                  {highlight}
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <SpecCell label="LOA" value={boat.stats.loa} />
              <SpecCell label="Beam" value={boat.stats.beam} />
              <SpecCell label="Draft" value={boat.stats.draft} />
              <SpecCell label="Displacement" value={boat.stats.displacement} />
              <SpecCell label="Cruise Speed" value={boat.stats.cruiseSpeed} />
              <SpecCell label="Max Speed" value={boat.stats.maxSpeed} />
              <SpecCell label="Engines" value={boat.stats.engineNotes} />
              <SpecCell label="Thrusters" value={boat.stats.thruster} />
              <SpecCell label="Stabilizers" value={boat.stats.stabilizers} />
              <SpecCell label="Fuel" value={boat.stats.fuel} />
              <SpecCell label="Water" value={boat.stats.water} />
              <SpecCell label="Holding" value={boat.stats.holding} />
              <SpecCell label="Cabins" value={String(boat.stats.cabins)} />
              <SpecCell label="Sleeps" value={String(boat.stats.sleeps)} />
              {boat.stats.sternThruster ? (
                <SpecCell label="Stern Thruster" value={boat.stats.sternThruster} />
              ) : null}
              {boat.homePort ? <SpecCell label="Home Port" value={boat.homePort} /> : null}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-white/12 bg-slate-950/70 p-5 shadow-2xl">
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-fuchsia-100/70">
                Sources
              </p>
              <div className="mt-4 space-y-3">
                {boat.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/8"
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/12 bg-slate-950/70 p-5 shadow-2xl">
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-amber-100/70">
                Simulation Notes
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>
                  Physics and visuals are generated from this profile, so hull dimensions,
                  displacement, thrust envelope, and visual proportions stay aligned.
                </p>
                <p>
                  Status: <span className="font-mono uppercase text-slate-100">{boat.simStatus}</span>
                </p>
                <p>
                  Charter page:{" "}
                  <a
                    href={boat.charterUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-200 underline underline-offset-4"
                  >
                    NW Explorations
                  </a>
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-sm text-slate-100">{value}</p>
    </div>
  );
}
