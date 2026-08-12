import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { onRoster, remotes } from "@/game/net";
import { BODY } from "./body";
import { StickFigure } from "@/game/figure/StickFigure";
import { Shotgun } from "@/game/combat/Shotgun";

/**
 * Every remote figure's root, so a hunter's shot can raycast the people in the
 * room. Keyed by session id; the id is also stamped on the group's userData so
 * a hit mesh can be walked back to its owner.
 */
export const remoteFigures = new Map<string, THREE.Group>();

const targetPos = new THREE.Vector3();
const targetEuler = new THREE.Euler(0, 0, 0, "YXZ");
const targetQuat = new THREE.Quaternion();

function RemotePlayer({
  id,
  reveal,
  hunting,
}: {
  id: string;
  reveal: boolean;
  hunting: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const visual = useRef<THREE.Group>(null);
  const remote = remotes.get(id);
  const [, hy] = BODY[remote?.role ?? "chameleon"];
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
        {/* A hunter holds the gun out along their aim, so chameleons can read both
            where they are looking and how far up or down. */}
        <StickFigure
          scale={hy}
          pose={() => remotes.get(id)?.target.pose ?? 0}
          skinId={id}
          aim={
            remote.role === "hunter"
              ? () => remotes.get(id)?.target.pitch ?? 0
              : null
          }
          holding={remote.role === "hunter" ? <Shotgun scale={1.05} /> : null}
          /* Anyone still a chameleon when the round is over survived it — the
             caught ones are hunters by now — so during the reveal they light up
             through the walls and the spot that beat you stops being a mystery. */
          highlight={reveal && remote.role === "chameleon"}
        />
      </group>
      {/* **A chameleon has no name badge during the hunt.**
          drei's `Html` is DOM over the canvas, so it is not occluded by anything
          — a label hovering above a hidden player is a marker drawn *through* the
          wall they are hiding behind, which hands the hunter every spot in the
          room for free. Hunters keep theirs: they are not hiding, and knowing
          where the gun is is most of what a chameleon plays on. It comes back for
          the reveal, where naming the survivors is the entire point. */}
      {!(hunting && remote.role === "chameleon") && (
        <Html position={[0, hy + 0.55, 0]} center distanceFactor={14}>
          <div className="whitespace-nowrap rounded bg-black/60 px-2 py-0.5 font-mono text-[13px] text-white">
            {remote.name}
          </div>
        </Html>
      )}
    </group>
  );
}

export function RemotePlayers({
  reveal = false,
  hunting = false,
}: {
  reveal?: boolean;
  /** The hunt is on, so hidden players must not be labelled. */
  hunting?: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => onRoster(setIds), []);

  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} id={id} reveal={reveal} hunting={hunting} />
      ))}
    </>
  );
}
