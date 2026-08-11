import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { controlMap } from "@/game/players/controls";
import { GRAVITY } from "@/game/players/body";
import { Player } from "@/game/players/Player";
import { Room } from "@/game/world/Room";
import { mapSpawn } from "@/game/world/maps";
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
  frozen,
  graves,
  painting,
  paused,
  brush,
  onHoverBody,
}: {
  /** Which map this room is playing, straight from room state. */
  map: string;
  /**
   * Which room this is — its invite code, which is its id.
   *
   * Nothing is *rendered* from it. It is the identity the local player is keyed
   * on, so that crossing between a lobby and its match builds a new one. See the
   * note on `<Player>` below.
   */
  room: string;
  role: Role | null;
  /** The round is over and the survivors are being shown. */
  reveal: boolean;
  /** This player is rooted to the spot but may still look around. */
  frozen: boolean;
  /**
   * Where each chameleon was found. Owned by `Game.tsx` rather than here,
   * because the round-over panel lists the same graves this scene draws and two
   * copies of one list is one copy too many.
   */
  graves: Grave[];
  painting: boolean;
  paused: boolean;
  brush: Brush;
  onHoverBody: (hovering: boolean) => void;
}) {
  const [marks, setMarks] = useState<Mark[]>([]);
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

  /**
   * Marks belong to the room that produced them, so leaving it drops them.
   *
   * `onLeftRoom` and not an effect keyed on `room`: the next room replays its
   * own state during `attach`, which happens *before* the `RoomInfo` naming it
   * arrives, so clearing on the id would wipe what it had just received. Marks
   * expire on their own in three seconds, but their timers are cancelled here
   * too so a shot fired at the final whistle cannot pop in the next room.
   */
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
        {/* The player integrates `GRAVITY` itself — it is a kinematic body and
            rapier does not accelerate it — so this governs any *other* dynamic
            body. There are none today; sharing the constant is what stops the
            two quietly disagreeing the day there is one. */}
        {/* **Keyed on the map.** A map change used to be an interleaved swap:
            thirty-one arena bodies torn down while fifty-two dungeon ones were
            built, in one commit, with the player being rebuilt beside them and
            the frame loop still stepping — and the dungeon *suspends* while its
            models load, which discards a partly-committed tree. Rapier does not
            survive that; the symptom is a flood of "recursive use of an object"
            and a lost canvas. Rebuilding the world instead makes a map change a
            clean teardown followed by a clean build, with nothing from the old
            one able to be touched by the new. It costs a world per map change,
            which happens twice a round. */}
        <Physics
          key={map}
          gravity={[0, -GRAVITY, 0]}
          timeStep="vary"
          interpolate={false}
        >
          <Room map={map} />
          {/* **Keyed on the room.** Everything about the local player that is
              not on the wire lives in this component — where the body is, which
              pose it holds, the camera's yaw, pitch and zoom, whether it is
              clinging to a wall, its vertical velocity, and the `Stepper` built
              from the role it mounted with. None of that is true of the room you
              have just been carried into, so the whole thing is rebuilt: you
              arrive at `SPAWN`, upright, facing forward, with a stride that
              matches the side you are actually on. Without the key React keeps
              the instance across the hand-off and you land in the lobby wherever
              you happened to be standing when the clock ran out — lying down, if
              that is how you were hiding. Paint deliberately survives; it is
              module state in `paint/skin.ts` and is re-sent on arrival. */}
          {/* **Keyed on the room *and the role*.** Crossing rooms rebuilds the
              body for the reasons below; so does being *caught*, because a
              chameleon who becomes a hunter needs the same fresh start — back at
              the spawn point, upright, with a hunter's collider and a hunter's
              stride — and their role changes without them going anywhere. */}
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
        <RemotePlayers reveal={reveal} />
        {/* Needs the camera every frame to keep the audio listener on your head. */}
        <SoundStage />
        <Marks marks={marks} />
        <Graves graves={graves} />
        {role === "hunter" && !painting && <Viewmodel />}
      </Canvas>
    </KeyboardControls>
  );
}
