import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  RapierRigidBody,
  RigidBody,
  CuboidCollider,
  useRapier,
  type RapierCollider,
} from "@react-three/rapier";
import * as THREE from "three";
import type { Control } from "./controls";
import { controlMap, poseControl } from "./controls";
import { followThirdPerson } from "./camera";
import {
  CLIMB_SPEED,
  RECLING_GRACE,
  RELEASE_PUSH,
  STICK_SPEED,
  findCling,
  holdsCling,
  wallTangents,
  wrapCling,
} from "./cling";
import { BODY, GRAVITY } from "./body";
import { characterController } from "./controller";
import { FIRE_INTERVAL_MS, type Role } from "@/game/shared/protocol";
import { POSES, poseExtents } from "@/game/figure/poses";
import { ROOM_SURFACE } from "@/game/world/Room";
import { surfaceRevision } from "@/game/world/surface";
import { StickFigure } from "@/game/figure/StickFigure";
import { resolveShot } from "@/game/combat/shoot";
import { sendKill, sendPaint, sendShoot, sendState } from "@/game/net";
import { setLockTarget } from "@/game/players/pointerLock";
import { SELF } from "@/game/paint/skin";
import { createBrushCursor, type BrushCursor } from "@/game/paint/brushCursor";
import type { Brush } from "@/game/paint/brush";
import { playSound, startLoop, stopLoop } from "@/game/sound/engine";
import { Stepper, jitteredStepRate, strideFor } from "@/game/sound/footsteps";

const SPEED = 6;
/** A velocity, not an impulse. */
const JUMP_SPEED = 11;
/** Downward speed held while grounded, so the controller keeps finding the floor. */
const GROUND_STICK = 1;
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
/** Scratch for movement across the surface being climbed, and the wall's axes. */
const alongSurface = new THREE.Vector3();
const wallUp = new THREE.Vector3();
const wallRight = new THREE.Vector3();
/** Where the body wants to go this frame, before the controller has its say. */
const desired = new THREE.Vector3();
/** The fall-back drop-in point, used only if a map somehow has none. */
const SPAWN: [number, number, number] = [0, 2, 0];
/** Nothing under the floor can recover on its own, so anything below this is
 *  put back at spawn. */
const FLOOR_ESCAPE_Y = -3;
/** Every control held down false — what the frame loop reads while paused. */
const NO_KEYS = Object.freeze(
  Object.fromEntries(controlMap.map((entry) => [entry.name, false])),
) as Readonly<Record<Control, boolean>>;

