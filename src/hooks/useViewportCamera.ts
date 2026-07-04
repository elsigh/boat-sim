"use client";

import { useRef, useState } from "react";

type CameraLookState = {
  dragging: boolean;
  pitch: number;
  yaw: number;
};

const DEFAULT_LOOK: CameraLookState = {
  dragging: false,
  pitch: 0,
  yaw: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useViewportCamera() {
  const activePointerIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [look, setLook] = useState(DEFAULT_LOOK);

  const stopDrag = () => {
    activePointerIdRef.current = null;
    lastPointRef.current = null;
    setLook((current) => ({ ...current, dragging: false }));
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      activePointerIdRef.current = null;
      lastPointRef.current = null;
      return;
    }
    setLook((current) => ({ ...current, dragging: true }));
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (activePointerIdRef.current !== event.pointerId || !lastPointRef.current) {
      return;
    }

    const deltaX = event.clientX - lastPointRef.current.x;
    const deltaY = event.clientY - lastPointRef.current.y;

    lastPointRef.current = { x: event.clientX, y: event.clientY };
    setLook((current) => ({
      ...current,
      yaw: clamp(current.yaw - deltaX * 0.006, -1.2, 1.2),
      pitch: clamp(current.pitch + deltaY * 0.004, -0.6, 0.55),
    }));
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore pointer-capture teardown issues from overlay/UI interaction.
    }
    stopDrag();
  };

  const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    stopDrag();
  };

  return {
    dragging: look.dragging,
    pitch: look.pitch,
    resetView: () => setLook(DEFAULT_LOOK),
    viewportBindings: {
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
    yaw: look.yaw,
  };
}
