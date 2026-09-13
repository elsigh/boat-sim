"use client";

import {
  CoefficientCombineRule,
  type ContactForcePayload,
  RapierRigidBody,
  RigidBody,
  RoundCuboidCollider,
  useBeforePhysicsStep,
  useRapier,
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
import { closingSpeedAtContact, type ImpactIncident, type RawImpact } from "@/lib/sim/collision-damage";
import { damageHandling, stepVesselDamage, type VesselDamage } from "@/lib/sim/vessel-damage";
import { liveRigidBody } from "@/lib/sim/rapier-utils";
import { fractureAlongSweep } from "@/lib/sim/structural-collision";

import { BoatVisual } from "./BoatVisual";
import { WashEffects } from "./WashEffects";
import { WakeTrail } from "./WakeTrail";
import { turboThrustMultiplier } from "@/lib/sim/engine-dynamics";

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
  damageRef: MutableRefObject<VesselDamage>;
  onDamageSample: (damage: VesselDamage) => void;
  initialPose: {
    position: [number, number, number];
    yawDeg: number;
  };
  onImpact?: (impact: RawImpact) => void;
  onPositionSample?: (position: { x: number; z: number }) => void;
  onTelemetry: (telemetry: DockingTelemetry) => void;
  grounded?: boolean;
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
const HULL_LINEAR_DAMPING = 0;
// All drag is relative to water and lives in the force model. World-space
// damping would incorrectly resist a hull drifting with the current.
const HULL_ANGULAR_DAMPING = 0;

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
  damageRef,
  onDamageSample,
  initialPose,
  onImpact,
  onPositionSample,
  onTelemetry,
  grounded = false,
  resetRequest,
  turboActive,
}: BoatProps) {
  const { world, colliderStates } = useRapier();
  const damageSampleClock = useRef(0);
  const preStepYawRateRef = useRef(0);
  const controlsRef = useRef(controls);
  const engineStateRef = useRef(engineState);
  const telemetryRef = useRef(onTelemetry);
  const positionSampleRef = useRef(onPositionSample);
  const impactRef = useRef(onImpact);
  const preStepVelocityRef = useRef(new Vector3());
  const boatRef = useRef(boat);
  const environmentRef = useRef(environment);
  const resetRequestRef = useRef(resetRequest);
  const groundedRef = useRef(grounded);
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
    groundedRef.current = grounded;
  }, [grounded]);

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

    const previousDamage = damageRef.current;
    damageRef.current = stepVesselDamage(previousDamage, world.timestep, boatRef.current.massKg);
    damageSampleClock.current += world.timestep;
    if (damageSampleClock.current >= 0.1) {
      damageSampleClock.current = 0;
      onDamageSample(damageRef.current);
    }
    if (!groundedRef.current && damageRef.current.sinking <= 0.3) {
      fractureAlongSweep(world, body, boatRef.current.massKg, world.timestep,
        (collider) => colliderStates.get(collider.handle)?.object.parent?.userData.fracture,
        (hit) => impactRef.current?.(hit));
    }
    const condition = damageHandling(damageRef.current);
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

    if (groundedRef.current || damageRef.current.sinking >= 1) {
      preStepVelocityRef.current.set(0, 0, 0);
      preStepYawRateRef.current = 0;
      body.resetForces(true);
      body.resetTorques(true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const stopped = computeBoatPhysics(
        boatRef.current,
        {
          worldPosition,
          worldRotation,
          worldLinearVelocity: worldVelocity.set(0, 0, 0),
          yawRateRadPerSecond: 0,
        },
        { portThrottle: 0, starboardThrottle: 0, bowThruster: 0 },
        environmentRef.current,
      );

      telemetryRef.current(stopped.telemetry);
      positionSampleRef.current?.({ x: translation.x, z: translation.z });
      return;
    }

    // Contact-force events fire after the solver has already arrested the
    // hull, so impact severity must be judged from the pre-step velocity.
    preStepVelocityRef.current.set(linearVelocity.x, 0, linearVelocity.z);
    preStepYawRateRef.current = angularVelocity.y;

    const result = computeBoatPhysics(
      boatRef.current,
      {
        worldPosition,
        worldRotation,
        worldLinearVelocity: worldVelocity,
        yawRateRadPerSecond: angularVelocity.y,
      },
      {
        portThrottle: engineStateRef.current.port.running ? engineStateRef.current.port.effectiveThrottle : 0,
        starboardThrottle: engineStateRef.current.starboard.running ? engineStateRef.current.starboard.effectiveThrottle : 0,
        bowThruster: condition.stopped ? 0 : controlsRef.current.bowThruster * Math.max(0, 1 - damageRef.current.floodingPct / 100),
        portThrustMultiplier: damageRef.current.floodingPct < 1 ? turboThrustMultiplier(engineStateRef.current.port, boatRef.current.engine) : 1,
        starboardThrustMultiplier: damageRef.current.floodingPct < 1 ? turboThrustMultiplier(engineStateRef.current.starboard, boatRef.current.engine) : 1,
      },
      environmentRef.current,
    );

    // Rapier forces are persistent and accumulate across addForce calls, so the
    // previous step's applications must be cleared before this step's are added.
    body.resetForces(true);
    body.resetTorques(true);

    // Floodwater and a distorted hull add resistance relative to the water.
    if (condition.drag > 0) {
      const water = environmentRef.current.currentVelocity;
      const resistance = boatRef.current.massKg * condition.drag * 0.1;
      body.addForce({ x: -(linearVelocity.x - water.x) * resistance, y: 0, z: -(linearVelocity.z - water.z) * resistance }, true);
    }

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

    if (damageRef.current.sinking > 0.3) return;
    const rotation = body.rotation();
    const translation = body.translation();
    impactRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    impactTranslation.set(translation.x, translation.y, translation.z);
    let contactCount = 0;
    impactWorldPoint.set(0, 0, 0);
    world.contactPair(payload.target.collider, payload.other.collider, (manifold) => {
      for (let i = 0; i < manifold.numSolverContacts(); i++) {
        const point = manifold.solverContactPoint(i);
        impactWorldPoint.add(impactLocalPoint.set(point.x, point.y, point.z));
        contactCount++;
      }
    });
    if (!contactCount) return;
    impactWorldPoint.divideScalar(contactCount);
    impactLocalPoint.copy(impactWorldPoint).sub(impactTranslation);
    impactNormal.set(payload.maxForceDirection.x, 0, payload.maxForceDirection.z).normalize();
    // The force callback's normal can face either way. Orient it into the target.
    if (impactNormal.dot(impactLocalPoint) < 0) impactNormal.negate();
    const other = payload.other.rigidBody;
    const otherVelocity = other?.velocityAtPoint(impactWorldPoint) ?? { x: 0, y: 0, z: 0 };
    const velocity = preStepVelocityRef.current;
    const closingSpeedMps = closingSpeedAtContact(velocity, preStepYawRateRef.current, impactLocalPoint, otherVelocity, impactNormal);
    if (closingSpeedMps < 0.15) return;
    impactLocalPoint.applyQuaternion(impactRotation.invert());
    let targetLocal: { x: number; z: number } | undefined;
    if (other) {
      const p = other.translation(), r = other.rotation();
      impactLocalVelocity.copy(impactWorldPoint).sub(impactTranslation.set(p.x, p.y, p.z))
        .applyQuaternion(impactRotation.set(r.x, r.y, r.z, r.w).invert());
      targetLocal = { x: impactLocalVelocity.x, z: impactLocalVelocity.z };
    }

    report({
      otherName: payload.other.colliderObject?.name ?? "",
      targetVessel: payload.other.colliderObject?.parent?.userData.vessel,
      closingSpeedMps,
      world: { x: impactWorldPoint.x, z: impactWorldPoint.z },
      local: { x: impactLocalPoint.x, z: impactLocalPoint.z },
      targetLocal,
      normal: { x: impactNormal.x, z: impactNormal.z },
      atMs: performance.now(),
    });
  };

  return (
    <>
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
        sensor={damageRef.current.sinking > 0.3}
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

      <BoatVisual key={resetRequest?.id} boat={boat} turboActive={turboActive} bodyRef={bodyRef} environment={environment} grounded={grounded} damageRef={damageRef} incidents={hullDamageMarks} />

      {damageRef.current.sinking === 0 ? <WashEffects
        boat={boat}
        controlsRef={controlsRef}
        engineStateRef={engineStateRef}
        bodyRef={bodyRef}
        environment={environment}
      /> : null}
    </RigidBody>
    {damageRef.current.sinking === 0 ? <WakeTrail boat={boat} bodyRef={bodyRef} engineStateRef={engineStateRef} environment={environment} resetId={resetRequest?.id} /> : null}
    </>
  );
}
