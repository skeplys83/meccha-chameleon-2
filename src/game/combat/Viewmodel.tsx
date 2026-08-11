import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Shotgun } from "./Shotgun";
import { getSkin, SELF } from "@/game/paint/skin";
import type { Part } from "@/game/figure/parts";

/**
 * The hunter's own arms and shotgun, held out in front of the camera. It rides
 * the camera each frame rather than being parented to it, since the camera is
 * driven imperatively.
 *
 * Everything below is in camera space: -Z is forward, so the arms run from
 * roughly shoulder height at the bottom of the screen out to the grip and the
 * pump, and the barrel carries on past them into the room.
 */

const GUN = new THREE.Vector3(0.16, -0.2, -0.52);
const GRIP = new THREE.Vector3(0.17, -0.25, -0.42);
const PUMP = new THREE.Vector3(0.16, -0.27, -0.78);
const SHOULDER_R = new THREE.Vector3(0.34, -0.6, 0.14);
const SHOULDER_L = new THREE.Vector3(-0.32, -0.62, 0.1);
const ARM_RADIUS = 0.075;

/** A capsule stretched between two points, used for a whole visible arm. */
function Arm({ from, to, part }: { from: THREE.Vector3; to: THREE.Vector3; part: Part }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return {
      position: new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
      quaternion: q,
      length: Math.max(0.05, len - ARM_RADIUS),
    };
  }, [from, to]);

  const skin = getSkin(SELF);

  return (
    <mesh position={position} quaternion={quaternion}>
      <capsuleGeometry args={[ARM_RADIUS, length, 8, 16]} />
      <meshStandardMaterial map={skin[part]} roughness={0.55} />
    </mesh>
  );
}

export function Viewmodel() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={group}>
      {/* Angled slightly inward so the barrel converges on the crosshair. */}
      <group position={GUN} rotation={[0.03, -0.06, 0]}>
        <Shotgun scale={1.1} />
      </group>
      <Arm from={SHOULDER_R} to={GRIP} part="armForeR" />
      <Arm from={SHOULDER_L} to={PUMP} part="armForeL" />
    </group>
  );
}
