"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type UseGamepadOptions = {
  gamepadIndex?: number | "auto";
  deadzone?: number;
  axisSmoothing?: number;
  centerSnapThreshold?: number;
  throttleMode?: "dualAxis" | "splitSlider";
  throttleAxes?: {
    port: number;
    starboard: number;
  };
  invertThrottleAxes?: boolean;
  splitThrottleAxis?: number;
  splitThrottleNeutral?: number;
  invertSplitThrottleAxis?: boolean;
  bowThrusterButtons?: {
    port: number;
    starboard: number;
  };
  bowThrusterAxis?: number;
  invertBowThrusterAxis?: boolean;
  keyboardFallback?: boolean;
  keyboardThrottleRate?: number;
  keyboardThrottleKeys?: {
    portIncrease: string;
    portDecrease: string;
    starboardIncrease: string;
    starboardDecrease: string;
  };
  keyboardBowThrusterKeys?: {
    port: string;
    starboard: string;
  };
  /**
   * Raw axis values at each lever's physical idle detent, for throttle
   * quadrants whose resting position is not axis zero. When set, lever travel
   * above idle maps to ahead and below idle maps to astern.
   */
  quadrantIdle?: {
    port: number;
    starboard: number;
  } | null;
};

export type GamepadSnapshot = {
  connected: boolean;
  gamepadId: string | null;
  gamepadIndex: number;
  throttleMode: "dualAxis" | "splitSlider";
  portThrottle: number;
  starboardThrottle: number;
  bowThruster: number;
  splitThrottlePosition: number | null;
  splitThrottleAxis: number | null;
  rawAxes: number[];
  rawButtons: number[];
  updatedAt: number;
};

const DEFAULT_OPTIONS: Required<UseGamepadOptions> = {
  gamepadIndex: "auto",
  deadzone: 0.08,
  axisSmoothing: 0.22,
  centerSnapThreshold: 0.02,
  throttleMode: "dualAxis",
  throttleAxes: {
    port: 0,
    starboard: 1,
  },
  invertThrottleAxes: true,
  splitThrottleAxis: 2,
  splitThrottleNeutral: 0.5,
  invertSplitThrottleAxis: false,
  bowThrusterButtons: {
    port: 4,
    starboard: 5,
  },
  bowThrusterAxis: -1,
  invertBowThrusterAxis: false,
  keyboardFallback: true,
  keyboardThrottleRate: 0.7,
  keyboardThrottleKeys: {
    portIncrease: "w",
    portDecrease: "s",
    starboardIncrease: "i",
    starboardDecrease: "k",
  },
  keyboardBowThrusterKeys: {
    port: "a",
    starboard: "d",
  },
  quadrantIdle: null,
};

const SNAPSHOT_CHANGE_EPSILON = 0.0005;

export const DEFAULT_GAMEPAD_STATE: GamepadSnapshot = {
  connected: false,
  gamepadId: null,
  gamepadIndex: -1,
  throttleMode: "dualAxis",
  portThrottle: 0,
  starboardThrottle: 0,
  bowThruster: 0,
  splitThrottlePosition: null,
  splitThrottleAxis: null,
  rawAxes: [],
  rawButtons: [],
  updatedAt: 0,
};

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function nearlyEqual(left: number | null, right: number | null) {
  if (left === null || right === null) {
    return left === right;
  }

  return Math.abs(left - right) <= SNAPSHOT_CHANGE_EPSILON;
}

function numericArraysEqual(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => nearlyEqual(value, right[index]));
}

function snapshotsEqual(left: GamepadSnapshot, right: GamepadSnapshot) {
  return (
    left.connected === right.connected &&
    left.gamepadId === right.gamepadId &&
    left.gamepadIndex === right.gamepadIndex &&
    left.throttleMode === right.throttleMode &&
    nearlyEqual(left.portThrottle, right.portThrottle) &&
    nearlyEqual(left.starboardThrottle, right.starboardThrottle) &&
    nearlyEqual(left.bowThruster, right.bowThruster) &&
    nearlyEqual(left.splitThrottlePosition, right.splitThrottlePosition) &&
    left.splitThrottleAxis === right.splitThrottleAxis &&
    numericArraysEqual(left.rawAxes, right.rawAxes) &&
    numericArraysEqual(left.rawButtons, right.rawButtons)
  );
}

