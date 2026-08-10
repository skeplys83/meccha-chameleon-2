"use client";

import * as THREE from "three";
import { BODY } from "@/game/players/body";
import type { Role } from "@/game/shared/protocol";

/**
 * Footsteps are **derived, never networked.**
 *
 * Every client already receives everyone's position at 20 Hz, so a step is a
 * function of how far a body has moved — no message, no bandwidth, and it cannot
 * drift out of sync with what you can see, because it *is* what you can see.
 */

/**
 * Stride length per unit of body half-height.
 *
 * Stride scales with the body, like pitch does: a hider is smaller, so they take
 * shorter, quicker steps than a seeker. At the movement speed of 6 that lands a
 * hider at roughly 3.2 footfalls a second and a seeker at 2.4 — a run and a
 * heavy jog, which is what the two look like on screen.
 *
 * Both roles move at the same speed, so this is the only thing separating their
 * cadence. Raise it and everyone plods; lower it and everyone scurries.
 */
const STRIDE_PER_HALF_HEIGHT = 1.9;

/**
 * Movement below this in a single frame is numerical noise, not walking.
 *
 * It is a *distance*, never a speed. Speed per frame is meaningless here: the
 * frame loop runs faster than either source of positions, so a stationary frame
 * is normal even at a dead run — see the note on `update`.
 */
const NOISE = 0.002;
/**
 * How long a body must actually be still before it counts as stopped. Anything
 * shorter is just a frame that landed between ticks.
 */
const IDLE_GRACE = 0.25;
/**
 * Further than this in a single frame is a teleport, not a stride — a respawn,
 * the under-the-floor catch in `players/Player.tsx`, or a remote whose patch
 * arrived after a stall. Also a distance: at the movement speed of 6, even a
 * 200 ms hitch covers only 1.2.
 */
const WARP_DISTANCE = 3;
/** ±3% so a run does not sound like one sample on a loop. */
const JITTER = 0.03;
/**
 * Hard floor on the gap between two footfalls, in seconds. Nothing in normal
 * play comes near it — it is here so that a teleport, a respawn or a physics
 * glitch cannot fire a burst of steps in consecutive frames.
 */
const MIN_STEP_GAP = 0.11;

/** How far this role travels between footfalls. */
export function strideFor(role: Role) {
  return STRIDE_PER_HALF_HEIGHT * BODY[role][1];
}

/**
 * Pitch scales inversely with body size: a hider is smaller, so their step is
 * higher and lighter. That is a real gameplay signal, not decoration — hearing
 * a step you cannot see and knowing whether it is prey or the hunter is most of
 * what audio contributes to hide-and-seek.
 *
 * Derived from `BODY` rather than hard-coded, so re-proportioning a role
 * re-pitches it: seeker 1.3 → 1.0, hider 1.0 → 1.3 (about four semitones up).
 */
export function stepRate(role: Role) {
  return BODY.seeker[1] / BODY[role][1];
}

/** `stepRate` with a little per-step variation. */
export function jitteredStepRate(role: Role) {
  return stepRate(role) * (1 - JITTER + Math.random() * JITTER * 2);
}

/**
 * Turns a stream of positions into footfalls.
 *
 * **Positions arrive more slowly than frames, and that is the whole difficulty.**
 * `<Physics>` steps at a fixed 1/60, so `rb.translation()` is unchanged on any
 * frame that fell between steps — which is most of them above 60 Hz. Remote
 * players are worse: their target only moves on a 20 Hz network patch, so at
 * 60 fps two frames in three see nothing happen. A stationary frame is therefore
 * completely normal at a dead run, and anything that treats one as "stopped"
 * wipes the accumulated distance before it can ever reach a stride. That is
 * exactly what an earlier version did, using speed-per-frame, and it is why no
 * footstep ever played.
 *
 * So: accumulate *distance*, and only give up on a stride after the body has
 * genuinely been still for `IDLE_GRACE`. Nothing here divides by `delta`.
 *
 * Only horizontal travel counts. Falling and jumping move you a long way in Y,
 * and a body should not take a step in mid-air — that is also why remote figures
 * cannot use the ground ray the local player has: nobody else's `grounded` is on
 * the wire. Ignoring Y is the cheap approximation, and it is wrong only in that a
 * long jump still ticks over the stride it covers horizontally.
 */
export class Stepper {
  private readonly last = new THREE.Vector3();
  private travelled = 0;
  private since = MIN_STEP_GAP;
  private idle = 0;
  private primed = false;

  /**
   * How far this body travels between footfalls, from `strideFor`.
   *
   * Written out longhand rather than as a `constructor(private stride)`
   * parameter property: those are one of the few things Node's type stripping
   * refuses outright, and this module is meant to be importable straight into
   * Node for testing. See the root CLAUDE.md.
   */
  private readonly stride: number;

  constructor(stride: number) {
    this.stride = stride;
  }

  /** Feed the current position; returns true on the frames a step lands. */
  update(x: number, y: number, z: number, delta: number) {
    this.since += delta;

    if (!this.primed) {
      this.last.set(x, y, z);
      this.primed = true;
      return false;
    }

    const dx = x - this.last.x;
    const dz = z - this.last.z;
    this.last.set(x, y, z);

    const moved = Math.hypot(dx, dz);

    // Crossing the arena in one frame is not a stride. Without this a respawn
    // lands a footfall on arrival.
    if (moved > WARP_DISTANCE) {
      this.travelled = 0;
      this.idle = 0;
      return false;
    }

    if (moved < NOISE) {
      // Almost certainly a frame that landed between a physics step or a network
      // patch. Only a sustained pause means the body has actually stopped.
      this.idle += delta;
      if (this.idle > IDLE_GRACE) this.travelled = 0;
      return false;
    }
    this.idle = 0;

    this.travelled += moved;
    if (this.travelled < this.stride) return false;
    // Hold the step rather than dropping it if the floor has not passed yet.
    if (this.since < MIN_STEP_GAP) return false;

    // Carry the remainder rather than zeroing it, so cadence stays even instead
    // of drifting with however the positions happened to arrive.
    this.travelled -= this.stride;
    this.since = 0;
    return true;
  }

  reset() {
    this.travelled = 0;
    this.since = MIN_STEP_GAP;
    this.idle = 0;
    this.primed = false;
  }
}
