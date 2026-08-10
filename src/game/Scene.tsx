"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "@/game/players/controls";
import { Player } from "@/game/players/Player";
import { Room } from "@/game/world/Room";
import { Marks } from "@/game/combat/Marks";
import { Graves } from "@/game/combat/Graves";
import { Viewmodel } from "@/game/combat/Viewmodel";
import { RemotePlayers } from "@/game/players/RemotePlayers";
import { SoundStage } from "@/game/sound/SoundStage";
import type { Role } from "@/game/shared/protocol";
import type { Mark } from "@/game/combat/Marks";
import type { Brush } from "@/game/paint/brush";
import { onGrave, onMark, type Grave } from "@/game/net";

const MARK_LIFETIME = 3000;

export default function Scene({
  map,
  role,
  alive,
  painting,
  paused,
  brush,
  onHoverBody,
}: {
  /** Which map this room is playing, straight from room state. */
  map: string;
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
      {/* "percentage" is PCFShadowMap. Bare `shadows` means PCFSoftShadowMap,
          which three has deprecated and silently downgrades to exactly this —
          so naming it changes nothing on screen and drops the warning. */}
      <Canvas
        shadows="percentage"
        camera={{ fov: 60, position: [0, 5, 11] }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={1.2} />
        <directionalLight
          castShadow
          position={[6, 12, 6]}
          intensity={1.2}
          shadow-mapSize={[2048, 2048]}
        />
        {/* `timeStep="vary"` is load-bearing, not a tuning choice. On the default
            fixed 1/60 step the library renders each body at an *interpolated*
            transform every frame while `rb.translation()` — which the camera and
            every raycast in Player.tsx read — only changes on a step. The two
            clocks drift apart by up to one step, and the figure jitters against
            the camera at one-frame intervals. Stepping once per rendered frame
            makes the interpolation alpha 1, so the two always agree. */}
        <Physics gravity={[0, -20, 0]} timeStep="vary" interpolate={false}>
          <Room map={map} />
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
        {/* Needs the camera every frame to keep the audio listener on your head. */}
        <SoundStage />
        <Marks marks={marks} />
        <Graves graves={graves} />
        {role === "seeker" && !painting && <Viewmodel />}
      </Canvas>
    </KeyboardControls>
  );
}
