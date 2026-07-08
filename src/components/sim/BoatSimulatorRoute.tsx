"use client";

import { useSearchParams } from "next/navigation";

import { BoatSimulator } from "./BoatSimulator";

/**
 * Client-side wrapper that reads the boat selection from the query string,
 * keeping the home page statically exportable for the desktop build.
 */
export function BoatSimulatorRoute() {
  const searchParams = useSearchParams();

  return <BoatSimulator initialBoatSlug={searchParams.get("boat") ?? undefined} />;
}
