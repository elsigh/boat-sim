"use client";

import {
  CoefficientCombineRule,
  RapierRigidBody,
  RigidBody,
  RoundCuboidCollider,
  useBeforePhysicsStep,
} from "@react-three/rapier";
import { type MutableRefObject, useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { TwinEngineState } from "@/hooks/useEngineState";
import {
  computeBoatPhysics,
  type DockingTelemetry,
} from "@/lib/sim/boat-physics";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";

import { BoatVisual } from "./BoatVisual";
import { WashEffects } from "./WashEffects";

type BoatProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  boat: BoatProfile;
  controls: GamepadSnapshot;
  engineState: TwinEngineState;
  environment: SimulationEnvironment;
  initialPose: {
    position: [number, number, number];
    yawDeg: number;
  };
  onPositionSample?: (position: { x: number; z: number }) => void;
  onTelemetry: (telemetry: DockingTelemetry) => void;
  resetRequest?: {
    id: number;
    position: [number, number, number];
    yawDeg: number;
  } | null;
};

const worldPosition = new Vector3();
const worldVelocity = new Vector3();
const worldRotation = new Quaternion();
const HULL_CONTACT_FRICTION = 0.01;
const HULL_CONTACT_RESTITUTION = 0;
const HULL_WATERLINE_Y = 0.9;
const HULL_LINEAR_DAMPING = 0.015;
// Keep built-in angular damping near zero: hydrodynamic yaw drag lives in the
// physics model, and a heavy hull must carry her swing after thrust comes off.
const HULL_ANGULAR_DAMPING = 0.08;

type ResetPose = NonNullable<BoatProps["resetRequest"]>;

function applyResetPose(body: RapierRigidBody, resetRequest: ResetPose) {
  const radians = (resetRequest.yawDeg * Math.PI) / 180;
  const halfAngle = radians * 0.5;

  body.setTranslation(
    {
      x: resetRequest.position[0],
      y: resetRequest.position[1],
      z: resetRequest.position[2],
    },
    true,
  );
  body.setRotation(
    {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    },
    true,
  );
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

export function Boat({
  bodyRef,
  boat,
  controls,
  engineState,
  environment,
  initialPose,
  onPositionSample,
  onTelemetry,
  resetRequest,
}: BoatProps) {
  const controlsRef = useRef(controls);
  const engineStateRef = useRef(engineState);
  const telemetryRef = useRef(onTelemetry);
  const positionSampleRef = useRef(onPositionSample);
  const boatRef = useRef(boat);
  const environmentRef = useRef(environment);
  const resetRequestRef = useRef(resetRequest);
  const appliedResetIdRef = useRef<number | null>(null);

  useEffect(() => {
    boatRef.current = boat;
  }, [boat]);

  useEffect(() => {
    environmentRef.current = environment;
  }, [environment]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    engineStateRef.current = engineState;
  }, [engineState]);

  useEffect(() => {
    telemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    positionSampleRef.current = onPositionSample;
  }, [onPositionSample]);

  useEffect(() => {
    resetRequestRef.current = resetRequest;
    if (
      !resetRequest ||
      !bodyRef.current ||
      appliedResetIdRef.current === resetRequest.id
    ) {
      return;
    }

    applyResetPose(bodyRef.current, resetRequest);
    appliedResetIdRef.current = resetRequest.id;
  }, [bodyRef, resetRequest]);

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const pendingReset = resetRequestRef.current;

    if (pendingReset && appliedResetIdRef.current !== pendingReset.id) {
      applyResetPose(body, pendingReset);
      appliedResetIdRef.current = pendingReset.id;
    }

    const translation = body.translation();
    const rotation = body.rotation();
    const linearVelocity = body.linvel();
    const angularVelocity = body.angvel();

    // Keep the hull on the waterline. Rapier's enabledTranslations lock breaks
    // broad-phase pairing for this body in the bundled version, so the
    // vertical constraint is enforced by hand instead.
    if (
      Math.abs(translation.y - HULL_WATERLINE_Y) > 1e-9 ||
      Math.abs(linearVelocity.y) > 1e-9
    ) {
      body.setTranslation(
        { x: translation.x, y: HULL_WATERLINE_Y, z: translation.z },
        true,
      );
      body.setLinvel({ x: linearVelocity.x, y: 0, z: linearVelocity.z }, true);
      translation.y = HULL_WATERLINE_Y;
      linearVelocity.y = 0;
    }

    worldPosition.set(translation.x, translation.y, translation.z);
    worldRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    worldVelocity.set(linearVelocity.x, linearVelocity.y, linearVelocity.z);

    const result = computeBoatPhysics(
      boatRef.current,
      {
        worldPosition,
        worldRotation,
        worldLinearVelocity: worldVelocity,
        yawRateRadPerSecond: angularVelocity.y,
      },
      {
        portThrottle: engineStateRef.current.port.effectiveThrottle,
        starboardThrottle: engineStateRef.current.starboard.effectiveThrottle,
        bowThruster: controlsRef.current.bowThruster,
      },
      environmentRef.current,
    );

    // Rapier forces are persistent and accumulate across addForce calls, so the
    // previous step's applications must be cleared before this step's are added.
    body.resetForces(true);
    body.resetTorques(true);

    result.applications.forEach((application) => {
      body.addForceAtPoint(application.force, application.point, true);
    });

    if (result.centerForce.lengthSq() > 0.0001) {
      body.addForce(result.centerForce, true);
    }

    if (result.yawTorque.lengthSq() > 0.0001) {
      body.addTorque(result.yawTorque, true);
    }

    telemetryRef.current(result.telemetry);
    positionSampleRef.current?.({ x: translation.x, z: translation.z });
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      gravityScale={0}
      ccd
      canSleep={false}
      linearDamping={HULL_LINEAR_DAMPING}
      angularDamping={HULL_ANGULAR_DAMPING}
      enabledRotations={[false, true, false]}
      additionalSolverIterations={4}
      position={initialPose.position}
      rotation={[0, (initialPose.yawDeg * Math.PI) / 180, 0]}
    >
      <RoundCuboidCollider
        args={[
          boat.beamM * 0.38,
          0.85,
          boat.lengthM * 0.39,
          0.42,
        ]}
        mass={boat.massKg}
        friction={HULL_CONTACT_FRICTION}
        frictionCombineRule={CoefficientCombineRule.Min}
        restitution={HULL_CONTACT_RESTITUTION}
        restitutionCombineRule={CoefficientCombineRule.Min}
      />

      <BoatVisual boat={boat} />

      <WashEffects boat={boat} controlsRef={controlsRef} engineStateRef={engineStateRef} />
    </RigidBody>
  );
}
