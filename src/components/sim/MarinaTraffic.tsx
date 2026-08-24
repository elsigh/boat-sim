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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CatmullRomCurve3, Vector3 } from "three";

import { sceneDocks } from "@/lib/marinas/scene";
import type { DockFloat, MarinaLayout, Vec2 } from "@/lib/marinas/types";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { buildNavGrid, findWaterPath } from "@/lib/sim/water-nav";

import { deriveMoorings } from "./MooredBoats";
import {
  SMALL_CRAFT_ACCENT_COLORS,
  SMALL_CRAFT_HULL_COLORS,
  SmallCraft,
  type SmallCraftSpec,
} from "./SmallCraft";

// Other boats going about their business. Their fairways aren't authored — they
// come from the same water-only A* that draws the guidance line, run from each
// arrival spawn to its berth, which is by definition the way in.
//
// Each boat also reports its position so the plotter can show it as an AIS
// target.

const FAIRWAY_END_U = 0.8;
const CRUISE_SPEED_MPS = 1.7; // a polite ~3.3 kt inside the breakwater
const TURN_RATE_RAD_PER_S = 0.75;
const FIRST_RUN_DELAY_MS = [6_000, 16_000] as const;
const NEXT_RUN_DELAY_MS = [20_000, 55_000] as const;
const SPAWN_CLEARANCE_M = 60;
const BLOCKED_RETRY_DELAY_MS = [8_000, 15_000] as const;
const PATH_DOCK_MARGIN_M = 2.8;
const TURN_POINT_MARGIN_M = 9;
const PATH_SAMPLES = 48;
/** How many boats can be under way at once. */
const MAX_CONCURRENT_RUNS = 3;
/** AIS targets refresh at a plotter-ish rate, not at frame rate. */
const AIS_PUBLISH_MS = 400;

const MPS_TO_KNOTS = 1.94384;

const VESSEL_NAMES = [
  "Kestrel",
  "Salish Rose",
  "Osprey",
  "Nootka",
  "Gray Wolf",
  "Cormorant",
  "Second Wind",
  "Rainshadow",
  "Tillikum",
  "Halcyon",
  "Sea Otter",
  "Chinook",
];

/** One vessel as it appears on the plotter's target list. */
export type TrafficTarget = {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Course over ground, degrees true in the render world frame. */
  headingDeg: number;
  sogKnots: number;
  lengthM: number;
};

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
  name: string;
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

type TrafficReport = (
  id: number,
  target: Omit<TrafficTarget, "id"> | null,
) => void;

function TrafficBoat({
  run,
  onDone,
  onReport,
}: {
  run: TrafficRun;
  onDone: () => void;
  onReport: TrafficReport;
}) {
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

  useEffect(() => () => onReport(run.id, null), [onReport, run.id]);

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
        onReport(run.id, null);
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

    onReport(run.id, {
      name: run.name,
      x: point.x,
      z: point.z,
      headingDeg: ((((progress.yaw * 180) / Math.PI) % 360) + 360) % 360,
      sogKnots: progress.phase === "pause" ? 0 : CRUISE_SPEED_MPS * MPS_TO_KNOTS,
      lengthM: run.spec.lengthM,
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
  onTraffic,
}: {
  layout: MarinaLayout;
  playerBodyRef: MutableRefObject<RapierRigidBody | null>;
  onTraffic?: (targets: TrafficTarget[]) => void;
}) {
  const [runs, setRuns] = useState<TrafficRun[]>([]);
  const [retryNonce, setRetryNonce] = useState(0);
  const runIdRef = useRef(0);
  const hadRunRef = useRef(false);
  const blockedRef = useRef(false);

  // Fairways come from the water-only path finder: spawn point to berth is the
  // route a real boat would take in, reefs and docks already accounted for.
  const curves = useMemo(() => {
    const grid = buildNavGrid(
      layout,
      deriveMoorings(layout).map((mooring) => ({
        position: mooring.position,
        headingDeg: mooring.headingDeg,
        lengthM: mooring.spec.lengthM,
        beamM: mooring.spec.beamM,
      })),
    );
    const docks = sceneDocks(layout);
    const seen = new Set<string>();
    const out: CatmullRomCurve3[] = [];

    for (const spawn of layout.spawns) {
      if (spawn.kind !== "arrival") {
        continue;
      }

      const berth = layout.berths.find((entry) => entry.id === spawn.berthId);

      if (!berth) {
        continue;
      }

      const key = `${spawn.position.join()}->${berth.center.join()}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const path: Vec2[] | null = findWaterPath(grid, spawn.position, berth.center);

      if (!path || path.length < 2) {
        continue;
      }

      // CatmullRom wants three points to bend through.
      const points =
        path.length >= 3
          ? path
          : [
              path[0],
              [(path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2] as Vec2,
              path[1],
            ];

      const curve = new CatmullRomCurve3(
        points.map(([x, z]) => new Vector3(x, 0, z)),
        false,
        "centripetal",
      );

      if (curve.getLength() > 80 && curveAvoidsDocks(curve, docks)) {
        out.push(curve);
      }
    }

    return out;
  }, [layout]);

  // Live target positions, written every frame but published on a timer.
  const targetsRef = useRef(new Map<number, TrafficTarget>());

  const report = useCallback<TrafficReport>((id, target) => {
    if (target === null) {
      targetsRef.current.delete(id);
      return;
    }

    targetsRef.current.set(id, { id, ...target });
  }, []);

  useEffect(() => {
    if (!onTraffic) {
      return;
    }

    const timer = window.setInterval(() => {
      onTraffic(Array.from(targetsRef.current.values()));
    }, AIS_PUBLISH_MS);

    return () => window.clearInterval(timer);
  }, [onTraffic]);

  useEffect(() => {
    // New marina: clear anything mid-run from the previous scene.
    hadRunRef.current = false;
    targetsRef.current.clear();
    setRuns([]);
  }, [layout]);

  useEffect(() => {
    if (runs.length >= MAX_CONCURRENT_RUNS || curves.length === 0) {
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

        // Too close to the player — hold off rather than spawn a boat in their lap.
        if (clearance < SPAWN_CLEARANCE_M) {
          blockedRef.current = true;
          setRetryNonce((value) => value + 1);
          return;
        }
      }

      runIdRef.current += 1;
      hadRunRef.current = true;
      const id = runIdRef.current;
      setRuns((current) => [
        ...current,
        {
          id,
          curve,
          mode,
          pauseMs: 3000 + Math.random() * 4000,
          spec: randomSpec(),
          name: VESSEL_NAMES[id % VESSEL_NAMES.length],
        },
      ]);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [runs.length, curves, retryNonce, playerBodyRef]);

  return (
    <>
      {runs.map((run) => (
        <TrafficBoat
          key={run.id}
          run={run}
          onReport={report}
          onDone={() =>
            setRuns((current) => current.filter((entry) => entry.id !== run.id))
          }
        />
      ))}
    </>
  );
}