export function Player({
  role,
  spawn = SPAWN,
  painting,
  paused,
  frozen = false,
  brush,
  onHoverBody,
}: {
  role: Role;
  /** Where this map puts a body. Must be a stable array — see `SPAWN`. */
  spawn?: [number, number, number];
  /** A hunter who opened the palette: they step out to third person to paint. */
  painting: boolean;
  paused: boolean;
  /** Rooted to the spot, but still able to look around. */
  frozen?: boolean;
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
  /** Vertical velocity, which is now ours to integrate. */
  const vy = useRef(0);
  /** Whether the controller found ground *last* frame. */
  const grounded = useRef(false);
  /** Seeded from the spawn so the first packets — sent on a timer that starts
   *  before the first frame — say where we actually are, not `y: 4`. */
  const netState = useRef({
    x: spawn[0],
    y: spawn[1],
    z: spawn[2],
    yaw: 0,
    pitch: 0,
    pose: 0,
    cling: false,
  });
  const solids = useRef<THREE.Object3D[]>([]);
  /** Which version of the world `solids` was collected from. -1 forces a first
   *  pass on the very first frame. */
  const solidsRevision = useRef(-1);
  const [pose, setPose] = useState(0);
  const brushRef = useRef(brush);
  const paintingRef = useRef(painting);
  /** Chameleons never take the pointer lock, so they look around by dragging. */
  const orbiting = useRef(false);
  const pausedRef = useRef(paused);
  const frozenRef = useRef(frozen);
  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);
  /** Whether this tab still has the keyboard. */
  const focused = useRef(true);
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
  /** The surface a chameleon is stuck to, as a normal pointing back at them, or null when free. */
  const cling = useRef<THREE.Vector3 | null>(null);
  /** Seconds left before a surface can be grabbed again after letting go. */
  const reclingGrace = useRef(0);
  const ring = useRef<THREE.Mesh>(null);
  const [, getKeys] = useKeyboardControls<Control>();
  const { gl, camera, scene, raycaster } = useThree();
  // The world handle only. Nothing is *called* on it here — the controller is
  // fetched inside the frame loop, because that is the only place rapier is
  // safe to touch. See `controller.ts` and trap 5.
  const { world } = useRapier();

  const [hx, hy, hz] = BODY[role];
  /** Half-height of the collider as it currently stands, so a pose that
   *  changes it can move the body by the difference. */
  const halfHeight = useRef(hy);
  // In paint mode even a hunter steps out to third person to see their body.
  const firstPerson = role === "hunter" && !painting;
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

  // Mouse look, painting and shooting all depend on the pointer, so they are
  // installed together and share one teardown.
  useEffect(() => {
    const canvas = gl.domElement;
    setLockTarget(canvas);

    // The lock may already be held when this component is built.
    locked.current = document.pointerLockElement === canvas;

    const brushCursor = createBrushCursor({
      canvas,
      camera,
      raycaster,
      figure: () => visual.current,
      ring: () => ring.current,
      brush: () => brushRef.current,
      onStroke: (encoded) => outbox.current.push(encoded),
      // One hook for the whole drag, so the brush cannot keep scrubbing after a
      // cancel — see the note on `onDrawingChange`.
      onDrawingChange: (drawing) => {
        if (drawing) startLoop("brush");
        else stopLoop("brush");
      },
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

      // Left button on your own body draws on it — unless the round is over and
      // this body is being shown to everybody, which is not the moment to repaint
      // the camouflage that is the subject of the exhibit.
      if (!frozenRef.current && !locked.current && brushCursor.begin(e)) return;

      // Only the hunter takes the pointer lock — a chameleon keeps their cursor so
      // the brush and the palette are always to hand.
      if (role === "chameleon") return;
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
      else sendShoot(shot.position, shot.rotation, shot.origin);
    };

    const onPointerUp = () => {
      brushCursor.end();
      orbiting.current = false;
    };

    // The right-drag look would otherwise raise the browser menu.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // Wheel zooms the third-person camera. Painting fine detail needs to get
    // close, and chameleons want to pull back to check their hiding spot. It is a
    // third-person control, so it is the chameleon's — a hunter's camera sits
    // inside their head and there is nothing to pull back from.
    const onWheel = (e: WheelEvent) => {
      if (pausedRef.current || role === "hunter") return;
      e.preventDefault();
      zoom.current = THREE.MathUtils.clamp(
        zoom.current * (1 + e.deltaY * ZOOM_STEP),
        ZOOM_MIN,
        ZOOM_MAX,
      );
    };

    const onMouseMove = (e: MouseEvent) => {
      /** Nothing that needs a button held may survive the button coming up. */
      if (e.buttons === 0 && (orbiting.current || brushCursor.drawing)) {
        brushCursor.end();
        orbiting.current = false;
      }

      // While the menu is up the cursor belongs to the menu: moving it must not
      // turn the camera, and must not report a hover — a hover pops the palette
      // open, and opening the palette clears `paused`, so the pause menu used
      // to vanish the moment you moved the mouse towards it.
      if (pausedRef.current) return;

      // A stroke already in flight wins over everything else the mouse could
      // mean — including a right button pressed mid-drag. The exception is a
      // round ending under it: a drag begun a moment before the gong must not
      // keep repainting the body everybody has been asked to look at.
      if (brushCursor.drawing) {
        if (frozenRef.current) brushCursor.cancel();
        else brushCursor.move(e);
        return;
      }

      // A free cursor means the body can be painted, so keep the brush ring on
      // whatever it is over and tell the HUD, which pops the palette open.
      if (!frozenRef.current && !locked.current && !orbiting.current) {
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

    // Losing the tab drops every key, and anything mid-gesture with it: a drag
    // that was painting, an orbit, and the brush loop, none of which will ever
    // see their matching up event.
    const onBlur = () => {
      focused.current = false;
      jumpHeld.current = false;
      brushCursor.cancel();
      orbiting.current = false;
    };
    const onFocus = () => {
      focused.current = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onBlur();
      else onFocus();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerup", onPointerUp);
    // A pointer the browser takes away — a gesture interrupted, a touch
    // cancelled — never sends `pointerup`. Same handler, same reason.
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      cursor.current = null;
      stopLoop("brush");
      setLockTarget(null);
    };
  }, [gl, camera, scene, raycaster, role]);

  // Broadcast on a timer rather than from useFrame: a backgrounded tab stops
  // running frames entirely, which would look like the player vanishing.
  useEffect(() => {
    const send = setInterval(() => {
      const t = netState.current;
      sendState([t.x, t.y, t.z], t.yaw, t.pitch, t.pose, t.cling);
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
    const col = collider.current;
    // The collider is remounted by `key` when a pose changes its shape, so there
    // is a frame where it is not there yet. Nothing below can run without it.
    if (!rb || !col) return;
    const controller = characterController(world);

    // Re-collect the room's surfaces when the world changes — a map finishing
    // its load, or a different map taking over. Everything below raycasts
    // against this list, so a stale or empty one is a player who cannot stand
    // on anything. An integer compare on the frames where nothing changed.
    if (solidsRevision.current !== surfaceRevision()) {
      solidsRevision.current = surfaceRevision();
      const list: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.name === ROOM_SURFACE) list.push(o);
      });
      solids.current = list;
    }

    /** Do not fall through a world that has not arrived yet. */
    if (solids.current.length === 0) {
      vy.current = 0;
      return;
    }

    const p = rb.translation();
    bodyPos.set(p.x, p.y, p.z);

    /** A curled or seated figure gets a smaller collider (see poseExtents). */
    const half = poseExtents(pose, [hx, hy, hz])[1];
    if (half !== halfHeight.current) {
      bodyPos.y += half - halfHeight.current;
      halfHeight.current = half;
    }

    // Nothing should reach this now that penetration cannot eject anybody, but a
    // player under the floor can never recover on their own and sees nothing but
    // empty background. Kept as the cheapest insurance in the file.
    if (bodyPos.y < FLOOR_ESCAPE_Y) {
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rb.setNextKinematicTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] });
      vy.current = 0;
      return;
    }

    // `frozen` reads as "no keys" rather than as "paused": the mouse handlers
    // stay live, so a rooted player can still turn and look about.
    const keys: Readonly<Record<Control, boolean>> =
      paused || frozen || !focused.current ? NO_KEYS : getKeys();

    // Poses are a chameleon's whole game. A hunter hunts upright and never leaves
    // POSES[0], so the number keys simply are not theirs.
    if (role === "chameleon") {
      for (let i = 0; i < POSES.length; i++) {
        if (keys[poseControl(i)] && pose !== i) {
          setPose(i);
          break;
        }
      }
    }

    // Movement follows where you are looking, not where the figure faces.
    const y = yaw.current;

    if (role === "chameleon") {
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

    if (reclingGrace.current > 0) reclingGrace.current -= delta;
    const spacePressed = keys.jump && !jumpHeld.current;
    let releasing = false;

    if (role === "chameleon") {
      if (cling.current) {
        if (spacePressed) {
          releasing = true;
        } else {
          // Wrap around an edge into whatever we are climbing toward: a wall
          // into the ceiling, an inside corner, a ceiling back onto a wall.
          const wrapped = wrapCling(bodyPos, cling.current, alongSurface, [hx, half, hz], solids.current);
          cling.current =
            wrapped ?? holdsCling(bodyPos, cling.current, [hx, half, hz], solids.current);
        }
      } else if (reclingGrace.current <= 0) {
        // No grab key: walking squarely into a wall is what takes you onto it.
        cling.current = findCling(bodyPos, move, [hx, half, hz], solids.current);
      }
    } else {
      cling.current = null;
    }

    // Movement across the surface, and the axes it is measured in. Computed
    // before the release check so `alongSurface` is the direction we were
    // heading — which is what the wrap probe above reads on the next frame.
    if (cling.current && wallTangents(cling.current, wallUp, wallRight)) {
      alongSurface
        .copy(wallUp)
        .multiplyScalar(Number(keys.forward) - Number(keys.backward))
        .addScaledVector(wallRight, Number(keys.right) - Number(keys.left));
      if (alongSurface.lengthSq() > 0) alongSurface.normalize().multiplyScalar(CLIMB_SPEED);
    } else if (cling.current) {
      // A ceiling: no up to walk, so this is ordinary camera-relative movement
      // flattened into the surface, which for a flat roof changes nothing.
      alongSurface.copy(move).addScaledVector(cling.current, -move.dot(cling.current));
    } else {
      alongSurface.set(0, 0, 0);
    }

    /** A release is a push clear of the surface for one frame. */
    if (releasing) {
      const normal = cling.current!;
      cling.current = null;
      reclingGrace.current = RECLING_GRACE;
      vy.current = normal.y * RELEASE_PUSH;
      desired.copy(normal).multiplyScalar(RELEASE_PUSH * delta);
    }

    const clinging = cling.current !== null;

    const jumping =
      !clinging && !releasing && keys.jump && !jumpHeld.current && grounded.current;
    jumpHeld.current = keys.jump;

    // Footsteps are for walking. Sliding up a wall or hanging off the roof is
    // silent — which is most of the point of being up there.
    if (!clinging && grounded.current && stepper.current.update(p.x, p.y, p.z, delta)) {
      // Your own steps are not positional: you are the listener, and a panner at
      // zero distance behaves badly. Quieter than everyone else's, because your
      // own feet are the ones you least need to hear.
      playSound("step", { rate: jitteredStepRate(role), gain: 0.8 });
    } else if (clinging || !grounded.current) {
      stepper.current.reset();
    }

    /** Where the body would like to be by the end of the frame. */
    if (clinging) {
      const normal = cling.current!;
      vy.current = 0;
      desired
        .copy(alongSurface)
        .addScaledVector(normal, -STICK_SPEED)
        .multiplyScalar(delta);
    } else if (!releasing) {
      if (jumping) vy.current = JUMP_SPEED;
      else if (grounded.current && vy.current <= 0) vy.current = -GROUND_STICK;
      else vy.current -= GRAVITY * delta;
      desired.set(move.x * delta, vy.current * delta, move.z * delta);
    }

    // Ask rapier how much of that is actually possible, then go exactly there.
    controller.computeColliderMovement(col, desired);
    const allowed = controller.computedMovement();
    grounded.current = controller.computedGrounded();
    rb.setNextKinematicTranslation({
      x: bodyPos.x + allowed.x,
      y: bodyPos.y + allowed.y,
      z: bodyPos.z + allowed.z,
    });
    // Stop accumulating downward speed the moment the floor is under us, or a
    // long fall leaves `vy` at -40 and the first step off a kerb is a plummet.
    if (grounded.current && vy.current < 0) vy.current = 0;

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
    // Which, for a hunter, is their camera heading — so chameleons can read where
    // the gun hunting them is pointed.
    net.yaw = bodyYaw.current;
    net.pitch = role === "hunter" ? pitch.current : 0;
    net.pose = pose;
    // Sent so other clients can keep a climber's footsteps quiet — their stepper
    // only sees a position, and sliding along a wall looks like walking.
    net.cling = clinging;

    const cp = Math.cos(pitch.current);
    lookDir.set(-Math.sin(y) * cp, Math.sin(pitch.current), -Math.cos(y) * cp);

    if (firstPerson) {
      // Always eye height: a hunter cannot pose, so there is no rolled-over
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
        type="kinematicPosition"
        position={spawn}
        canSleep={false}
      >
        <CuboidCollider
          key={POSES[pose].shape ?? "stand"}
          ref={collider}
          args={poseExtents(pose, [hx, hy, hz])}
        />
        <group ref={visual}>
          {/* In first person the camera sits inside the head, so the hunter's
              own figure is hidden and the viewmodel stands in for it. */}
          {!firstPerson && <StickFigure scale={hy} pose={pose} skinId={SELF} />}
        </group>
      </RigidBody>
    </>
  );
}
