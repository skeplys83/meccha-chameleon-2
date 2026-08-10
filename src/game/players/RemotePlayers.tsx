"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { onRoster, remotes } from "@/game/net";
import { BODY } from "@/game/core/types";
import { StickFigure } from "@/game/figure/StickFigure";
import { Shotgun } from "@/game/combat/Shotgun";

/**
 * Every remote figure's root, so a seeker's shot can raycast the people in the
 * room. Keyed by session id; the id is also stamped on the group's userData so
 * a hit mesh can be walked back to its owner.
 */
export const remoteFigures = new Map<string, THREE.Group>();

const targetPos = new THREE.Vector3();
const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");
const targetQuat = new THREE.Quaternion();

function RemotePlayer({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const remote = remotes.get(id);
  const [, hy] = BODY[remote?.role ?? "hider"];
  const settled = useRef(false);

  useEffect(() => {
    const g = group.current;
    if (g) remoteFigures.set(id, g);
    return () => {
      remoteFigures.delete(id);
    };
  }, [id]);

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

    // Only yaw here: a pose's roll is animated inside StickFigure.
    targetEuler.set(0, r.target.yaw, 0);
    targetQuat.setFromEuler(targetEuler);
    visual.current?.quaternion.slerp(targetQuat, 1 - Math.pow(0.0000001, delta));
  });

  if (!remote) return null;

  return (
    <group ref={group} userData={{ remoteId: id }}>
      <group ref={visual}>
        {/* A seeker holds the gun out along their aim, so hiders can read both
            where they are looking and how far up or down. */}
        <StickFigure
          scale={hy}
          pose={() => remotes.get(id)?.target.pose ?? 0}
          skinId={id}
          aim={
            remote.role === "seeker"
              ? () => remotes.get(id)?.target.pitch ?? 0
              : null
          }
          holding={remote.role === "seeker" ? <Shotgun scale={1.05} /> : null}
        />
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
