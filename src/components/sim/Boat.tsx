"use client";

import {
  CoefficientCombineRule,
  RapierRigidBody,
  RigidBody,
  RoundCuboidCollider,
  useBeforePhysicsStep,
} from "@react-three/rapier";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Color, ExtrudeGeometry, Quaternion, Shape, Vector3 } from "three";

import type { BoatProfile } from "@/lib/boats/catalog";
import type { GamepadSnapshot } from "@/hooks/useGamepad";
import type { TwinEngineState } from "@/hooks/useEngineState";
import {
  computeBoatPhysics,
  type DockingTelemetry,
} from "@/lib/sim/boat-physics";
import type { SimulationEnvironment } from "@/lib/sim/boat-physics";

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

function createTaperedDeckGeometry({
  aftHalfWidth,
  bowHalfWidth,
  height,
  length,
}: {
  aftHalfWidth: number;
  bowHalfWidth: number;
  height: number;
  length: number;
}) {
  const shape = new Shape();

  shape.moveTo(-aftHalfWidth, -length * 0.5);
  shape.lineTo(aftHalfWidth, -length * 0.5);
  shape.lineTo(bowHalfWidth, length * 0.5);
  shape.lineTo(-bowHalfWidth, length * 0.5);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.04,
    bevelThickness: 0.04,
    steps: 1,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height * 0.5, 0);
  geometry.computeVertexNormals();

  return geometry;
}

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

  const hullGeometry = useMemo(() => {
    const halfBeam = boat.beamM * 0.5;
    const length = boat.lengthM * 0.95;
    const shape = new Shape();

    shape.moveTo(0, length * 0.5);
    shape.bezierCurveTo(
      halfBeam * 0.22,
      length * 0.48,
      halfBeam * 0.88,
      length * 0.26,
      halfBeam * 0.92,
      -length * 0.18,
    );
    shape.quadraticCurveTo(halfBeam * 0.9, -length * 0.5, 0, -length * 0.5);
    shape.quadraticCurveTo(
      -halfBeam * 0.9,
      -length * 0.5,
      -halfBeam * 0.92,
      -length * 0.18,
    );
    shape.bezierCurveTo(
      -halfBeam * 0.88,
      length * 0.26,
      -halfBeam * 0.22,
      length * 0.48,
      0,
      length * 0.5,
    );

    const geometry = new ExtrudeGeometry(shape, {
      depth: 1.32,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.12,
      bevelThickness: 0.18,
      steps: 1,
    });

    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0.34, 0);
    geometry.computeVertexNormals();

    return geometry;
  }, [boat.beamM, boat.lengthM]);
  const deckhouseGeometry = useMemo(() => {
    return createTaperedDeckGeometry({
      aftHalfWidth: boat.beamM * boat.visual.deckhouseAftHalfWidthRatio,
      bowHalfWidth: boat.beamM * boat.visual.deckhouseBowHalfWidthRatio,
      height: boat.visual.deckhouseHeight,
      length: boat.lengthM * boat.visual.deckhouseLengthRatio,
    });
  }, [
    boat.beamM,
    boat.lengthM,
    boat.visual.deckhouseAftHalfWidthRatio,
    boat.visual.deckhouseBowHalfWidthRatio,
    boat.visual.deckhouseLengthRatio,
    boat.visual.deckhouseHeight,
  ]);
  const upperHelmGeometry = useMemo(() => {
    const sternHalfWidth = boat.beamM * boat.visual.upperHelmWidthRatio * 0.46;
    const bowHalfWidth = sternHalfWidth * 0.78;

    return createTaperedDeckGeometry({
      aftHalfWidth: sternHalfWidth,
      bowHalfWidth,
      height: boat.visual.upperHelmHeight,
      length: boat.lengthM * boat.visual.upperHelmLengthRatio,
    });
  }, [
    boat.beamM,
    boat.lengthM,
    boat.visual.upperHelmHeight,
    boat.visual.upperHelmLengthRatio,
    boat.visual.upperHelmWidthRatio,
  ]);
  const flybridgeGeometry = useMemo(() => {
    const sternHalfWidth = boat.beamM * boat.visual.flybridgeWidthRatio * 0.46;
    const bowHalfWidth = sternHalfWidth * 0.84;

    return createTaperedDeckGeometry({
      aftHalfWidth: sternHalfWidth,
      bowHalfWidth,
      height: boat.visual.flybridgeHeight,
      length: boat.lengthM * boat.visual.flybridgeLengthRatio,
    });
  }, [
    boat.beamM,
    boat.lengthM,
    boat.visual.flybridgeHeight,
    boat.visual.flybridgeLengthRatio,
    boat.visual.flybridgeWidthRatio,
  ]);
  const aftRoofGeometry = useMemo(() => {
    const sternHalfWidth = boat.beamM * 0.24;
    const bowHalfWidth = sternHalfWidth * 0.88;

    return createTaperedDeckGeometry({
      aftHalfWidth: sternHalfWidth,
      bowHalfWidth,
      height: 0.12,
      length: boat.lengthM * boat.visual.aftDeckLengthRatio,
    });
  }, [boat.beamM, boat.lengthM, boat.visual.aftDeckLengthRatio]);

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

      <group>
        <mesh castShadow receiveShadow geometry={hullGeometry}>
          <meshStandardMaterial
            color={new Color(boat.visual.hullColor)}
            metalness={0.08}
            roughness={0.72}
          />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          geometry={deckhouseGeometry}
          position={[0, 0.56, boat.lengthM * boat.visual.deckhouseOffsetZRatio]}
        >
          <meshStandardMaterial
            color={new Color(boat.visual.houseColor)}
            metalness={0.08}
            roughness={0.74}
          />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          geometry={upperHelmGeometry}
          position={[0, boat.visual.deckhouseHeight + 0.42, boat.lengthM * boat.visual.upperHelmOffsetZRatio]}
        >
          <meshStandardMaterial
            color={new Color(boat.visual.roofColor)}
            metalness={0.08}
            roughness={0.5}
          />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          geometry={flybridgeGeometry}
          position={[0, boat.visual.flybridgeHeight + 0.3, boat.lengthM * boat.visual.flybridgeOffsetZRatio]}
        >
          <meshStandardMaterial
            color={new Color(boat.visual.houseColor)}
            metalness={0.08}
            roughness={0.56}
          />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          geometry={aftRoofGeometry}
          position={[0, 1.18, boat.lengthM * boat.visual.aftDeckOffsetZRatio]}
        >
          <meshStandardMaterial
            color={new Color(boat.visual.roofColor)}
            metalness={0.1}
            roughness={0.52}
          />
        </mesh>

        <mesh castShadow position={[0, boat.visual.deckhouseHeight + 1.12, boat.lengthM * boat.visual.mastOffsetZRatio]}>
          <boxGeometry args={[0.16, 0.92, 0.16]} />
          <meshStandardMaterial color={new Color(boat.visual.roofColor)} metalness={0.18} roughness={0.42} />
        </mesh>

        <mesh position={[-boat.beamM * 0.32, -0.56, boat.lengthM * 0.3]}>
          <boxGeometry args={[0.16, 0.16, 0.92]} />
          <meshStandardMaterial color={new Color(boat.visual.railColor)} metalness={0.35} roughness={0.3} />
        </mesh>

        <mesh position={[boat.beamM * 0.32, -0.56, boat.lengthM * 0.3]}>
          <boxGeometry args={[0.16, 0.16, 0.92]} />
          <meshStandardMaterial color={new Color(boat.visual.railColor)} metalness={0.35} roughness={0.3} />
        </mesh>

        <mesh position={[0, -0.46, -boat.lengthM * 0.24]}>
          <boxGeometry args={[boat.beamM * 0.16, 0.56, boat.lengthM * 0.44]} />
          <meshStandardMaterial color={new Color("#c7b18b")} metalness={0.05} roughness={0.86} />
        </mesh>

        <mesh position={[0, boat.visual.deckhouseHeight * 0.78, boat.lengthM * boat.visual.deckhouseOffsetZRatio]}>
          <boxGeometry args={[boat.beamM * 0.34, 0.16, boat.lengthM * 0.1]} />
          <meshStandardMaterial color={new Color(boat.visual.windowColor)} metalness={0.35} roughness={0.22} />
        </mesh>

        {/* fenders along both rails — this is a docking boat, after all */}
        {[-0.32, -0.05, 0.24].map((zRatio) =>
          [-1, 1].map((side) => (
            <mesh
              key={`fender-${zRatio}-${side}`}
              position={[
                side * boat.beamM * 0.485,
                -0.15,
                boat.lengthM * zRatio,
              ]}
            >
              <capsuleGeometry args={[0.14, 0.42, 4, 10]} />
              <meshStandardMaterial color="#f2f4f2" roughness={0.6} />
            </mesh>
          )),
        )}

        {boat.visual.superstructureStyle === "expedition" ? (
          <>
            <mesh position={[0, 1.08, boat.lengthM * 0.18]}>
              <boxGeometry args={[boat.beamM * 0.66, 0.56, boat.lengthM * 0.08]} />
              <meshStandardMaterial color={new Color(boat.visual.houseColor)} metalness={0.08} roughness={0.62} />
            </mesh>
            <mesh position={[0, boat.visual.deckhouseHeight + 0.18, boat.lengthM * 0.06]}>
              <boxGeometry args={[boat.beamM * 0.4, 0.16, boat.lengthM * 0.06]} />
              <meshStandardMaterial color={new Color(boat.visual.windowColor)} metalness={0.32} roughness={0.2} />
            </mesh>
          </>
        ) : (
          <mesh position={[0, 0.92, boat.lengthM * 0.06]}>
            <boxGeometry args={[boat.beamM * 0.38, 0.22, boat.lengthM * 0.1]} />
            <meshStandardMaterial color={new Color(boat.visual.windowColor)} metalness={0.32} roughness={0.2} />
          </mesh>
        )}
      </group>

      <WashEffects boat={boat} controlsRef={controlsRef} engineStateRef={engineStateRef} />
    </RigidBody>
  );
}
