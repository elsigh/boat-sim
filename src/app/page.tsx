import type { Metadata } from "next";
import { Suspense } from "react";

import { BoatSimulatorRoute } from "@/components/sim/BoatSimulatorRoute";
import { SimulatorLoading } from "@/components/sim/SimulatorLoading";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <Suspense fallback={<SimulatorLoading />}>
      <BoatSimulatorRoute />
    </Suspense>
  );
}
