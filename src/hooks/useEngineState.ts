"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { GamepadSnapshot } from "@/hooks/useGamepad";
import { readTurboEligibility, useEngineTurbo } from "./useEngineTurbo";
import { createEngineDynamics, normalizeThrottle, stepEngineDynamics, DEFAULT_ENGINE, type EngineSpecification, type EngineGear } from "@/lib/sim/engine-dynamics";

export type EngineChannelState = {
  turboActive: boolean;
  turboStatus?: string;
  masterOn: boolean;
  starting: boolean;
  running: boolean;
  demandThrottle: number;
  effectiveThrottle: number;
  rpm: number;
  gear: EngineGear;
  shifting: boolean;
};

export type TwinEngineState = {
  ignitionPressed: boolean;
  port: EngineChannelState;
  starboard: EngineChannelState;
};

export type EngineControlOverrides = {
  portMasterOn?: boolean;
  starboardMasterOn?: boolean;
  ignitionRequestId?: number;
};

type RuntimeState = {
  portStarting: boolean;
  portRunning: boolean;
  starboardStarting: boolean;
  starboardRunning: boolean;
};

type RuntimeAction =
  | {
      type: "sync-master";
      portMasterOn: boolean;
      starboardMasterOn: boolean;
    }
  | {
      type: "start-request";
      engine: "port" | "starboard";
    }
  | {
      type: "start-complete" | "cancel-start";
      engine: "port" | "starboard";
    };

const DEFAULT_RUNTIME_STATE: RuntimeState = {
  portStarting: false,
  portRunning: false,
  starboardStarting: false,
  starboardRunning: false,
};

function runtimeReducer(state: RuntimeState, action: RuntimeAction): RuntimeState {
  switch (action.type) {
    case "sync-master":
      return {
        portStarting: action.portMasterOn ? state.portStarting : false,
        portRunning: action.portMasterOn ? state.portRunning : false,
        starboardStarting: action.starboardMasterOn ? state.starboardStarting : false,
        starboardRunning: action.starboardMasterOn ? state.starboardRunning : false,
      };
    case "start-request":
      if (action.engine === "port") {
        if (state.portRunning || state.portStarting) {
          return state;
        }

        return {
          ...state,
          portStarting: true,
        };
      }

      if (state.starboardRunning || state.starboardStarting) {
        return state;
      }

      return {
        ...state,
        starboardStarting: true,
      };
    case "cancel-start":
      return action.engine === "port" ? { ...state, portStarting: false } : { ...state, starboardStarting: false };
    case "start-complete":
      if (action.engine === "port") {
        return {
          ...state,
          portStarting: false,
          portRunning: true,
        };
      }

      return {
        ...state,
        starboardStarting: false,
        starboardRunning: true,
      };
    default:
      return state;
  }
}

