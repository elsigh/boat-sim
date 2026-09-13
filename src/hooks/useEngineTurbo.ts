"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { GamepadSnapshot } from "./useGamepad";
import { createTurboControlState, readTurboButtons, stepTurboControls, TURBO_MIN_THROTTLE, type TurboSelection } from "@/lib/sim/turbo-controls";
import { normalizeThrottle } from "@/lib/sim/engine-dynamics";

export function readTurboEligibility(controls: Pick<GamepadSnapshot, "portLever" | "starboardLever">, running: TurboSelection, disabled = false): TurboSelection {
  return {
    port: !disabled && running.port && normalizeThrottle(controls.portLever) >= TURBO_MIN_THROTTLE,
    starboard: !disabled && running.starboard && normalizeThrottle(controls.starboardLever) >= TURBO_MIN_THROTTLE,
  };
}

export function useEngineTurbo(controls: GamepadSnapshot, eligible: TurboSelection, resetKey: string, leversSwapped: boolean) {
  const [state, setState] = useState(createTurboControlState);
  const deviceId = controls.hardwareGamepadId;
  const buttons = readTurboButtons(deviceId, controls.rawButtons, leversSwapped);
  // Reversing the lever assignment also requires fresh button presses.
  const mappingKey = `${resetKey}:${leversSwapped}`;

  useEffect(() => {
    setState((current) => stepTurboControls(current, { buttons, eligible, deviceId, resetKey: mappingKey }));
  }, [buttons.port, buttons.starboard, eligible.port, eligible.starboard, deviceId, mappingKey]);

  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== "KeyT" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    event.preventDefault();
    setState((current) => stepTurboControls(current, { buttons, eligible, deviceId, resetKey: mappingKey, keyboardToggle: true }));
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const current = state.resetKey === mappingKey && state.deviceId === deviceId;
  return { port: current && eligible.port && state.active.port, starboard: current && eligible.starboard && state.active.starboard };
}
