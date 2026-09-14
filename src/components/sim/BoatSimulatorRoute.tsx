"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { readSessionSelection, type SessionSelection } from "@/lib/sim/session-preferences";

import { BoatSimulator } from "./BoatSimulator";
import { SimulatorLoading } from "./SimulatorLoading";

/**
 * Resolve tab preferences before mounting the simulator so its scene, spawn,
 * and instruments agree on the first frame. The page stays statically exportable.
 */
export function BoatSimulatorRoute() {
  const searchParams = useSearchParams();
  const boatFromUrl = searchParams.get("boat");
  const [initialSelection, setInitialSelection] = useState<SessionSelection | null>(null);
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    // Later query updates come from the live boat picker; don't reset the scene.
    if (!initialSelection) setInitialSelection(readSessionSelection(boatFromUrl));
  }, [boatFromUrl, initialSelection]);

  return (
    <div className="relative h-dvh bg-[#07131c]" aria-busy={!ready}>
      <div inert={!ready} aria-hidden={!ready}>
        {/* Canvas forwards async physics loading to DOM Suspense. Keep that
            boundary inside the persistent startup screen, not around it. */}
        <Suspense fallback={null}>
          {initialSelection ? (
            <BoatSimulator
              initialBoatSlug={initialSelection.boatSlug}
              initialStopId={initialSelection.stopId}
              onReady={handleReady}
            />
          ) : null}
        </Suspense>
      </div>
      <SimulatorLoading ready={ready} />
    </div>
  );
}
