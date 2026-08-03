"use client";

import { type RapierRigidBody } from "@react-three/rapier";
import { useFrame, useThree } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import { liveRigidBody } from "@/lib/sim/rapier-utils";

type SimCameraRigProps = {
  boatLengthM: number;
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  pitchOffset: number;
  planZoom: number;
  turboCinematic: boolean;
  viewMode: "plan" | "forward";
  yawOffset: number;
};

const boatPosition = new Vector3();
const boatQuaternion = new Quaternion();
const forwardVector = new Vector3();
const rightVector = new Vector3();
const desiredPosition = new Vector3();
const desiredTarget = new Vector3();
const lookTarget = new Vector3();

export function SimCameraRig({
  boatLengthM,
  bodyRef,
  pitchOffset,
  planZoom,
  turboCinematic,
  viewMode,
  yawOffset,
}: SimCameraRigProps) {
  const { camera } = useThree();
  const initializedRef = useRef(false);

  useEffect(() => {
    camera.up.set(0, 1, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const body = liveRigidBody(bodyRef);

    if (!body) {
      return;
    }

    const translation = body.translation();
    const rotation = body.rotation();

    boatPosition.set(translation.x, translation.y, translation.z);
    boatQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    forwardVector.set(0, 0, 1).applyQuaternion(boatQuaternion).normalize();
    rightVector.set(1, 0, 0).applyQuaternion(boatQuaternion).normalize();
    const heading = Math.atan2(forwardVector.x, forwardVector.z);

    if (turboCinematic) {
      const cameraDistance = Math.max(31, boatLengthM * 2.15);

      desiredPosition
        .copy(boatPosition)
        .addScaledVector(forwardVector, -cameraDistance)
        .addScaledVector(rightVector, boatLengthM * 0.34);
      desiredPosition.y += Math.max(5.2, boatLengthM * 0.32);
      desiredTarget
        .copy(boatPosition)
        .addScaledVector(forwardVector, boatLengthM * 1.45);
      desiredTarget.y += 1.35;
    } else if (viewMode === "plan") {
      const orbitHeading = heading + Math.PI + yawOffset;
      const polar = Math.min(1.04, Math.max(0.34, 0.42 + pitchOffset));
      const cameraDistance = Math.max(planZoom, boatLengthM * 1.6);
      const horizontalRadius = Math.sin(polar) * cameraDistance;
      const verticalOffset = Math.cos(polar) * cameraDistance;

      desiredPosition.set(
        boatPosition.x + Math.sin(orbitHeading) * horizontalRadius,
        boatPosition.y + verticalOffset,
        boatPosition.z + Math.cos(orbitHeading) * horizontalRadius,
      );
      desiredTarget.copy(boatPosition).addScaledVector(forwardVector, 1.5);
    } else {
      const orbitHeading = heading + Math.PI + yawOffset;
      const polar = Math.min(1.42, Math.max(0.98, 1.16 + pitchOffset));
      const distance = Math.max(18.5, boatLengthM * 1.08);
      const horizontalRadius = Math.sin(polar) * distance;
      const verticalOffset = Math.cos(polar) * distance;

      desiredPosition.set(
        boatPosition.x + Math.sin(orbitHeading) * horizontalRadius,
        boatPosition.y + verticalOffset + 0.8,
        boatPosition.z + Math.cos(orbitHeading) * horizontalRadius,
      );
      desiredPosition
        .addScaledVector(rightVector, 0.45);
      desiredTarget.copy(boatPosition).addScaledVector(forwardVector, 18).add(new Vector3(0, 1.8, 0));
    }

    if (!initializedRef.current) {
      camera.position.copy(desiredPosition);
      lookTarget.copy(desiredTarget);
      initializedRef.current = true;
    } else {
      const smoothing = 1 - Math.exp(-delta * 3.5);
      camera.position.lerp(desiredPosition, smoothing);
      lookTarget.lerp(desiredTarget, smoothing);
    }

    camera.lookAt(lookTarget);
  });

  return null;
}
