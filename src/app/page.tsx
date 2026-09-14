import type { Metadata } from "next";
import { Suspense } from "react";

import { BoatSimulatorRoute } from "@/components/sim/BoatSimulatorRoute";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <Suspense fallback={null}>
      <BoatSimulatorRoute />
    </Suspense>
  );
}
