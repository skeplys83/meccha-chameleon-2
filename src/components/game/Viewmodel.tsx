"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Shotgun } from "./Shotgun";

/**
 * The seeker's shotgun, held in view. It rides the camera each frame rather
 * than being parented to it, since the camera is driven imperatively.
 */
export function Viewmodel() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(0.3);
    g.translateY(-0.24);
    g.translateZ(-0.55);
  });

  return (
    <group ref={group}>
      <Shotgun />
    </group>
  );
}
