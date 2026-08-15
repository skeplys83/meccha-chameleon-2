import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "@/game/players/controls";
import { GRAVITY } from "@/game/players/body";
import { Player } from "@/game/players/Player";
import { Room } from "@/game/world/Room";
import { DEV, reportDraw, useDevMode } from "@/game/dev";
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

/**
 * Frames drawn per second, at most. `requestAnimationFrame` already pins the
 * loop to the display's refresh rate, so this only ever takes it *down* — which
 * on a 120Hz panel is half the GPU work, and this game is fragment-bound.
 */
const MAX_FPS = 60;

/**
 * Draws at most `fps` frames a second.
 *
 * **Passing a priority above 0 turns off r3f's automatic render**, which is what
 * makes this possible at all: this callback then owns `gl.render`, and skipping
 * it skips the frame. Movement, physics and input still tick at the full refresh
 * rate and only the expensive pass is throttled — input latency and rapier's
 * stability are untouched.
 *
 * **Frame priorities are the game's one ordering guarantee**, and this is the
 * one that draws:
 *
 * | 0 | movement, physics, input — everything that decides where things are |
 * | 1 | anything that must copy a result, i.e. `combat/Viewmodel` off the camera |
 * | 2 | this, which draws |
 * | 3 | anything that must read the drawn frame back — the eyedropper in
 *       `players/Player.tsx`, which samples the framebuffer it just produced |
 *
 * Mount order is *not* a substitute. Components remount independently — `Player`
 * is keyed on the room — so a callback that has to run after another has to say
 * so with a priority.
 */
function FrameLimiter({ fps }: { fps: number }) {
  const carry = useRef(0);

  useFrame(({ gl, scene, camera }, delta) => {
    const interval = 1 / fps;
    carry.current += delta;

    // Half a frame of slack, or a 60Hz display asking for 60fps loses every
    // frame whose delta lands a hair under the interval.
    if (carry.current < interval - delta / 2) return;

    // Carry the remainder so the long-run average holds, but never bank more
    // than a frame of it: after a stall or a backgrounded tab the accumulated
    // debt would otherwise force a burst of catch-up renders.
    carry.current = Math.min(carry.current - interval, interval);
    gl.render(scene, camera);
    // Counted here rather than in the frame loop, so the readout's "fps" is the
    // rate this cap actually produces — see `reportDraw`.
    if (DEV) reportDraw();
  }, 2);

  return null;
}

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
  onBrush,
  picking,
  onPicked,
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
  onBrush: (b: Brush) => void;
  picking: boolean;
  onPicked: (hex: string) => void;
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

  // Both debug pictures follow the toggle, so this re-renders on the flip.
  const devMode = useDevMode();

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
        <FrameLimiter fps={MAX_FPS} />
        {/* The background and every light belong to the map now, and are set by
            `world/Room` — a Blender-authored level carries its own, and one
            hardcoded here would be added to them. */}
        {/* The player integrates `GRAVITY` itself — it is a kinematic body and
            rapier does not accelerate it — so this governs any *other* dynamic
            body. There are none today; sharing the constant is what stops the
            two quietly disagreeing the day there is one. */}
        {/* `debug` draws rapier's own outline for every collider, the player's
            included — the wireframes in `world/GltfLevel` are the raycast layer
            beside it. Both follow the developer-mode toggle, and neither
            exists in the image at all — see `src/game/dev.ts`. */}
        <Physics
          key={map}
          gravity={[0, -GRAVITY, 0]}
          timeStep="vary"
          interpolate={false}
          debug={devMode}
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
              onBrush={onBrush}
              picking={picking}
              onPicked={onPicked}
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