function clampZeroToOne(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function applyDeadzone(value: number, deadzone: number) {
  if (Math.abs(value) <= deadzone) {
    return 0;
  }

  const magnitude = (Math.abs(value) - deadzone) / (1 - deadzone);
  return Math.sign(value) * magnitude;
}

function smoothControlValue(
  previous: number,
  next: number,
  smoothing: number,
  centerSnapThreshold: number,
) {
  const filtered = previous + (next - previous) * smoothing;

  if (Math.abs(filtered) <= centerSnapThreshold && Math.abs(next) <= centerSnapThreshold * 1.5) {
    return 0;
  }

  return clampUnit(filtered);
}

function normalizeAxis(value: number | undefined, deadzone: number, invert: boolean) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  const adjusted = invert ? -value : value;
  return clampUnit(applyDeadzone(adjusted, deadzone));
}

function quadrantAxisToThrottle(
  value: number | undefined,
  idleRaw: number,
  deadzone: number,
  invert: boolean,
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  const position = invert ? -value : value;
  const idle = invert ? -idleRaw : idleRaw;
  const aheadSpan = Math.max(0.1, 1 - idle);
  const asternSpan = Math.max(0.1, idle + 1);
  const centered =
    position >= idle ? (position - idle) / aheadSpan : (position - idle) / asternSpan;

  return clampUnit(applyDeadzone(clampUnit(centered), deadzone));
}

function axisToUnsignedPosition(value: number | undefined, invert: boolean) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  const adjusted = invert ? -value : value;
  return clampZeroToOne((adjusted + 1) / 2);
}

function splitSliderToTwinThrottle(
  value: number | undefined,
  neutral: number,
  deadzone: number,
  invert: boolean,
) {
  const position = axisToUnsignedPosition(value, invert);
  const centered = clampUnit((position - neutral) / 0.5);
  const filtered = applyDeadzone(centered, deadzone);

  if (filtered > 0) {
    return {
      portThrottle: clampUnit(filtered),
      starboardThrottle: 0,
      position,
    };
  }

  if (filtered < 0) {
    return {
      portThrottle: 0,
      starboardThrottle: clampUnit(filtered),
      position,
    };
  }

  return {
    portThrottle: 0,
    starboardThrottle: 0,
    position,
  };
}

function readGamepad(
  gamepad: Gamepad | null | undefined,
  options: Required<UseGamepadOptions>,
): GamepadSnapshot {
  if (!gamepad) {
    const fallbackIndex =
      typeof options.gamepadIndex === "number" ? options.gamepadIndex : -1;

    return {
      ...DEFAULT_GAMEPAD_STATE,
      gamepadIndex: fallbackIndex,
      throttleMode: options.throttleMode,
      splitThrottleAxis:
        options.throttleMode === "splitSlider" ? options.splitThrottleAxis : null,
    };
  }

  const splitThrottle =
    options.throttleMode === "splitSlider"
      ? splitSliderToTwinThrottle(
          gamepad.axes[options.splitThrottleAxis],
          options.splitThrottleNeutral,
          options.deadzone,
          options.invertSplitThrottleAxis,
        )
      : null;

  const portThrottle =
    splitThrottle?.portThrottle ??
    (options.quadrantIdle
      ? quadrantAxisToThrottle(
          gamepad.axes[options.throttleAxes.port],
          options.quadrantIdle.port,
          options.deadzone,
          options.invertThrottleAxes,
        )
      : normalizeAxis(
          gamepad.axes[options.throttleAxes.port],
          options.deadzone,
          options.invertThrottleAxes,
        ));
  const starboardThrottle =
    splitThrottle?.starboardThrottle ??
    (options.quadrantIdle
      ? quadrantAxisToThrottle(
          gamepad.axes[options.throttleAxes.starboard],
          options.quadrantIdle.starboard,
          options.deadzone,
          options.invertThrottleAxes,
        )
      : normalizeAxis(
          gamepad.axes[options.throttleAxes.starboard],
          options.deadzone,
          options.invertThrottleAxes,
        ));

  const bowFromButtons =
    (gamepad.buttons[options.bowThrusterButtons.starboard]?.value ?? 0) -
    (gamepad.buttons[options.bowThrusterButtons.port]?.value ?? 0);

  const bowFromAxis =
    options.bowThrusterAxis >= 0
      ? normalizeAxis(
          gamepad.axes[options.bowThrusterAxis],
          options.deadzone,
          options.invertBowThrusterAxis,
        )
      : 0;

  return {
    connected: gamepad.connected,
    gamepadId: gamepad.id,
    gamepadIndex: gamepad.index,
    throttleMode: options.throttleMode,
    portThrottle,
    starboardThrottle,
    bowThruster: clampUnit(bowFromAxis || bowFromButtons),
    splitThrottlePosition: splitThrottle?.position ?? null,
    splitThrottleAxis: splitThrottle ? options.splitThrottleAxis : null,
    rawAxes: [...gamepad.axes],
    rawButtons: gamepad.buttons.map((button) => button.value),
    updatedAt: performance.now(),
  };
}

