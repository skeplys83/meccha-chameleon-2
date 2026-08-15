import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Shotgun } from "./Shotgun";

/** The hunter's own arms and shotgun, held out in front of the camera. */

const GUN = new THREE.Vector3(0.16, -0.2, -0.52);
const GRIP = new THREE.Vector3(0.17, -0.25, -0.42);
const PUMP = new THREE.Vector3(0.16, -0.27, -0.78);
const SHOULDER_R = new THREE.Vector3(0.34, -0.6, 0.14);
const SHOULDER_L = new THREE.Vector3(-0.32, -0.62, 0.1);
const ARM_RADIUS = 0.075;

/** A capsule stretched between two points, used for a whole visible arm. */
function Arm({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
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

  return (
    <mesh position={position} quaternion={quaternion}>
      <capsuleGeometry args={[ARM_RADIUS, length, 8, 16]} />
      <meshStandardMaterial color="#ffffff" roughness={0.55} />
    </mesh>
  );
}

export function Viewmodel() {
  const group = useRef<THREE.Group>(null);

  // Priority 1: after every movement callback, which is where the camera is
  // placed. Mount order cannot be relied on — `Player` is keyed on the room and
  // this is not, so a lobby → match crossing re-registers the player *after*
  // this and the gun starts reading last frame's camera. That reads as the
  // shotgun swimming around while you walk, in matches but not in the lobby.
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
  }, 1);

  return (
    <group ref={group}>
      {/* Angled slightly inward so the barrel converges on the crosshair. */}
      <group position={GUN} rotation={[0.03, -0.06, 0]}>
        <Shotgun scale={1.1} />
      </group>
      <Arm from={SHOULDER_R} to={GRIP} />
      <Arm from={SHOULDER_L} to={PUMP} />
    </group>
  );
}
