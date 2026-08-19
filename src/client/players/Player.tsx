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
import { followThirdPerson, resetFollow } from "./camera";
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
import { newMotion } from "./look";
import { buriedFraction } from "./buried";
import { usePointerControls } from "./usePointerControls";
import { useEyedropperReadback } from "./useEyedropperReadback";
import { useStateBroadcast } from "./useStateBroadcast";
import type { Role } from "@/shared/protocol";
import { POSES, poseCentre, poseExtents } from "@/client/figure/poses";
import { findBody } from "@/client/figure/samples";
import { DEV, reportPlayer } from "@/client/app/dev";
import { ROOM_SURFACE } from "@/client/world/Room";
import { surfaceRevision } from "@/client/world/surface";
import { StickFigure } from "@/client/figure/StickFigure";
import { SELF } from "@/client/paint/skin";
import { type Brush } from "@/client/paint/brush";
import { playSound } from "@/client/sound/engine";
import { Stepper, jitteredStepRate, strideFor } from "@/client/sound/footsteps";

const SPEED = 6;
/** A velocity, not an impulse. */
const JUMP_SPEED = 11;
/** Downward speed held while grounded, so the controller keeps finding the floor. */
const GROUND_STICK = 1;
const TURN_SPEED = 2.6; // rad/s for Q/E

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
/** The pose's collider offset, turned into the body's yaw. */
const boxCentre = new THREE.Vector3();

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
  onBrush,
  picking = false,
  onPicked,
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
  /** Right-dragging the body resizes the brush, so this owns the change. */
  onBrush: (b: Brush) => void;
  /** The eyedropper is armed: the next left click takes a colour off the screen. */
  picking?: boolean;
  onPicked?: (hex: string) => void;
  /** Fires when the cursor moves on or off your own body. */
  onHoverBody: (hovering: boolean) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  const [hx, hy, hz] = BODY[role];

  /** The body's own simulation state: one mutable object rather than six refs,
   *  none of it on the wire. `look` is the same idea and is owned by the
   *  pointer hook, which is what writes most of it — see `look.ts`. */
  const motion = useRef(newMotion(-hy));

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

  /** Your own footsteps. Remote figures get one of these each in SoundStage;
   *  yours lives here because this is the only place that knows you are on the
   *  ground — nobody else's `grounded` is on the wire. */
  const stepper = useRef(new Stepper(strideFor(role)));

  /** Developer mode only: the last buried fraction, and when it was taken.
   *  Sampled ten times a second — nobody sinks into a wall inside 16 ms, and
   *  the readout is only redrawn that often anyway. */
  const buried = useRef(0);
  const buriedAt = useRef(0);

  const [, getKeys] = useKeyboardControls<Control>();
  const { scene } = useThree();
  // The world handle only. Nothing is *called* on it here — the controller is
  // fetched inside the frame loop, because that is the only place rapier is
  // safe to touch. See `controller.ts` and trap 5.
  const { world } = useRapier();

  // In paint mode even a hunter steps out to third person to see their body.
  const firstPerson = role === "hunter" && !painting;

  // This component is keyed on the room, so mounting means a new map. The
  // follow camera's eased distance belongs to the old one and has to be
  // dropped, or the first frame here flies in from wherever it was standing.
  useEffect(() => resetFollow(), []);

  const look = usePointerControls({
    role,
    brush,
    onBrush,
    painting,
    paused,
    frozen,
    picking,
    onPicked,
    onHoverBody,
    visual,
    ring,
    solids,
  });
  useStateBroadcast(netState);
  useEyedropperReadback();

  useFrame((state, delta) => {
    const rb = body.current;
    const col = collider.current;
    // The collider is remounted by `key` when a pose changes its shape, so there
    // is a frame where it is not there yet. Nothing below can run without it.
    if (!rb || !col) return;
    const controller = characterController(world);
    const m = motion.current;
    const view = look.current;

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
      m.vy = 0;
      return;
    }

    const p = rb.translation();
    bodyPos.set(p.x, p.y, p.z);

    /** Each pose carries its own box (see poseExtents), stated in world axes —
     *  so `[1]` is its vertical half-extent whatever the pose is doing, and the
     *  whole triple is what cling has to probe with. */
    const poseHalf = poseExtents(pose, [hx, hy, hz]);
    const half = poseHalf[1];
    const centre = poseCentre(pose);
    const foot = centre[1] - half;
    if (foot !== m.footOffset) {
      bodyPos.y += m.footOffset - foot;
      m.footOffset = foot;
    }

    // Nothing should reach this now that penetration cannot eject anybody, but a
    // player under the floor can never recover on their own and sees nothing but
    // empty background. Kept as the cheapest insurance in the file.
    if (bodyPos.y < FLOOR_ESCAPE_Y) {
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rb.setNextKinematicTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] });
      m.vy = 0;
      return;
    }

    // `frozen` reads as "no keys" rather than as "paused": the mouse handlers
    // stay live, so a rooted player can still turn and look about.
    const keys: Readonly<Record<Control, boolean>> =
      paused || frozen || !view.focused ? NO_KEYS : getKeys();
    // Losing the tab drops every key, this one included: without it, coming back
    // with space still nominally "held" swallows the first jump.
    if (!view.focused) m.jumpHeld = false;

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
    const y = view.yaw;

    if (role === "chameleon") {
      m.bodyYaw += (Number(keys.turnLeft) - Number(keys.turnRight)) * TURN_SPEED * delta;
    } else if (firstPerson) {
      m.bodyYaw = y;
    }
    forward.set(-Math.sin(y), 0, -Math.cos(y));
    right.set(Math.cos(y), 0, -Math.sin(y));

    move
      .set(0, 0, 0)
      .addScaledVector(forward, Number(keys.forward) - Number(keys.backward))
      .addScaledVector(right, Number(keys.right) - Number(keys.left));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED);

    if (m.reclingGrace > 0) m.reclingGrace -= delta;
    const spacePressed = keys.jump && !m.jumpHeld;
    let releasing = false;

    if (role === "chameleon") {
      if (m.cling) {
        if (spacePressed) {
          releasing = true;
        } else {
          // Wrap around an edge into whatever we are climbing toward: a wall
          // into the ceiling, an inside corner, a ceiling back onto a wall.
          const wrapped = wrapCling(bodyPos, m.cling, alongSurface, poseHalf, solids.current);
          m.cling = wrapped ?? holdsCling(bodyPos, m.cling, poseHalf, solids.current);
        }
      } else if (m.reclingGrace <= 0) {
        // No grab key: walking squarely into a wall is what takes you onto it.
        m.cling = findCling(bodyPos, move, poseHalf, solids.current);
      }
    } else {
      m.cling = null;
    }

    // Movement across the surface, and the axes it is measured in. Computed
    // before the release check so `alongSurface` is the direction we were
    // heading — which is what the wrap probe above reads on the next frame.
    if (m.cling && wallTangents(m.cling, wallUp, wallRight)) {
      alongSurface
        .copy(wallUp)
        .multiplyScalar(Number(keys.forward) - Number(keys.backward))
        .addScaledVector(wallRight, Number(keys.right) - Number(keys.left));
      if (alongSurface.lengthSq() > 0) alongSurface.normalize().multiplyScalar(CLIMB_SPEED);
    } else if (m.cling) {
      // A ceiling: no up to walk, so this is ordinary camera-relative movement
      // flattened into the surface, which for a flat roof changes nothing.
      alongSurface.copy(move).addScaledVector(m.cling, -move.dot(m.cling));
    } else {
      alongSurface.set(0, 0, 0);
    }

    /** A release is a push clear of the surface for one frame. */
    if (releasing) {
      const normal = m.cling!;
      m.cling = null;
      m.reclingGrace = RECLING_GRACE;
      m.vy = normal.y * RELEASE_PUSH;
      desired.copy(normal).multiplyScalar(RELEASE_PUSH * delta);
    }

    const clinging = m.cling !== null;

    const jumping = !clinging && !releasing && keys.jump && !m.jumpHeld && m.grounded;
    m.jumpHeld = keys.jump;

    // Footsteps are for walking. Sliding up a wall or hanging off the roof is
    // silent — which is most of the point of being up there.
    if (!clinging && m.grounded && stepper.current.update(p.x, p.y, p.z, delta)) {
      // Your own steps are not positional: you are the listener, and a panner at
      // zero distance behaves badly. Quieter than everyone else's, because your
      // own feet are the ones you least need to hear.
      playSound("step", { rate: jitteredStepRate(role), gain: 0.8 });
    } else if (clinging || !m.grounded) {
      stepper.current.reset();
    }

    /** Where the body would like to be by the end of the frame. */
    if (clinging) {
      const normal = m.cling!;
      m.vy = 0;
      desired.copy(alongSurface).addScaledVector(normal, -STICK_SPEED).multiplyScalar(delta);
    } else if (!releasing) {
      if (jumping) m.vy = JUMP_SPEED;
      else if (m.grounded && m.vy <= 0) m.vy = -GROUND_STICK;
      else m.vy -= GRAVITY * delta;
      desired.set(move.x * delta, m.vy * delta, move.z * delta);
    }

    // Ask rapier how much of that is actually possible, then go exactly there.
    controller.computeColliderMovement(col, desired);
    const allowed = controller.computedMovement();
    m.grounded = controller.computedGrounded();
    rb.setNextKinematicTranslation({
      x: bodyPos.x + allowed.x,
      y: bodyPos.y + allowed.y,
      z: bodyPos.z + allowed.z,
    });
    // Catch `bodyPos` up to where the body is *going*, not where it was when the
    // frame started. The camera below reads it, and a frame of lag against a
    // world that has already moved is seen as the view lagging the body.
    bodyPos.set(bodyPos.x + allowed.x, bodyPos.y + allowed.y, bodyPos.z + allowed.z);
    // Stop accumulating downward speed the moment the floor is under us, or a
    // long fall leaves `vy` at -40 and the first step off a kerb is a plummet.
    if (m.grounded && m.vy < 0) m.vy = 0;

    // The body's rotation is frozen, so the figure is turned by rotating the
    // visual group and the collider together. Only yaw: a lying pose's roll is
    // animated inside StickFigure, and its box is already stated lying down.
    euler.set(0, m.bodyYaw, 0);
    quat.setFromEuler(euler);
    visual.current?.quaternion.setFromEuler(euler);
    collider.current?.setRotationWrtParent(quat);
    // Rapier holds the collider's offset and its rotation as siblings rather
    // than composing one through the other, so an offset left alone points at
    // world +Z however the body is facing. Turn it ourselves.
    collider.current?.setTranslationWrtParent(
      boxCentre.set(centre[0], centre[1], centre[2]).applyQuaternion(quat),
    );

    const net = netState.current;
    net.x = p.x;
    net.y = p.y;
    net.z = p.z;
    // Which, for a hunter, is their camera heading — so chameleons can read where
    // the gun hunting them is pointed.
    net.yaw = m.bodyYaw;
    net.pitch = role === "hunter" ? view.pitch : 0;
    net.pose = pose;
    // Sent so other clients can keep a climber's footsteps quiet — their stepper
    // only sees a position, and sliding along a wall looks like walking.
    net.cling = clinging;

    const cp = Math.cos(view.pitch);
    lookDir.set(-Math.sin(y) * cp, Math.sin(view.pitch), -Math.cos(y) * cp);

    // Developer mode only, and compiled out of the build entirely — see
    // `app/dev.ts`. Reported from here because this is the only place that
    // knows any of it: none of `grounded`, `vy` or `cling` is on the wire.
    if (DEV) {
      const now = state.clock.elapsedTime;
      if (now - buriedAt.current > 0.1) {
        buriedAt.current = now;
        const mesh = findBody(visual.current);
        // Skinning reads the bones' `matrixWorld`, and three only refreshes
        // those at render — a whole frame after this loop moved the body. Ten
        // times a second over a figure-sized subtree, doing it here is free.
        visual.current?.updateWorldMatrix(true, true);
        buried.current = mesh ? buriedFraction(world, mesh, rb) : 0;
      }
      reportPlayer({
        role,
        x: bodyPos.x,
        y: bodyPos.y,
        z: bodyPos.z,
        yaw: y,
        pitch: view.pitch,
        bodyYaw: m.bodyYaw,
        vy: m.vy,
        grounded: m.grounded,
        clinging,
        zoom: view.zoom,
        firstPerson,
        pose,
        half: poseExtents(pose, [hx, hy, hz]),
        buried: buried.current,
        surfaces: solids.current.length,
      });
    }

    if (firstPerson) {
      // Always eye height: a hunter cannot pose, so there is no rolled-over
      // body to drop the camera into.
      state.camera.position.set(bodyPos.x, bodyPos.y + hy * 0.72, bodyPos.z);
      euler.set(view.pitch, y, 0);
      state.camera.quaternion.setFromEuler(euler);
    } else {
      followThirdPerson(state.camera, bodyPos, lookDir, view.zoom, solids.current, delta);
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
          // `args` is read once, at creation, so a pose with a different box
          // needs a new collider — but only when the numbers actually differ,
          // or standing still and pressing 1 then 3 would rebuild it for nothing.
          key={poseExtents(pose, [hx, hy, hz]).join()}
          ref={collider}
          args={poseExtents(pose, [hx, hy, hz])}
          // Only until the first frame loop turns it into the body's yaw.
          position={[...poseCentre(pose)]}
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
