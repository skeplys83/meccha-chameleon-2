"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  RapierRigidBody,
  RigidBody,
  CuboidCollider,
  type RapierCollider,
} from "@react-three/rapier";
import * as THREE from "three";
import type { Control } from "./controls";
import { controlMap, poseControl } from "./controls";
import { followThirdPerson } from "./camera";
import { BODY } from "./body";
import { FIRE_INTERVAL_MS, type Role } from "@/game/shared/protocol";
import { POSES, poseExtents } from "@/game/figure/poses";
import { ROOM_SURFACE } from "@/game/world/Room";
import { StickFigure } from "@/game/figure/StickFigure";
import { resolveShot } from "@/game/combat/shoot";
import { sendKill, sendPaint, sendShoot, sendState } from "@/game/net";
import { setLockTarget } from "@/game/players/pointerLock";
import { SELF } from "@/game/paint/skin";
import { createBrushCursor, type BrushCursor } from "@/game/paint/brushCursor";
import type { Brush } from "@/game/paint/brush";
import { playSound } from "@/game/sound/engine";
import { Stepper, jitteredStepRate, strideFor } from "@/game/sound/footsteps";

const SPEED = 6;
// A velocity, not an impulse: the seeker's collider is bigger and therefore
// heavier, so an impulse would launch the two roles to different heights.
const JUMP_SPEED = 11;
const TURN_SPEED = 2.6; // rad/s for Q/E
const CAMERA_DISTANCE = 7;
const ZOOM_MIN = 1.2;
const ZOOM_MAX = 14;
const ZOOM_STEP = 0.0022; // per wheel pixel
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_MIN = -1.0;
const PITCH_MAX = 0.9;
const PAINT_FLUSH_MS = 100;
const STATE_SEND_MS = 50;
/** Thickness of the hover ring in world units — constant, so the outline does
 *  not thin out or fatten as the brush grows. */
const RING_BORDER = 0.012;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const bodyPos = new THREE.Vector3();
const lookDir = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const quat = new THREE.Quaternion();
const groundRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
/** How far below the feet still counts as standing on something. */
const GROUND_REACH = 0.2;
/** Module-level so its identity never changes: @react-three/rapier re-applies
 *  `position` whenever the prop changes, and a literal array is a new value on
 *  every render — which teleported the player to spawn on any state change. */
const SPAWN: [number, number, number] = [0, 4, 0];
/** Nothing under the floor can recover on its own, so anything below this is
 *  put back at spawn. */
const FLOOR_ESCAPE_Y = -3;
/**
 * Every control held down false — what the frame loop reads while paused.
 *
 * It must be a *complete* key state, never `{}`: a missing entry reads back as
 * `undefined`, `Number(undefined)` is NaN, and a single NaN reaching
 * `setLinvel` or `setRotationWrtParent` panics rapier ("unreachable"), which
 * poisons the wasm module for good ("recursive use of an object…") and throws
 * the body out of the world — where the catch below resets it to SPAWN, i.e.
 * pausing teleported you to the middle of the arena.
 */
const NO_KEYS = Object.freeze(
  Object.fromEntries(controlMap.map((entry) => [entry.name, false])),
) as Readonly<Record<Control, boolean>>;

