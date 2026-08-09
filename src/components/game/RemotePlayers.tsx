"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { onRoster, remotes } from "@/lib/net";
import { BODY } from "./types";
import { StickFigure } from "./StickFigure";
import { Shotgun } from "./Shotgun";

const targetPos = new THREE.Vector3();
const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");
const targetQuat = new THREE.Quaternion();

function RemotePlayer({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const aim = useRef<THREE.Group>(null);
  const remote = remotes.get(id);
  const [hx, hy] = BODY[remote?.role ?? "hider"];
  const settled = useRef(false);

  useFrame((_, delta) => {
    const g = group.current;
    const r = remotes.get(id);
    if (!g || !r) return;

    targetPos.set(r.target.x, r.target.y, r.target.z);
    // Snap on the first frame so a joining player doesn't fly in from origin.
    if (settled.current) {
      g.position.lerp(targetPos, 1 - Math.pow(0.0000001, delta));
    } else {
      g.position.copy(targetPos);
      settled.current = true;
    }

    targetEuler.set(0, r.target.yaw, r.target.flat ? Math.PI / 2 : 0);
    targetQuat.setFromEuler(targetEuler);
    visual.current?.quaternion.slerp(targetQuat, 1 - Math.pow(0.0000001, delta));

    // Tilt the held gun with the seeker's aim.
    if (aim.current) aim.current.rotation.x = -r.target.pitch;
  });

  if (!remote) return null;

  return (
    <group ref={group}>
      <group ref={visual}>
        <StickFigure scale={hy} />
        {remote.role === "seeker" && (
          <group ref={aim} position={[hx * 0.72, hy * 0.28, 0]}>
            <Shotgun scale={1.05} />
          </group>
        )}
      </group>
      <Html position={[0, hy + 0.55, 0]} center distanceFactor={14}>
        <div className="whitespace-nowrap rounded bg-black/60 px-2 py-0.5 font-mono text-[13px] text-white">
          {remote.name}
        </div>
      </Html>
    </group>
  );
}

export function RemotePlayers() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => onRoster(setIds), []);

  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} id={id} />
      ))}
    </>
  );
}
