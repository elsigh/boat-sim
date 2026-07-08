import { Suspense } from "react";

import { BoatSimulatorRoute } from "@/components/sim/BoatSimulatorRoute";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <BoatSimulatorRoute />
    </Suspense>
  );
}