export function Player({
  role,
  painting,
  paused,
  brush,
  onHoverBody,
}: {
  role: Role;
  /** A seeker who opened the palette: they step out to third person to paint. */
  painting: boolean;
  paused: boolean;
  brush: Brush;
  /** Fires when the cursor moves on or off your own body. */
  onHoverBody: (hovering: boolean) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<THREE.Group>(null);
  const yaw = useRef(0); // camera yaw, from the mouse
  const pitch = useRef(-0.2); // positive looks up
  const bodyYaw = useRef(0); // figure facing, from Q/E
  const locked = useRef(false);
  /** Space last frame, so a jump fires on the press and not on every frame the
   *  key is held down. */
  const jumpHeld = useRef(false);
  const netState = useRef({ x: 0, y: 4, z: 0, yaw: 0, pitch: 0, pose: 0 });
  const solids = useRef<THREE.Object3D[]>([]);
  const [pose, setPose] = useState(0);
  const brushRef = useRef(brush);
  const paintingRef = useRef(painting);
  /** Hiders never take the pointer lock, so they look around by dragging. */
  const orbiting = useRef(false);
  const pausedRef = useRef(paused);
  const hoverRef = useRef<((hovering: boolean) => void) | null>(null);
  const hovering = useRef(false);
  const cursor = useRef<BrushCursor | null>(null);
  const outbox = useRef<string[]>([]);
  const zoom = useRef(CAMERA_DISTANCE);
  /** Your own footsteps. Remote figures get one of these each in SoundStage;
   *  yours lives here because this is the only place that knows you are on the
   *  ground — nobody else's `grounded` is on the wire. */
  const stepper = useRef(new Stepper(strideFor(role)));
  /** When the shotgun last went off, so a held mouse button is one shot. */
  const lastShot = useRef(0);
  const ring = useRef<THREE.Mesh>(null);
  const [, getKeys] = useKeyboardControls<Control>();
  const { gl, camera, scene, raycaster } = useThree();

  const [hx, hy, hz] = BODY[role];
  /** Half-height of the collider as it currently stands, so a pose that
   *  changes it can move the body by the difference. */
  const halfHeight = useRef(hy);
  // In paint mode even a seeker steps out to third person to see their body.
  const firstPerson = role === "seeker" && !painting;
  const rolled = POSES[pose].roll ?? false;

  // The pointer handlers below are installed once, so the current brush and
  // mode reach them through refs rather than by re-binding every change.
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);
  useEffect(() => {
    paintingRef.current = painting;
    if (!painting) cursor.current?.cancel();
  }, [painting]);
  useEffect(() => {
    pausedRef.current = paused;
    // A drag that was in flight when the menu came up must not carry on
    // painting or turning the camera once the pointer handlers wake up again.
    if (!paused) return;
    cursor.current?.cancel();
    orbiting.current = false;
    hoverRef.current?.(false);
  }, [paused]);
  useEffect(() => {
    // Only report changes: this runs on every mouse move.
    hoverRef.current = (next: boolean) => {
      if (hovering.current === next) return;
      hovering.current = next;
      onHoverBody(next);
    };
  }, [onHoverBody]);

  // The room is static, so its meshes are collected once and reused for the
  // shot raycast, the ground test and keeping the camera out of walls.
  useEffect(() => {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.name === ROOM_SURFACE) list.push(o);
    });
    solids.current = list;
  }, [scene]);

  // Mouse look, painting and shooting all depend on the pointer, so they are
  // installed together and share one teardown.
  useEffect(() => {
    const canvas = gl.domElement;
    setLockTarget(canvas);

    const brushCursor = createBrushCursor({
      canvas,
      camera,
      raycaster,
      figure: () => visual.current,
      ring: () => ring.current,
      brush: () => brushRef.current,
      onStroke: (encoded) => outbox.current.push(encoded),
    });
    cursor.current = brushCursor;

    const onPointerDown = (e: MouseEvent) => {
      // Paused means paused: no painting, no shooting, and above all no
      // grabbing the pointer lock back, which would cancel the menu.
      if (pausedRef.current) return;

      // Right button always turns the camera while the cursor is free.
      if (e.button === 2) {
        if (!locked.current) orbiting.current = true;
        return;
      }
      if (e.button !== 0) return;

      // Left button on your own body draws on it.
      if (!locked.current && brushCursor.begin(e)) return;

      // Only the seeker takes the pointer lock — a hider keeps their cursor so
      // the brush and the palette are always to hand.
      if (role === "hider") return;
      if (!locked.current) {
        if (!paintingRef.current) canvas.requestPointerLock();
        return;
      }

      // A pump-action needs pumping. The trigger-pull is what is rate-limited,
      // not the hit — clicking faster than this simply does nothing, rather than
      // queueing up. The server enforces the same interval, since fire rate is
      // the one thing about a shot that reaches everybody else.
      const now = performance.now();
      if (now - lastShot.current < FIRE_INTERVAL_MS) return;
      lastShot.current = now;

      const shot = resolveShot(raycaster, camera, solids.current);
      if (!shot) return;
      if (shot.kind === "player") sendKill(shot.id, shot.point);
      // The server relays the mark back to everyone, this client included, so
      // every player sees the same patch appear.
      else sendShoot(shot.position, shot.rotation);
    };

    const onPointerUp = () => {
      brushCursor.end();
      orbiting.current = false;
    };

    // The right-drag look would otherwise raise the browser menu.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // Wheel zooms the third-person camera. Painting fine detail needs to get
    // close, and hiders want to pull back to check their hiding spot. It is a
    // third-person control, so it is the hider's — a seeker's camera sits
    // inside their head and there is nothing to pull back from.
    const onWheel = (e: WheelEvent) => {
      if (pausedRef.current || role === "seeker") return;
      e.preventDefault();
      zoom.current = THREE.MathUtils.clamp(
        zoom.current * (1 + e.deltaY * ZOOM_STEP),
        ZOOM_MIN,
        ZOOM_MAX,
      );
    };

    const onMouseMove = (e: MouseEvent) => {
      // While the menu is up the cursor belongs to the menu: moving it must not
      // turn the camera, and must not report a hover — a hover pops the palette
      // open, and opening the palette clears `paused`, so the pause menu used
      // to vanish the moment you moved the mouse towards it.
      if (pausedRef.current) return;

      // A stroke already in flight wins over everything else the mouse could
      // mean — including a right button pressed mid-drag.
      if (brushCursor.drawing) {
        brushCursor.move(e);
        return;
      }

      // A free cursor means the body can be painted, so keep the brush ring on
      // whatever it is over and tell the HUD, which pops the palette open.
      if (!locked.current && !orbiting.current) {
        hoverRef.current?.(brushCursor.move(e));
      } else {
        brushCursor.cancel();
        hoverRef.current?.(false);
      }

      if (!locked.current && !orbiting.current) return;
      yaw.current -= e.movementX * MOUSE_SENSITIVITY;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * MOUSE_SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      );
    };

    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      cursor.current = null;
      setLockTarget(null);
    };
  }, [gl, camera, scene, raycaster, role]);

  // Broadcast on a timer rather than from useFrame: a backgrounded tab stops
  // running frames entirely, which would look like the player vanishing.
  useEffect(() => {
    const send = setInterval(() => {
      const t = netState.current;
      sendState([t.x, t.y, t.z], t.yaw, t.pitch, t.pose);
    }, STATE_SEND_MS);
    return () => clearInterval(send);
  }, []);

  // Strokes go out in batches: a drag produces far more points than are worth
  // a message each.
  useEffect(() => {
    const flush = setInterval(() => {
      if (!outbox.current.length) return;
      sendPaint(outbox.current.splice(0, outbox.current.length));
    }, PAINT_FLUSH_MS);
    return () => clearInterval(flush);
  }, []);

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb) return;

    // A curled or seated figure gets a smaller collider (see poseExtents). The
    // box grows and shrinks around the body's centre, so the body has to be
    // lifted by the same amount or half of a growing box ends up below the
    // floor — rapier resolves that by dropping the player out of the world.
    //
    // This lives in the frame loop, not an effect: every rapier call has to
    // happen while the world is known to be alive. Touching a stale handle
    // panics inside wasm, and a panicked module then throws "recursive use of
    // an object" on *every* later call, which kills physics for good.
    const half = poseExtents(pose, [hx, hy, hz])[1];
    if (half !== halfHeight.current) {
      const t = rb.translation();
      rb.setTranslation({ x: t.x, y: t.y + (half - halfHeight.current), z: t.z }, true);
      halfHeight.current = half;
    }

    const p = rb.translation();
    // Nothing should reach this, but a player under the floor can never
    // recover on their own and sees nothing but empty background.
    if (p.y < FLOOR_ESCAPE_Y) {
      rb.setTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    bodyPos.set(p.x, p.y, p.z);

    const keys: Readonly<Record<Control, boolean>> = paused ? NO_KEYS : getKeys();

    // Poses are a hider's whole game. A seeker hunts upright and never leaves
    // POSES[0], so the number keys simply are not theirs.
    if (role === "hider") {
      for (let i = 0; i < POSES.length; i++) {
        if (keys[poseControl(i)] && pose !== i) {
          setPose(i);
          break;
        }
      }
    }

    // Movement follows where you are looking, not where the figure faces.
    const y = yaw.current;

    // A hider aims their figure independently of the camera with Q/E — that is
    // how you line yourself up with a wall. A seeker's figure just faces the
    // way they are looking, which is also exactly what remotes are shown.
    // The one exception is a seeker who opened the palette: they are in third
    // person to paint, and if the figure tracked the camera they could never
    // orbit round to see their own back.
    if (role === "hider") {
      bodyYaw.current +=
        (Number(keys.turnLeft) - Number(keys.turnRight)) * TURN_SPEED * delta;
    } else if (firstPerson) {
      bodyYaw.current = y;
    }
    forward.set(-Math.sin(y), 0, -Math.cos(y));
    right.set(Math.cos(y), 0, -Math.sin(y));

    move
      .set(0, 0, 0)
      .addScaledVector(forward, Number(keys.forward) - Number(keys.backward))
      .addScaledVector(right, Number(keys.right) - Number(keys.left));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED);

    // Grounded is a short ray straight down against the room, not the old
    // `|velocity.y| < 0.05` — that is *also* true at the top of a jump, so
    // holding Space re-launched you at every apex and you climbed forever.
    // Edge-triggering on top of it means one jump per press, never a hover.
    groundRay.set(bodyPos, DOWN);
    groundRay.far = half + GROUND_REACH;
    const grounded =
      solids.current.length > 0 &&
      groundRay.intersectObjects(solids.current, false).length > 0;
    const jumping = keys.jump && !jumpHeld.current && grounded;
    jumpHeld.current = keys.jump;

    // Your own steps are not positional: you are the listener, and a panner at
    // zero distance behaves badly. Quieter than everyone else's, because your own
    // feet are the ones you least need to hear.
    if (grounded && stepper.current.update(p.x, p.y, p.z, delta)) {
      playSound("step", { rate: jitteredStepRate(role), gain: 0.8 });
    } else if (!grounded) {
      stepper.current.reset();
    }

    const velocity = rb.linvel();
    rb.setLinvel(
      { x: move.x, y: jumping ? JUMP_SPEED : velocity.y, z: move.z },
      true,
    );

    // The body's rotation is frozen, so the figure is turned by rotating the
    // visual group and the collider together. The roll of a lying pose is
    // animated inside StickFigure; the collider only needs the end state.
    euler.set(0, bodyYaw.current, rolled ? Math.PI / 2 : 0);
    quat.setFromEuler(euler);
    euler.set(0, bodyYaw.current, 0);
    visual.current?.quaternion.setFromEuler(euler);
    collider.current?.setRotationWrtParent(quat);

    const net = netState.current;
    net.x = p.x;
    net.y = p.y;
    net.z = p.z;
    // Which, for a seeker, is their camera heading — so hiders can read where
    // the gun hunting them is pointed.
    net.yaw = bodyYaw.current;
    net.pitch = role === "seeker" ? pitch.current : 0;
    net.pose = pose;

    const cp = Math.cos(pitch.current);
    lookDir.set(-Math.sin(y) * cp, Math.sin(pitch.current), -Math.cos(y) * cp);

    if (firstPerson) {
      // Always eye height: a seeker cannot pose, so there is no rolled-over
      // body to drop the camera into.
      state.camera.position.set(bodyPos.x, bodyPos.y + hy * 0.72, bodyPos.z);
      euler.set(pitch.current, y, 0);
      state.camera.quaternion.setFromEuler(euler);
    } else {
      followThirdPerson(state.camera, bodyPos, lookDir, zoom.current, solids.current, delta);
    }
  });

  return (
    <>
      {/* Brush preview. It lives outside the body so it is not dragged around
          by the figure's own rotation. */}
      <mesh ref={ring} visible={false} renderOrder={10} frustumCulled={false}>
        <ringGeometry
          args={[Math.max(0.002, brush.size * hy - RING_BORDER), brush.size * hy, 40]}
        />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.9}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <RigidBody
        ref={body}
        colliders={false}
        mass={1}
        type="dynamic"
        position={SPAWN}
        enabledRotations={[false, false, false]}
        canSleep={false}
      >
        <CuboidCollider
          key={POSES[pose].shape ?? "stand"}
          ref={collider}
          args={poseExtents(pose, [hx, hy, hz])}
        />
        <group ref={visual}>
          {/* In first person the camera sits inside the head, so the seeker's
              own figure is hidden and the viewmodel stands in for it. */}
          {!firstPerson && <StickFigure scale={hy} pose={pose} skinId={SELF} />}
        </group>
      </RigidBody>
    </>
  );
}
