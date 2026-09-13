"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { readSessionSelection, type SessionSelection } from "@/lib/sim/session-preferences";

import { BoatSimulator } from "./BoatSimulator";

/**
 * Resolve tab preferences before mounting the simulator so its scene, spawn,
 * and instruments agree on the first frame. The page stays statically exportable.
 */
export function BoatSimulatorRoute() {
  const searchParams = useSearchParams();
  const boatFromUrl = searchParams.get("boat");
  const [initialSelection, setInitialSelection] = useState<SessionSelection | null>(null);

  useEffect(() => {
    // Later query updates come from the live boat picker; don't reset the scene.
    if (!initialSelection) setInitialSelection(readSessionSelection(boatFromUrl));
  }, [boatFromUrl, initialSelection]);

  if (!initialSelection) return <div className="h-dvh bg-[#07131c]" aria-busy="true" aria-label="Loading simulator" />;

  return <BoatSimulator initialBoatSlug={initialSelection.boatSlug} initialStopId={initialSelection.stopId} />;
}
