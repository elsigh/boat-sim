"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { GamepadSnapshot } from "@/hooks/useGamepad";

export type EngineChannelState = {
  masterOn: boolean;
  starting: boolean;
  running: boolean;
  demandThrottle: number;
  effectiveThrottle: number;
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
      type: "start-complete";
      engine: "port" | "starboard";
    };

const DEFAULT_RUNTIME_STATE: RuntimeState = {
  portStarting: false,
  portRunning: false,
  starboardStarting: false,
  starboardRunning: false,
};

const PORT_STARTUP_MS = 1100;
const STARBOARD_STARTUP_MS = 1250;
const THROTTLE_NEUTRAL_DEADBAND = 0.045;
const SAME_DIRECTION_MATCH_THRESHOLD = 0.14;
const FORWARD_DIFFERENTIAL_RETENTION = 0.38;
const REVERSE_DIFFERENTIAL_RETENTION = 0.2;
const AHEAD_POWER_RATE_PER_SECOND = 0.24;
const ASTERN_POWER_RATE_PER_SECOND = 0.18;
const NEUTRAL_POWER_RATE_PER_SECOND = 0.42;
const REVERSING_POWER_RATE_PER_SECOND = 0.28;
const POWER_SETTLE_EPSILON = 0.002;

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

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function moveToward(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function slewEnginePower(current: number, target: number, deltaSeconds: number) {
  if (Math.abs(target) <= POWER_SETTLE_EPSILON) {
    return moveToward(current, 0, NEUTRAL_POWER_RATE_PER_SECOND * deltaSeconds);
  }

  if (Math.abs(current) > POWER_SETTLE_EPSILON && Math.sign(current) !== Math.sign(target)) {
    return moveToward(current, 0, REVERSING_POWER_RATE_PER_SECOND * deltaSeconds);
  }

  const rate =
    Math.abs(target) < Math.abs(current)
      ? NEUTRAL_POWER_RATE_PER_SECOND
      : target < 0
        ? ASTERN_POWER_RATE_PER_SECOND
        : AHEAD_POWER_RATE_PER_SECOND;

  return moveToward(current, target, rate * deltaSeconds);
}

function applyThrottleForgiveness(value: number) {
  if (Math.abs(value) <= THROTTLE_NEUTRAL_DEADBAND) {
    return 0;
  }

  const trimmedMagnitude =
    (Math.abs(value) - THROTTLE_NEUTRAL_DEADBAND) / (1 - THROTTLE_NEUTRAL_DEADBAND);
  return clampUnit(Math.sign(value) * trimmedMagnitude);
}

function stabilizeTwinThrottlePair(port: number, starboard: number) {
  const trimmedPort = applyThrottleForgiveness(port);
  const trimmedStarboard = applyThrottleForgiveness(starboard);
  const sameDirection =
    trimmedPort !== 0 &&
    trimmedStarboard !== 0 &&
    Math.sign(trimmedPort) === Math.sign(trimmedStarboard);

  if (!sameDirection) {
    return {
      port: trimmedPort,
      starboard: trimmedStarboard,
    };
  }

  const average = (trimmedPort + trimmedStarboard) * 0.5;
  const differential = trimmedPort - trimmedStarboard;

  if (Math.abs(differential) <= SAME_DIRECTION_MATCH_THRESHOLD) {
    return {
      port: average,
      starboard: average,
    };
  }

  const retention =
    average < 0 ? REVERSE_DIFFERENTIAL_RETENTION : FORWARD_DIFFERENTIAL_RETENTION;
  const softenedDifferential = differential * retention * 0.5;

  return {
    port: clampUnit(average + softenedDifferential),
    starboard: clampUnit(average - softenedDifferential),
  };
}

export function useEngineState(
  controls: GamepadSnapshot,
  overrides: EngineControlOverrides = {},
): TwinEngineState {
  const [runtimeState, dispatch] = useReducer(runtimeReducer, DEFAULT_RUNTIME_STATE);
  const [effectiveThrottle, setEffectiveThrottle] = useState({ port: 0, starboard: 0 });
  const previousIgnitionPressedRef = useRef(false);
  const previousIgnitionRequestIdRef = useRef(overrides.ignitionRequestId ?? 0);
  const portTimerRef = useRef<number | null>(null);
  const starboardTimerRef = useRef<number | null>(null);
  const targetThrottleRef = useRef({ port: 0, starboard: 0 });

  const portMasterOn = Boolean(overrides.portMasterOn) || (controls.rawButtons[2] ?? 0) > 0.5;
  const starboardMasterOn =
    Boolean(overrides.starboardMasterOn) || (controls.rawButtons[3] ?? 0) > 0.5;
  const ignitionPressed = (controls.rawButtons[7] ?? 0) > 0.5;
  const stabilizedThrottle = useMemo(
    () => stabilizeTwinThrottlePair(controls.portThrottle, controls.starboardThrottle),
    [controls.portThrottle, controls.starboardThrottle],
  );

  useEffect(() => {
    targetThrottleRef.current = {
      port: portMasterOn && runtimeState.portRunning ? stabilizedThrottle.port : 0,
      starboard:
        starboardMasterOn && runtimeState.starboardRunning
          ? stabilizedThrottle.starboard
          : 0,
    };
  }, [
    portMasterOn,
    runtimeState.portRunning,
    runtimeState.starboardRunning,
    starboardMasterOn,
    stabilizedThrottle.port,
    stabilizedThrottle.starboard,
  ]);

  useEffect(() => {
    let frameId = 0;
    let lastFrameAt = performance.now();

    const tick = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.08, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      setEffectiveThrottle((current) => {
        const target = targetThrottleRef.current;
        const next = {
          port: slewEnginePower(current.port, target.port, deltaSeconds),
          starboard: slewEnginePower(current.starboard, target.starboard, deltaSeconds),
        };

        if (next.port === current.port && next.starboard === current.starboard) {
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

    if (portMasterOn) {
      dispatch({ type: "start-request", engine: "port" });

      if (!runtimeState.portRunning && !runtimeState.portStarting) {
        if (portTimerRef.current) {
          window.clearTimeout(portTimerRef.current);
        }

        portTimerRef.current = window.setTimeout(() => {
          portTimerRef.current = null;
          dispatch({ type: "start-complete", engine: "port" });
        }, PORT_STARTUP_MS);
      }
    }

    if (starboardMasterOn) {
      dispatch({ type: "start-request", engine: "starboard" });

      if (!runtimeState.starboardRunning && !runtimeState.starboardStarting) {
        if (starboardTimerRef.current) {
          window.clearTimeout(starboardTimerRef.current);
        }

        starboardTimerRef.current = window.setTimeout(() => {
          starboardTimerRef.current = null;
          dispatch({ type: "start-complete", engine: "starboard" });
        }, STARBOARD_STARTUP_MS);
      }
    }
  }, [
    ignitionPressed,
    overrides.ignitionRequestId,
    portMasterOn,
    runtimeState.portRunning,
    runtimeState.portStarting,
    runtimeState.starboardRunning,
    runtimeState.starboardStarting,
    starboardMasterOn,
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
        masterOn: portMasterOn,
        starting: runtimeState.portStarting,
        running: portMasterOn && runtimeState.portRunning,
        demandThrottle: stabilizedThrottle.port,
        effectiveThrottle: effectiveThrottle.port,
      },
      starboard: {
        masterOn: starboardMasterOn,
        starting: runtimeState.starboardStarting,
        running: starboardMasterOn && runtimeState.starboardRunning,
        demandThrottle: stabilizedThrottle.starboard,
        effectiveThrottle: effectiveThrottle.starboard,
      },
    }),
    [
      effectiveThrottle.port,
      effectiveThrottle.starboard,
      ignitionPressed,
      portMasterOn,
      runtimeState.portStarting,
      runtimeState.starboardStarting,
      runtimeState.portRunning,
      runtimeState.starboardRunning,
      starboardMasterOn,
      stabilizedThrottle.port,
      stabilizedThrottle.starboard,
    ],
  );
}
