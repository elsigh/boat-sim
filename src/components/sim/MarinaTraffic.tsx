"use client";

import { useFrame } from "@react-three/fiber";
import {
  CoefficientCombineRule,
  CuboidCollider,
  type RapierRigidBody,
  RigidBody,
} from "@react-three/rapier";
import {
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CatmullRomCurve3, Vector3 } from "three";

import type { DockFloat, MarinaLayout } from "@/lib/marinas/types";
import { liveRigidBody } from "@/lib/sim/rapier-utils";

import {
  SMALL_CRAFT_ACCENT_COLORS,
  SMALL_CRAFT_HULL_COLORS,
  SmallCraft,
  type SmallCraftSpec,
} from "./SmallCraft";

// Traffic keeps to the fairway: runs stop at this fraction of the approach
// line so an inbound skipper never parks in the player's target berth.
const FAIRWAY_END_U = 0.8;
const CRUISE_SPEED_MPS = 1.7; // a polite ~3.3 kt inside the breakwater
const TURN_RATE_RAD_PER_S = 0.75;
const FIRST_RUN_DELAY_MS = [12_000, 25_000] as const;
const NEXT_RUN_DELAY_MS = [45_000, 110_000] as const;
// Never materialize a boat near the player — retry shortly instead.
const SPAWN_CLEARANCE_M = 60;
const BLOCKED_RETRY_DELAY_MS = [8_000, 15_000] as const;
// Traffic hull half-beam plus a fender's worth of margin when validating the
// route against dock footprints; the turn-around point needs swing room.
const PATH_DOCK_MARGIN_M = 2.8;
const TURN_POINT_MARGIN_M = 9;
const PATH_SAMPLES = 48;

function pointNearDock(x: number, z: number, dock: DockFloat, margin: number) {
  const rotation = ((dock.rotationDeg ?? 0) * Math.PI) / 180;
  const dx = x - dock.position[0];
  const dz = z - dock.position[1];
  // Dock local frame: length runs along [sin, cos], width along [cos, -sin].
  const along = dx * Math.sin(rotation) + dz * Math.cos(rotation);
  const across = dx * Math.cos(rotation) - dz * Math.sin(rotation);

  return (
    Math.abs(across) <= dock.size[0] * 0.5 + margin &&
    Math.abs(along) <= dock.size[1] * 0.5 + margin
  );
}

/** True when the fairway portion of the curve stays clear of every dock. */
function curveAvoidsDocks(curve: CatmullRomCurve3, docks: DockFloat[]) {
  const point = new Vector3();

  for (let sample = 0; sample <= PATH_SAMPLES; sample += 1) {
    const u = (sample / PATH_SAMPLES) * FAIRWAY_END_U;
    curve.getPointAt(u, point);
    const margin = u >= FAIRWAY_END_U - 0.001 ? TURN_POINT_MARGIN_M : PATH_DOCK_MARGIN_M;

    if (docks.some((dock) => pointNearDock(point.x, point.z, dock, margin))) {
      return false;
    }
  }

  return true;
}

type TrafficRun = {
  id: number;
  curve: CatmullRomCurve3;
  /** "visit" comes in, pauses off the docks, and heads back out. */
  mode: "visit" | "depart";
  pauseMs: number;
  spec: SmallCraftSpec;
};

type TrafficPhase = "in" | "pause" | "out";

function randomBetween(range: readonly [number, number]) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

function randomSpec(): SmallCraftSpec {
  const lengthM = 8 + Math.random() * 5;

  return {
    kind: Math.random() < 0.35 ? "sail" : "power",
    lengthM,
    beamM: Math.min(4.2, lengthM * 0.32),
    hullColor:
      SMALL_CRAFT_HULL_COLORS[
        Math.floor(Math.random() * SMALL_CRAFT_HULL_COLORS.length)
      ],
    accentColor:
      SMALL_CRAFT_ACCENT_COLORS[
        Math.floor(Math.random() * SMALL_CRAFT_ACCENT_COLORS.length)
      ],
  };
}