function buildKeyboardSnapshot(
  portThrottle: number,
  starboardThrottle: number,
  bowThruster: number,
  active: boolean,
): GamepadSnapshot {
  // Engine masters and ignition are deliberately NOT faked here: starting the
  // engines is part of the ritual, via the start overlay or panel buttons.
  const rawButtons = new Array(8).fill(0);

  return {
    connected: active,
    gamepadId: active ? "Keyboard Helm" : null,
    gamepadIndex: 0,
    throttleMode: "dualAxis",
    portThrottle,
    starboardThrottle,
    bowThruster,
    splitThrottlePosition: null,
    splitThrottleAxis: null,
    rawAxes: [portThrottle, starboardThrottle],
    rawButtons,
    updatedAt: performance.now(),
  };
}

function hasLiveHardwareHelmInput(snapshot: GamepadSnapshot) {
  return (
    Math.abs(snapshot.portThrottle) > 0.02 ||
    Math.abs(snapshot.starboardThrottle) > 0.02 ||
    Math.abs(snapshot.bowThruster) > 0.02
  );
}

function selectGamepad(
  gamepads: readonly (Gamepad | null)[],
  gamepadIndex: Required<UseGamepadOptions>["gamepadIndex"],
) {
  if (typeof gamepadIndex === "number") {
    return gamepads[gamepadIndex] ?? null;
  }

  return (
    gamepads.find((gamepad) => gamepad?.connected) ??
    gamepads.find((gamepad) => gamepad) ??
    null
  );
}

