"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "./controls";
import { Player } from "./Player";
import { Room } from "./Room";
import { Marks } from "./Marks";
import { Graves } from "./Graves";
import { Viewmodel } from "./Viewmodel";
import { RemotePlayers } from "./RemotePlayers";
import type { Mark, Role } from "./types";
import type { Brush } from "./PaintPanel";
import { onGrave, onMark, type Grave } from "@/lib/net";

const MARK_LIFETIME = 3000;

export default function Scene({
  role,
  alive,
  painting,
  paused,
  brush,
  onHoverBody,
}: {
  role: Role | null;
  /** False while the death screen is up: the body leaves the room entirely, so
   *  respawning mounts a fresh one at the spawn point in the default pose. */
  alive: boolean;
  painting: boolean;
  paused: boolean;
  brush: Brush;
  onHoverBody: (hovering: boolean) => void;
}) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [graves, setGraves] = useState<Grave[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    const off = onMark((m) => {
      setMarks((prev) => [...prev, m]);
      pending.push(
        setTimeout(
          () => setMarks((prev) => prev.filter((x) => x.id !== m.id)),
          MARK_LIFETIME,
        ),
      );
    });
    return () => {
      off();
      pending.forEach(clearTimeout);
    };
  }, []);

  // Graves come from room state, so this also receives the ones that were
  // already there when you joined.
  useEffect(
    () =>
      onGrave((grave) =>
        setGraves((prev) => (prev.some((g) => g.id === grave.id) ? prev : [...prev, grave])),
      ),
    [],
  );

  return (
    <KeyboardControls map={controlMap}>
      <Canvas shadows camera={{ fov: 60, position: [0, 5, 11] }} dpr={[1, 2]}>
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={1.2} />
        <directionalLight
          castShadow
          position={[6, 12, 6]}
          intensity={1.2}
          shadow-mapSize={[2048, 2048]}
        />
        <Physics gravity={[0, -20, 0]}>
          <Room />
          {role && alive && (
            <Player
              role={role}
              painting={painting}
              paused={paused}
              brush={brush}
              onHoverBody={onHoverBody}
            />
          )}
        </Physics>
        <RemotePlayers />
        <Marks marks={marks} />
        <Graves graves={graves} />
        {role === "seeker" && !painting && <Viewmodel />}
      </Canvas>
    </KeyboardControls>
  );
}
