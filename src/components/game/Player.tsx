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
import { BODY, type Role } from "./types";
import { ROOM_SURFACE } from "./Room";
import { StickFigure } from "./StickFigure";
import { sendShoot, sendState } from "@/lib/net";
import { setLockTarget } from "@/lib/pointerLock";

const SPEED = 6;
const JUMP_IMPULSE = 11;
const TURN_SPEED = 2.6; // rad/s for Q/E
const CAMERA_DISTANCE = 7;
const CAMERA_MIN_DISTANCE = 1.4;
const CAMERA_SKIN = 0.35; // keep the lens off the surface it would touch
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_MIN = -1.0;
const PITCH_MAX = 0.9;

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const bodyPos = new THREE.Vector3();
const lookDir = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const quat = new THREE.Quaternion();
const screenCenter = new THREE.Vector2(0, 0);
const worldNormal = new THREE.Vector3();
const markOrient = new THREE.Object3D();
const toCamera = new THREE.Vector3();
const cameraRay = new THREE.Raycaster();

export function Player({ role }: { role: Role }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<THREE.Group>(null);
  const yaw = useRef(0); // camera yaw, from the mouse
  const pitch = useRef(-0.2); // positive looks up
  const bodyYaw = useRef(0); // figure facing, from Q/E
  const locked = useRef(false);
  const netState = useRef({ x: 0, y: 4, z: 0, yaw: 0, pitch: 0, flat: false });
  const solids = useRef<THREE.Object3D[]>([]);
  const [flat, setFlat] = useState(false);
  const [, getKeys] = useKeyboardControls<Control>();
  const { gl, camera, scene, raycaster } = useThree();

  const [hx, hy, hz] = BODY[role];
  const firstPerson = role === "seeker";

  // The room is static, so its meshes are collected once and reused for both
  // the shot raycast and keeping the camera out of walls.
  useEffect(() => {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.name === ROOM_SURFACE) list.push(o);
    });
    solids.current = list;
  }, [scene]);

  // Mouse look + shooting both depend on pointer lock, so they live together.
  useEffect(() => {
    const canvas = gl.domElement;
    setLockTarget(canvas);

    const onPointerDown = (e: MouseEvent) => {
      if (!locked.current) {
        canvas.requestPointerLock();
        return;
      }
      if (e.button !== 0 || role !== "seeker") return;

      raycaster.setFromCamera(screenCenter, camera);
      const hit = raycaster.intersectObjects(solids.current, false)[0];
      if (!hit || !hit.face) return;

      // Room surfaces are axis-aligned and unrotated, so the face normal only
      // needs the object's world rotation applied to be a world-space normal.
      worldNormal
        .copy(hit.face.normal)
        .applyQuaternion(hit.object.getWorldQuaternion(quat))
        .normalize();

      markOrient.position.copy(hit.point).addScaledVector(worldNormal, 0.02);
      markOrient.lookAt(markOrient.position.clone().add(worldNormal));

      // The server relays the mark back to everyone, this client included, so
      // every player sees the same patch appear.
      sendShoot(
        [markOrient.position.x, markOrient.position.y, markOrient.position.z],
        [markOrient.rotation.x, markOrient.rotation.y, markOrient.rotation.z],
      );
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
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
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      setLockTarget(null);
    };
  }, [gl, camera, scene, raycaster, role]);

  // Broadcast on a timer rather than from useFrame: a backgrounded tab stops
  // running frames entirely, which would look like the player vanishing.
  useEffect(() => {
    const send = setInterval(() => {
      const t = netState.current;
      sendState([t.x, t.y, t.z], t.yaw, t.pitch, t.flat);
    }, 50);
    return () => clearInterval(send);
  }, []);

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb) return;

    const keys = getKeys();

    // Seekers are locked upright.
    if (role === "hider") {
      if (keys.formUpright && flat) setFlat(false);
      else if (keys.formFlat && !flat) setFlat(true);
    }

    bodyYaw.current +=
      (Number(keys.turnLeft) - Number(keys.turnRight)) * TURN_SPEED * delta;

    // Movement follows where you are looking, not where the figure faces.
    const y = yaw.current;
    forward.set(-Math.sin(y), 0, -Math.cos(y));
    right.set(Math.cos(y), 0, -Math.sin(y));

    move
      .set(0, 0, 0)
      .addScaledVector(forward, Number(keys.forward) - Number(keys.backward))
      .addScaledVector(right, Number(keys.right) - Number(keys.left));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED);

    const velocity = rb.linvel();
    rb.setLinvel({ x: move.x, y: velocity.y, z: move.z }, true);

    // Naive grounded check — good enough until there is real level geometry.
    if (keys.jump && Math.abs(velocity.y) < 0.05) {
      rb.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true);
    }

    // The body's rotation is frozen, so the figure is turned by rotating the
    // visual group and the collider together. Lying flat is a roll onto the
    // side (local Z), applied inside the facing yaw.
    euler.set(0, bodyYaw.current, flat ? Math.PI / 2 : 0);
    quat.setFromEuler(euler);
    visual.current?.quaternion.copy(quat);
    collider.current?.setRotationWrtParent(quat);

    const p = rb.translation();
    bodyPos.set(p.x, p.y, p.z);

    const net = netState.current;
    net.x = p.x;
    net.y = p.y;
    net.z = p.z;
    // A seeker's figure faces where they aim, so hiders can read the heading
    // of the camera that is hunting them. Hiders turn with Q/E instead.
    net.yaw = firstPerson ? y : bodyYaw.current;
    net.pitch = firstPerson ? pitch.current : 0;
    net.flat = flat;

    const cp = Math.cos(pitch.current);
    lookDir.set(-Math.sin(y) * cp, Math.sin(pitch.current), -Math.cos(y) * cp);

    if (firstPerson) {
      state.camera.position.set(bodyPos.x, bodyPos.y + hy * 0.72, bodyPos.z);
      euler.set(pitch.current, y, 0);
      state.camera.quaternion.setFromEuler(euler);
    } else {
      lookAt.copy(bodyPos).setY(bodyPos.y + 0.6);

      // Pull the camera in if a wall or obstacle sits between it and the
      // player, so it never ends up outside the arena.
      toCamera.copy(lookDir).negate().normalize();
      let distance = CAMERA_DISTANCE;
      if (solids.current.length) {
        cameraRay.set(lookAt, toCamera);
        cameraRay.far = CAMERA_DISTANCE;
        const blocked = cameraRay.intersectObjects(solids.current, false)[0];
        if (blocked) {
          distance = Math.max(CAMERA_MIN_DISTANCE, blocked.distance - CAMERA_SKIN);
        }
      }

      camDesired.copy(lookAt).addScaledVector(toCamera, distance);
      state.camera.position.lerp(camDesired, 1 - Math.pow(0.0001, delta));
      state.camera.lookAt(lookAt);
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      position={[0, 4, 0]}
      enabledRotations={[false, false, false]}
      canSleep={false}
    >
      <CuboidCollider ref={collider} args={[hx, hy, hz]} />
      <group ref={visual}>
        {/* In first person the camera sits inside the head, so the seeker's own
            figure is hidden and the viewmodel stands in for it. */}
        {!firstPerson && <StickFigure scale={hy} />}
      </group>
    </RigidBody>
  );
}