export function useEngineState(
  controls: GamepadSnapshot,
  overrides: EngineControlOverrides = {},
  specification: EngineSpecification = DEFAULT_ENGINE,
  turboOptions: { disabled?: boolean; resetKey?: string; leversSwapped?: boolean } = {},
): TwinEngineState {
  const [runtimeState, dispatch] = useReducer(runtimeReducer, DEFAULT_RUNTIME_STATE);
  const [propulsion, setPropulsion] = useState(() => ({ port: createEngineDynamics(), starboard: createEngineDynamics() }));
  const previousIgnitionPressedRef = useRef(false);
  const previousIgnitionRequestIdRef = useRef(overrides.ignitionRequestId ?? 0);
  const portTimerRef = useRef<number | null>(null);
  const starboardTimerRef = useRef<number | null>(null);
  const targetThrottleRef = useRef({ port: 0, starboard: 0, portRunning: false, starboardRunning: false, portStarting: false, starboardStarting: false, portTurbo: false, starboardTurbo: false });
  const specificationRef = useRef(specification);
  useEffect(() => {
    specificationRef.current = specification;
    // A new engine range must not inherit the last boat's revs or clutch state.
    setPropulsion({ port: createEngineDynamics(), starboard: createEngineDynamics() });
    // Cancel an unfinished start when changing vessels; an old starter timer
    // must not start a different engine after the switch.
    if (portTimerRef.current !== null) window.clearTimeout(portTimerRef.current);
    if (starboardTimerRef.current !== null) window.clearTimeout(starboardTimerRef.current);
    portTimerRef.current = null;
    starboardTimerRef.current = null;
    dispatch({ type: "cancel-start", engine: "port" });
    dispatch({ type: "cancel-start", engine: "starboard" });
  }, [specification]);

  const portMasterOn = Boolean(overrides.portMasterOn) || (controls.rawButtons[2] ?? 0) > 0.5;
  const starboardMasterOn =
    Boolean(overrides.starboardMasterOn) || (controls.rawButtons[3] ?? 0) > 0.5;
  const ignitionPressed = (controls.rawButtons[7] ?? 0) > 0.5;
  const throttleDemand = useMemo(
    () => ({ port: normalizeThrottle(controls.portThrottle), starboard: normalizeThrottle(controls.starboardThrottle) }),
    [controls.portThrottle, controls.starboardThrottle],
  );
  // Switch presses must use the lever's current position. Waiting for axis
  // smoothing used to discard quick presses at full travel after a restart.
  // Propulsion still waits for the clutch and smoothed throttle to spool up.
  const turboEligibility = readTurboEligibility(controls, {
    port: portMasterOn && runtimeState.portRunning,
    starboard: starboardMasterOn && runtimeState.starboardRunning,
  }, turboOptions.disabled);
  const turbo = useEngineTurbo(controls, turboEligibility,
    turboOptions.resetKey ?? specification.label, turboOptions.leversSwapped ?? false);
  const turboStatus = (side: "port" | "starboard", running: boolean) =>
    turboOptions.disabled ? "Turbo unavailable"
      : !running ? "Turbo · start engine"
      : turbo[side] ? "Turbo engaged"
      : turboEligibility[side] ? "Turbo ready · press button / T"
      : "Turbo · move fully ahead";
  const portTurboStatus = turboStatus("port", portMasterOn && runtimeState.portRunning);
  const starboardTurboStatus = turboStatus("starboard", starboardMasterOn && runtimeState.starboardRunning);

  useEffect(() => {
    targetThrottleRef.current = {
      portTurbo: turbo.port,
      starboardTurbo: turbo.starboard,
      portRunning: portMasterOn && runtimeState.portRunning,
      starboardRunning: starboardMasterOn && runtimeState.starboardRunning,
      portStarting: runtimeState.portStarting,
      starboardStarting: runtimeState.starboardStarting,
      port: portMasterOn && runtimeState.portRunning ? throttleDemand.port : 0,
      starboard:
        starboardMasterOn && runtimeState.starboardRunning
          ? throttleDemand.starboard
          : 0,
    };
  }, [
    portMasterOn,
    runtimeState.portRunning,
    runtimeState.starboardRunning,
    runtimeState.portStarting,
    runtimeState.starboardStarting,
    starboardMasterOn,
    throttleDemand.port,
    throttleDemand.starboard,
    turbo.port,
    turbo.starboard,
  ]);

  useEffect(() => {
    let frameId = 0;
    let lastFrameAt = performance.now();

    const tick = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.08, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      setPropulsion((current) => {
        const target = targetThrottleRef.current;
        const next = {
          port: stepEngineDynamics(current.port, target.port, target.portRunning, target.portStarting, deltaSeconds, specificationRef.current, target.portTurbo),
          starboard: stepEngineDynamics(current.starboard, target.starboard, target.starboardRunning, target.starboardStarting, deltaSeconds, specificationRef.current, target.starboardTurbo),
        };

        if (["port", "starboard"].every((key) => {
          const side = key as "port" | "starboard";
          return next[side].turboActive === current[side].turboActive && next[side].effectiveThrottle === current[side].effectiveThrottle && next[side].gear === current[side].gear && next[side].shiftRemaining === current[side].shiftRemaining && Math.abs(next[side].rpm - current[side].rpm) < 0.1;
        })) {
          return current;
        }

        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!portMasterOn) {
      if (portTimerRef.current) {
        window.clearTimeout(portTimerRef.current);
        portTimerRef.current = null;
      }
    }

    if (!starboardMasterOn) {
      if (starboardTimerRef.current) {
        window.clearTimeout(starboardTimerRef.current);
        starboardTimerRef.current = null;
      }
    }

    dispatch({
      type: "sync-master",
      portMasterOn,
      starboardMasterOn,
    });
  }, [portMasterOn, starboardMasterOn]);

  useEffect(() => {
    if (runtimeState.portStarting && throttleDemand.port !== 0) {
      if (portTimerRef.current !== null) window.clearTimeout(portTimerRef.current);
      portTimerRef.current = null;
      dispatch({ type: "cancel-start", engine: "port" });
    }
    if (runtimeState.starboardStarting && throttleDemand.starboard !== 0) {
      if (starboardTimerRef.current !== null) window.clearTimeout(starboardTimerRef.current);
      starboardTimerRef.current = null;
      dispatch({ type: "cancel-start", engine: "starboard" });
    }
  }, [runtimeState.portStarting, runtimeState.starboardStarting, throttleDemand.port, throttleDemand.starboard]);

  useEffect(() => {
    const ignitionRequestId = overrides.ignitionRequestId ?? 0;
    const manualIgnitionRequest =
      ignitionRequestId !== previousIgnitionRequestIdRef.current;
    previousIgnitionRequestIdRef.current = ignitionRequestId;

    const ignitionRisingEdge =
      manualIgnitionRequest || (ignitionPressed && !previousIgnitionPressedRef.current);
    previousIgnitionPressedRef.current = ignitionPressed;

    if (!ignitionRisingEdge) {
      return;
    }

    if (portMasterOn && throttleDemand.port === 0) {
      dispatch({ type: "start-request", engine: "port" });

      if (!runtimeState.portRunning && !runtimeState.portStarting) {
        if (portTimerRef.current) {
          window.clearTimeout(portTimerRef.current);
        }

        portTimerRef.current = window.setTimeout(() => {
          portTimerRef.current = null;
          dispatch({ type: "start-complete", engine: "port" });
        }, specification.startupMs);
      }
    }

    if (starboardMasterOn && throttleDemand.starboard === 0) {
      dispatch({ type: "start-request", engine: "starboard" });

      if (!runtimeState.starboardRunning && !runtimeState.starboardStarting) {
        if (starboardTimerRef.current) {
          window.clearTimeout(starboardTimerRef.current);
        }

        starboardTimerRef.current = window.setTimeout(() => {
          starboardTimerRef.current = null;
          dispatch({ type: "start-complete", engine: "starboard" });
        }, specification.startupMs + 150);
      }
    }
  }, [
    ignitionPressed,
    overrides.ignitionRequestId,
    throttleDemand.port,
    throttleDemand.starboard,
    portMasterOn,
    runtimeState.portRunning,
    runtimeState.portStarting,
    runtimeState.starboardRunning,
    runtimeState.starboardStarting,
    starboardMasterOn,
    specification.startupMs,
  ]);

  useEffect(() => {
    return () => {
      if (portTimerRef.current) {
        window.clearTimeout(portTimerRef.current);
      }

      if (starboardTimerRef.current) {
        window.clearTimeout(starboardTimerRef.current);
      }
    };
  }, []);

  return useMemo(
    () => ({
      ignitionPressed,
      port: {
        turboActive: turbo.port && propulsion.port.turboActive,
        turboStatus: portTurboStatus,
        masterOn: portMasterOn,
        starting: runtimeState.portStarting,
        running: portMasterOn && runtimeState.portRunning,
        demandThrottle: throttleDemand.port,
        effectiveThrottle: portMasterOn && runtimeState.portRunning ? propulsion.port.effectiveThrottle : 0,
        rpm: propulsion.port.rpm,
        gear: propulsion.port.gear,
        shifting: propulsion.port.shiftRemaining > 0,
      },
      starboard: {
        turboActive: turbo.starboard && propulsion.starboard.turboActive,
        turboStatus: starboardTurboStatus,
        masterOn: starboardMasterOn,
        starting: runtimeState.starboardStarting,
        running: starboardMasterOn && runtimeState.starboardRunning,
        demandThrottle: throttleDemand.starboard,
        effectiveThrottle: starboardMasterOn && runtimeState.starboardRunning ? propulsion.starboard.effectiveThrottle : 0,
        rpm: propulsion.starboard.rpm,
        gear: propulsion.starboard.gear,
        shifting: propulsion.starboard.shiftRemaining > 0,
      },
    }),
    [
      propulsion.port,
      propulsion.starboard,
      ignitionPressed,
      portMasterOn,
      runtimeState.portStarting,
      runtimeState.starboardStarting,
      runtimeState.portRunning,
      runtimeState.starboardRunning,
      starboardMasterOn,
      throttleDemand.port,
      throttleDemand.starboard,
      turbo.port,
      turbo.starboard,
      portTurboStatus,
      starboardTurboStatus,
    ],
  );
}
