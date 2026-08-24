"use client";

import {
  CoefficientCombineRule,
  type ContactForcePayload,
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
import type { ImpactIncident, RawImpact } from "@/lib/sim/collision-damage";
import { liveRigidBody } from "@/lib/sim/rapier-utils";

import { BoatVisual } from "./BoatVisual";
import { WashEffects } from "./WashEffects";

type BoatProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  boat: BoatProfile;
  controls: GamepadSnapshot;
  engineState: TwinEngineState;
  environment: SimulationEnvironment;
  anchorConfig?: {
    active: boolean;
    point: { x: number; z: number };
    chainMeters: number;
    stiffness: number; // N per meter beyond slack
    damping: number; // N per m/s along the rode
  } | null;
  hullDamageMarks: ImpactIncident[];
  initialPose: {
    position: [number, number, number];
    yawDeg: number;
  };
  onImpact?: (impact: RawImpact) => void;
  onPositionSample?: (position: { x: number; z: number }) => void;
  onTelemetry: (telemetry: DockingTelemetry) => void;
  resetRequest?: {
    id: number;
    position: [number, number, number];
    yawDeg: number;
  } | null;
  turboActive: boolean;
};

const worldPosition = new Vector3();
const worldVelocity = new Vector3();
const worldRotation = new Quaternion();
const impactNormal = new Vector3();
const impactLocalVelocity = new Vector3();
const impactRotation = new Quaternion();
const impactLocalPoint = new Vector3();
const impactWorldPoint = new Vector3();
const impactTranslation = new Vector3();
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
  anchorConfig,
  hullDamageMarks,
  initialPose,
  onImpact,
  onPositionSample,
  onTelemetry,
  resetRequest,
  turboActive,
}: BoatProps) {
  const controlsRef = useRef(controls);
  const engineStateRef = useRef(engineState);
  const telemetryRef = useRef(onTelemetry);
  const positionSampleRef = useRef(onPositionSample);
  const impactRef = useRef(onImpact);
  const preStepVelocityRef = useRef(new Vector3());
  const boatRef = useRef(boat);
  const environmentRef = useRef(environment);
  const resetRequestRef = useRef(resetRequest);
  const turboActiveRef = useRef(turboActive);
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
    impactRef.current = onImpact;
  }, [onImpact]);

  useEffect(() => {
    resetRequestRef.current = resetRequest;
    const body = liveRigidBody(bodyRef);

    if (
      !resetRequest ||
      !body ||
      appliedResetIdRef.current === resetRequest.id
    ) {
      return;
    }

    applyResetPose(body, resetRequest);
    appliedResetIdRef.current = resetRequest.id;
  }, [bodyRef, resetRequest]);

  useEffect(() => {
    turboActiveRef.current = turboActive;
  }, [turboActive]);

  useBeforePhysicsStep(() => {
    const body = liveRigidBody(bodyRef);

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

    // Contact-force events fire after the solver has already arrested the
    // hull, so impact severity must be judged from the pre-step velocity.
    preStepVelocityRef.current.set(linearVelocity.x, 0, linearVelocity.z);

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
        turboSpeedMultiplier: turboActiveRef.current ? 10 : 1,
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
    // Anchor spring: acts only when the rode is taut; gentle damping along the rode.
    if (anchorConfig?.active && anchorConfig.chainMeters > 1) {
      const ax = anchorConfig.point.x;
      const az = anchorConfig.point.z;
      const dx = worldPosition.x - ax;
      const dz = worldPosition.z - az;
      const dist = Math.hypot(dx, dz);
      const slack = anchorConfig.chainMeters * 0.98; // small slack before loading
      if (dist > slack) {
        const nx = dx / dist;
        const nz = dz / dist;
        const stretch = dist - slack;
        const springN = anchorConfig.stiffness * stretch;
        // Damping along the rode direction
        const alongVel = worldVelocity.x * nx + worldVelocity.z * nz;
        const dampN = anchorConfig.damping * alongVel;
        const fx = -(springN + dampN) * nx;
        const fz = -(springN + dampN) * nz;
        body.addForce({ x: fx, y: 0, z: fz }, true);
      }
    }

    telemetryRef.current(result.telemetry);
    positionSampleRef.current?.({ x: translation.x, z: translation.z });
  });

  const handleContactForce = (payload: ContactForcePayload) => {
    const body = liveRigidBody(bodyRef);
    const report = impactRef.current;

    if (!body || !report) {
      return;
    }

    const direction = payload.maxForceDirection;
    impactNormal.set(direction.x, 0, direction.z);

    if (impactNormal.lengthSq() < 1e-9) {
      return;
    }

    impactNormal.normalize();

    const velocity = preStepVelocityRef.current;
    const closingSpeedMps = Math.abs(velocity.dot(impactNormal));

    if (closingSpeedMps < 0.15) {
      return;
    }

    const rotation = body.rotation();
    const translation = body.translation();

    impactRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Place the contact on the hull perimeter in the direction of travel —
    // the boat always moves toward whatever it just struck.
    impactLocalVelocity
      .copy(velocity)
      .applyQuaternion(impactRotation.clone().invert());

    if (impactLocalVelocity.lengthSq() < 1e-9) {
      return;
    }

    impactLocalVelocity.normalize();

    const profile = boatRef.current;
    const halfBeam = profile.beamM * 0.38 + 0.42;
    const halfLength = profile.lengthM * 0.39 + 0.42;
    const scale =
      1 /
      Math.sqrt(
        (impactLocalVelocity.x / halfBeam) ** 2 +
          (impactLocalVelocity.z / halfLength) ** 2,
      );

    impactLocalPoint.copy(impactLocalVelocity).multiplyScalar(scale);
    impactTranslation.set(translation.x, translation.y, translation.z);
    impactWorldPoint
      .copy(impactLocalPoint)
      .applyQuaternion(impactRotation)
      .add(impactTranslation);

    report({
      otherName: payload.other.colliderObject?.name ?? "",
      closingSpeedMps,
      world: { x: impactWorldPoint.x, z: impactWorldPoint.z },
      local: { x: impactLocalPoint.x, z: impactLocalPoint.z },
      atMs: performance.now(),
    });
  };

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
      onContactForce={handleContactForce}
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

      <BoatVisual boat={boat} turboActive={turboActive} />

      {/* scars from recorded impacts, pinned to the hull at rub-rail height */}
      {hullDamageMarks.map((mark) => {
        const yaw = Math.atan2(mark.local.x, mark.local.z);
        const big = mark.severity === "major" || mark.severity === "severe";

        return (
          <group
            key={`hull-scar-${mark.id}`}
            position={[mark.local.x * 0.97, big ? 0.22 : 0.34, mark.local.z * 0.97]}
            rotation={[0, yaw, 0]}
          >
            <mesh>
              <boxGeometry
                args={big ? [0.85, 0.5, 0.16] : [0.45, 0.2, 0.1]}
              />
              <meshStandardMaterial
                color={big ? "#241f1b" : "#4a423a"}
                roughness={1}
              />
            </mesh>
            {mark.severity === "severe" ? (
              <mesh position={[0, -0.28, 0.02]}>
                <boxGeometry args={[1.2, 0.22, 0.14]} />
                <meshStandardMaterial color="#150f0c" roughness={1} />
              </mesh>
            ) : null}
          </group>
        );
      })}

      <WashEffects
        boat={boat}
        controlsRef={controlsRef}
        engineStateRef={engineStateRef}
        turboActive={turboActive}
      />
    </RigidBody>
  );
}