function TrafficBoat({ run, onDone }: { run: TrafficRun; onDone: () => void }) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const progressRef = useRef({
    phase: (run.mode === "depart" ? "out" : "in") as TrafficPhase,
    u: run.mode === "depart" ? FAIRWAY_END_U : 0,
    pauseLeftMs: run.pauseMs,
    yaw: 0,
    yawInitialized: false,
    done: false,
  });
  const curveLength = useMemo(() => run.curve.getLength(), [run.curve]);
  const point = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const progress = progressRef.current;

    if (!body || progress.done) {
      return;
    }

    const step = (CRUISE_SPEED_MPS * delta) / Math.max(1, curveLength);

    if (progress.phase === "in") {
      progress.u = Math.min(FAIRWAY_END_U, progress.u + step);

      if (progress.u >= FAIRWAY_END_U) {
        progress.phase = "pause";
      }
    } else if (progress.phase === "pause") {
      progress.pauseLeftMs -= delta * 1000;

      if (progress.pauseLeftMs <= 0) {
        progress.phase = "out";
      }
    } else {
      progress.u = Math.max(0, progress.u - step);

      if (progress.u <= 0) {
        progress.done = true;
        onDone();
        return;
      }
    }

    run.curve.getPointAt(progress.u, point);
    run.curve.getTangentAt(Math.max(0.001, Math.min(0.999, progress.u)), tangent);

    const travelSign = progress.phase === "out" ? -1 : 1;
    const targetYaw = Math.atan2(tangent.x * travelSign, tangent.z * travelSign);

    if (!progress.yawInitialized) {
      progress.yaw = targetYaw;
      progress.yawInitialized = true;
    } else {
      let yawError = targetYaw - progress.yaw;

      while (yawError > Math.PI) yawError -= Math.PI * 2;
      while (yawError < -Math.PI) yawError += Math.PI * 2;

      const maxTurn = TURN_RATE_RAD_PER_S * delta;
      progress.yaw += Math.max(-maxTurn, Math.min(maxTurn, yawError));
    }

    const halfYaw = progress.yaw * 0.5;

    body.setNextKinematicTranslation({ x: point.x, y: 0, z: point.z });
    body.setNextKinematicRotation({
      x: 0,
      y: Math.sin(halfYaw),
      z: 0,
      w: Math.cos(halfYaw),
    });
  });

  const start = useMemo(() => {
    const u = run.mode === "depart" ? FAIRWAY_END_U : 0;
    return run.curve.getPointAt(u);
  }, [run]);

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={[start.x, 0, start.z]}
    >
      <CuboidCollider
        name={`traffic:${run.id}`}
        args={[run.spec.beamM * 0.5, 0.8, run.spec.lengthM * 0.46]}
        position={[0, 0.45, 0]}
        friction={0.05}
        frictionCombineRule={CoefficientCombineRule.Min}
        restitution={0.05}
        restitutionCombineRule={CoefficientCombineRule.Min}
      />
      <SmallCraft spec={run.spec} />
    </RigidBody>
  );
}

export function MarinaTraffic({
  layout,
  playerBodyRef,
}: {
  layout: MarinaLayout;
  playerBodyRef: MutableRefObject<RapierRigidBody | null>;
}) {
  const [run, setRun] = useState<TrafficRun | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const runIdRef = useRef(0);
  const hadRunRef = useRef(false);
  const blockedRef = useRef(false);

  const curves = useMemo(() => {
    const lines = Object.values(layout.approachLines ?? {}).filter(
      (points) => points.length >= 3,
    );

    // A curve that clips a dock (or ends without room to turn) is simply not
    // a traffic route; better no boat than one gliding through the timber.
    const usable = lines
      .map(
        (points) =>
          new CatmullRomCurve3(
            points.map(([x, z]) => new Vector3(x, 0, z)),
            false,
            "centripetal",
          ),
      )
      .filter((curve) => curveAvoidsDocks(curve, layout.docks));

    if (usable.length < lines.length) {
      console.warn(
        `[marina-traffic] ${layout.id}: ${lines.length - usable.length} of ${lines.length} approach lines clip a dock and won't carry traffic`,
      );
    }

    return usable;
  }, [layout]);

  useEffect(() => {
    // New marina: clear any boat mid-run from the previous scene.
    hadRunRef.current = false;
    setRun(null);
  }, [layout]);

  useEffect(() => {
    if (run || curves.length === 0) {
      return;
    }

    const delay = blockedRef.current
      ? randomBetween(BLOCKED_RETRY_DELAY_MS)
      : randomBetween(hadRunRef.current ? NEXT_RUN_DELAY_MS : FIRST_RUN_DELAY_MS);

    blockedRef.current = false;
    const timer = window.setTimeout(() => {
      const mode: TrafficRun["mode"] = Math.random() < 0.5 ? "visit" : "depart";
      const curve = curves[Math.floor(Math.random() * curves.length)];
      const start = curve.getPointAt(mode === "depart" ? FAIRWAY_END_U : 0);
      const player = liveRigidBody(playerBodyRef);

      if (player) {
        const translation = player.translation();
        const clearance = Math.hypot(
          start.x - translation.x,
          start.z - translation.z,
        );

        // Too close to the player — hold off and try again shortly rather
        // than spawn a boat in their lap.
        if (clearance < SPAWN_CLEARANCE_M) {
          blockedRef.current = true;
          setRetryNonce((value) => value + 1);
          return;
        }
      }

      runIdRef.current += 1;
      hadRunRef.current = true;
      setRun({
        id: runIdRef.current,
        curve,
        mode,
        pauseMs: 3000 + Math.random() * 4000,
        spec: randomSpec(),
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [run, curves, retryNonce, playerBodyRef]);

  if (!run) {
    return null;
  }

  return <TrafficBoat key={run.id} run={run} onDone={() => setRun(null)} />;
}
