import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "@/game/players/controls";
import { GRAVITY } from "@/game/players/body";
import { Player } from "@/game/players/Player";
import { Room } from "@/game/world/Room";
import { MAPS, mapSpawn, safeMapId } from "@/game/world/maps";
import { Marks } from "@/game/combat/Marks";
import { Graves } from "@/game/combat/Graves";
import { Viewmodel } from "@/game/combat/Viewmodel";
import { RemotePlayers } from "@/game/players/RemotePlayers";
import { SoundStage } from "@/game/sound/SoundStage";
import type { Role } from "@/game/shared/protocol";
import type { Mark } from "@/game/combat/Marks";
import type { Brush } from "@/game/paint/brush";
import { onLeftRoom, onMark, type Grave } from "@/game/net";

const MARK_LIFETIME = 3000;

export default function Scene({
  map,
  room,
  role,
  reveal,
  hunting,
  frozen,
  graves,
  painting,
  paused,
  brush,
  onHoverBody,
}: {
  /** Which map this room is playing, straight from room state. */
  map: string;
  /** Which room this is — its invite code, which is its id. */
  room: string;
  role: Role | null;
  /** The round is over and the survivors are being shown. */
  reveal: boolean;
  /** The hunt is on. Hidden players lose their name badges for the duration. */
  hunting: boolean;
  /** This player is rooted to the spot but may still look around. */
  frozen: boolean;
  /** Where each chameleon was found. */
  graves: Grave[];
  painting: boolean;
  paused: boolean;
  brush: Brush;
  onHoverBody: (hovering: boolean) => void;
}) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chosen = MAPS[safeMapId(map)];
  const render = chosen.render;

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

  /** Marks belong to the room that produced them, so leaving it drops them. */
  useEffect(
    () =>
      onLeftRoom(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setMarks([]);
      }),
    [],
  );

  return (
    <KeyboardControls map={controlMap}>
      {/* "percentage" is PCFShadowMap. Bare `shadows` means PCFSoftShadowMap,
          which three has deprecated and silently downgrades to exactly this —
          so naming it changes nothing on screen and drops the warning. */}
      <Canvas
        shadows={render.shadows?.enabled ?? true}
        camera={{ fov: 60, position: [0, 5, 11] }}
        dpr={render.dpr ?? [1, 2]}
        gl={{ antialias: render.antialias ?? true }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE[render.toneMapping ?? "ACESFilmicToneMapping"];
          gl.toneMappingExposure = render.exposure ?? 1;
          gl.outputColorSpace = THREE[render.outputColorSpace ?? "SRGBColorSpace"];
          gl.shadowMap.enabled = render.shadows?.enabled ?? true;
          gl.shadowMap.type = THREE[render.shadows?.type ?? "PCFSoftShadowMap"];
          if (render.fog) {
            scene.fog = new THREE.Fog(render.fog.color, render.fog.near, render.fog.far);
          }
        }}
      >
        {/* The background and every light belong to the map now, and are set by
            `world/Room` — a Blender-authored level carries its own, and one
            hardcoded here would be added to them. */}
        {/* The player integrates `GRAVITY` itself — it is a kinematic body and
            rapier does not accelerate it — so this governs any *other* dynamic
            body. There are none today; sharing the constant is what stops the
            two quietly disagreeing the day there is one. */}
        <Physics
          key={map}
          gravity={[0, -GRAVITY, 0]}
          timeStep="vary"
          interpolate={false}
        >
          <Room map={map} />
          {role && (
            <Player
              key={`${room}:${role}`}
              role={role}
              spawn={mapSpawn(map)}
              frozen={frozen}
              painting={painting}
              paused={paused}
              brush={brush}
              onHoverBody={onHoverBody}
            />
          )}
        </Physics>
        <RemotePlayers reveal={reveal} hunting={hunting} />
        {/* Needs the camera every frame to keep the audio listener on your head. */}
        <SoundStage />
        <Marks marks={marks} />
        <Graves graves={graves} />
        {role === "hunter" && !painting && <Viewmodel />}
      </Canvas>
    </KeyboardControls>
  );
}