export function useGamepad(options?: UseGamepadOptions) {
  const resolvedOptions = useMemo<Required<UseGamepadOptions>>(
    () => ({
      ...DEFAULT_OPTIONS,
      ...options,
      throttleAxes: {
        ...DEFAULT_OPTIONS.throttleAxes,
        ...options?.throttleAxes,
      },
      bowThrusterButtons: {
        ...DEFAULT_OPTIONS.bowThrusterButtons,
        ...options?.bowThrusterButtons,
      },
      keyboardThrottleKeys: {
        ...DEFAULT_OPTIONS.keyboardThrottleKeys,
        ...options?.keyboardThrottleKeys,
      },
      keyboardBowThrusterKeys: {
        ...DEFAULT_OPTIONS.keyboardBowThrusterKeys,
        ...options?.keyboardBowThrusterKeys,
      },
    }),
    [options],
  );

  const [state, setState] = useState<GamepadSnapshot>({
    ...DEFAULT_GAMEPAD_STATE,
    gamepadIndex:
      typeof resolvedOptions.gamepadIndex === "number"
        ? resolvedOptions.gamepadIndex
        : DEFAULT_GAMEPAD_STATE.gamepadIndex,
  });
  const publishedSnapshotRef = useRef(state);

  useEffect(() => {
    let frameId = 0;
    let lastFrameAt = performance.now();
    let smoothedControls = {
      portThrottle: 0,
      starboardThrottle: 0,
      bowThruster: 0,
    };
    const pressedKeys = new Set<string>();
    const keyboardState = {
      portThrottle: 0,
      starboardThrottle: 0,
      bowThruster: 0,
      active: false,
    };
    const publishSnapshot = (nextSnapshot: GamepadSnapshot) => {
      if (snapshotsEqual(publishedSnapshotRef.current, nextSnapshot)) {
        return;
      }

      publishedSnapshotRef.current = nextSnapshot;
      setState(nextSnapshot);
    };

    const updateKeyboardThrottle = (deltaSeconds: number) => {
      if (!resolvedOptions.keyboardFallback) {
        return;
      }

      const {
        portIncrease,
        portDecrease,
        starboardIncrease,
        starboardDecrease,
      } = resolvedOptions.keyboardThrottleKeys;
      const delta = resolvedOptions.keyboardThrottleRate * deltaSeconds;

      if (pressedKeys.has(portIncrease) && !pressedKeys.has(portDecrease)) {
        keyboardState.portThrottle = clampUnit(keyboardState.portThrottle + delta);
        keyboardState.active = true;
      } else if (pressedKeys.has(portDecrease) && !pressedKeys.has(portIncrease)) {
        keyboardState.portThrottle = clampUnit(keyboardState.portThrottle - delta);
        keyboardState.active = true;
      }

      if (pressedKeys.has(starboardIncrease) && !pressedKeys.has(starboardDecrease)) {
        keyboardState.starboardThrottle = clampUnit(keyboardState.starboardThrottle + delta);
        keyboardState.active = true;
      } else if (
        pressedKeys.has(starboardDecrease) &&
        !pressedKeys.has(starboardIncrease)
      ) {
        keyboardState.starboardThrottle = clampUnit(keyboardState.starboardThrottle - delta);
        keyboardState.active = true;
      }

      // Bow thruster is momentary: held key = thrust, released = zero.
      const bowKeys = resolvedOptions.keyboardBowThrusterKeys;
      keyboardState.bowThruster =
        (pressedKeys.has(bowKeys.starboard) ? 1 : 0) -
        (pressedKeys.has(bowKeys.port) ? 1 : 0);
    };

    const readSnapshot = () => {
      const gamepads =
        typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
          ? navigator.getGamepads()
          : [];
      const gamepad = selectGamepad(Array.from(gamepads), resolvedOptions.gamepadIndex);
      const gamepadSnapshot = readGamepad(gamepad, resolvedOptions);

      if (keyboardState.active) {
        if (gamepadSnapshot.connected && hasLiveHardwareHelmInput(gamepadSnapshot)) {
          keyboardState.active = false;
          return gamepadSnapshot;
        }

        const keyboardSnapshot = buildKeyboardSnapshot(
          keyboardState.portThrottle,
          keyboardState.starboardThrottle,
          keyboardState.bowThruster,
          true,
        );

        // Keyboard only ever drives the levers. Engine masters and ignition
        // live on the quadrant's switches, so hardware buttons stay live even
        // while the keys have the throttle.
        if (gamepadSnapshot.connected) {
          keyboardSnapshot.rawButtons = gamepadSnapshot.rawButtons;
        }

        return keyboardSnapshot;
      }

      if (gamepadSnapshot.connected) {
        return gamepadSnapshot;
      }

      return buildKeyboardSnapshot(
        keyboardState.portThrottle,
        keyboardState.starboardThrottle,
        keyboardState.bowThruster,
        true,
      );
    };

    const poll = () => {
      const now = performance.now();
      const deltaSeconds = Math.min(0.05, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      updateKeyboardThrottle(deltaSeconds);
      const rawSnapshot = readSnapshot();
      smoothedControls = {
        portThrottle: smoothControlValue(
          smoothedControls.portThrottle,
          rawSnapshot.portThrottle,
          resolvedOptions.axisSmoothing,
          resolvedOptions.centerSnapThreshold,
        ),
        starboardThrottle: smoothControlValue(
          smoothedControls.starboardThrottle,
          rawSnapshot.starboardThrottle,
          resolvedOptions.axisSmoothing,
          resolvedOptions.centerSnapThreshold,
        ),
        bowThruster: smoothControlValue(
          smoothedControls.bowThruster,
          rawSnapshot.bowThruster,
          Math.min(0.5, resolvedOptions.axisSmoothing * 1.5),
          resolvedOptions.centerSnapThreshold,
        ),
      };
      publishSnapshot({
        ...rawSnapshot,
        ...smoothedControls,
      });
      frameId = window.requestAnimationFrame(poll);
    };

    const handleGamepadChange = () => {
      const rawSnapshot = readSnapshot();
      smoothedControls = {
        portThrottle: rawSnapshot.portThrottle,
        starboardThrottle: rawSnapshot.starboardThrottle,
        bowThruster: rawSnapshot.bowThruster,
      };
      publishSnapshot(rawSnapshot);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const handled =
        Object.values(resolvedOptions.keyboardThrottleKeys).includes(key) ||
        Object.values(resolvedOptions.keyboardBowThrusterKeys).includes(key);

      if (!handled) {
        return;
      }

      keyboardState.active = true;
      pressedKeys.add(key);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const handled =
        Object.values(resolvedOptions.keyboardThrottleKeys).includes(key) ||
        Object.values(resolvedOptions.keyboardBowThrusterKeys).includes(key);

      if (!handled) {
        return;
      }

      pressedKeys.delete(key);
      event.preventDefault();
    };

    handleGamepadChange();
    frameId = window.requestAnimationFrame(poll);
    window.addEventListener("gamepadconnected", handleGamepadChange);
    window.addEventListener("gamepaddisconnected", handleGamepadChange);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("gamepadconnected", handleGamepadChange);
      window.removeEventListener("gamepaddisconnected", handleGamepadChange);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [resolvedOptions]);

  return state;
}
