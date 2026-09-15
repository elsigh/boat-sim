import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BOAT_CATALOG, DEFAULT_BOAT_SLUG } from "@/lib/boats/catalog";
import { getMarinaLayout } from "@/lib/marinas";
import { SAN_JUAN_AUG_2026_SCENARIO } from "@/lib/scenarios/san-juan-aug-2026";
import type { TwinEngineState } from "@/hooks/useEngineState";

import { DockingOverlay } from "./DockingOverlay";

const boat = BOAT_CATALOG.find((entry) => entry.profileSlug === DEFAULT_BOAT_SLUG)!;
const marina = getMarinaLayout("roche-harbor-marina");
const spawn = marina.spawns[0]!;
const berth = marina.berths[0] ?? null;
const noop = () => {};

const engineChannel = {
  turboActive: false,
  masterOn: true,
  starting: false,
  running: false,
  demandThrottle: 0,
  effectiveThrottle: 0,
  rpm: 0,
  gear: 0 as const,
  shifting: false,
};

const engineState: TwinEngineState = {
  ignitionPressed: false,
  port: engineChannel,
  starboard: engineChannel,
};

const telemetry = {
  headingDeg: 0,
  speedKnots: 0,
  speedThroughWaterKnots: 0,
  waterSurgeSpeedKnots: 0,
  yawRateDegPerSecond: 0,
  lateralDriftKnots: 0,
  surgeSpeedKnots: 0,
  worldX: 0,
  worldZ: 0,
  worldVelocityX: 0,
  worldVelocityZ: 0,
};

function renderHud() {
  return renderToStaticMarkup(
    <DockingOverlay
      activeLegIndex={0}
      audioEnabled={false}
      audioSupported
      availableBoats={BOAT_CATALOG}
      conditionsMode="typical"
      controls={{
        connected: false,
        gamepadId: null,
        hardwareGamepadId: null,
        gamepadIndex: 0,
        throttleMode: "dualAxis",
        portThrottle: 0,
        starboardThrottle: 0,
        portLever: 0,
        starboardLever: 0,
        bowThruster: 0,
        splitThrottlePosition: null,
        splitThrottleAxis: null,
        rawAxes: [],
        rawButtons: [],
        updatedAt: 0,
      }}
      currentStopId="roche-harbor-marina"
      engineState={engineState}
      suppressEngineStart
      guidance={null}
      hardwareHelmConnected={false}
      onSelectStop={noop}
      hudVisible
      leversSwapped={false}
      mapBoatCoordinate={null}
      marina={marina}
      onCalibrateQuadrantIdle={noop}
      onClearQuadrantIdle={noop}
      onToggleHud={noop}
      onToggleLeverSwap={noop}
      onBoatChange={noop}
      quadrantIdleCalibrated={false}
      onConditionsModeChange={noop}
      onEnableEngines={noop}
      onEnableAudio={noop}
      onRestartBoat={noop}
      onSelectBerth={noop}
      onSelectSpawn={noop}
      onStartEngines={noop}
      onSelectLeg={noop}
      onResetToStop={noop}
      onTogglePortEngine={noop}
      onToggleStarboardEngine={noop}
      selectedBerth={berth}
      selectedBoat={boat}
      selectedSpawn={spawn}
      vhfRadio={{
        monitoring: false,
        supported: false,
        receiving: false,
        toggleMonitoring: noop,
      }}
      onViewportWheel={noop}
      scenario={SAN_JUAN_AUG_2026_SCENARIO}
      telemetry={telemetry}
      viewMode="plan"
      onViewModeChange={noop}
      viewportBindings={{
        onPointerCancel: noop,
        onPointerDown: noop,
        onPointerMove: noop,
        onPointerUp: noop,
      }}
      viewportDragging={false}
      plotterExpanded={false}
      onPlotterExpandedChange={noop}
    />,
  );
}

test("About lives in the Active boat module and still points at /about", () => {
  const markup = renderHud();
  const aboutLinks = [...markup.matchAll(/href="\/about"/g)];
  assert.ok(aboutLinks.length >= 1, "About should still navigate to /about");

  const boatPlate = markup.slice(markup.indexOf("Active boat"));
  assert.match(boatPlate, /href="\/about"/);
  assert.match(boatPlate, />About</);
});
