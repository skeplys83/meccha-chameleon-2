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

/** How far a body travels between footfalls. */
const STRIDE = 1.7;
/** A body that has been still resets rather than banking distance. */
const IDLE_SPEED = 0.4;
/** ±3% so a run does not sound like one sample on a loop. */
const JITTER = 0.03;

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
 * Only horizontal travel counts. Falling and jumping move you a long way in Y,
 * and a body should not take a step in mid-air — that is also why remote figures
 * cannot use the ground ray the local player has: nobody else's `grounded` is on
 * the wire. Ignoring Y is the cheap approximation, and it is wrong only in that a
 * long jump still ticks over the stride it covers horizontally.
 */
export class Stepper {
  private readonly last = new THREE.Vector3();
  private travelled = 0;
  private primed = false;

  /** Feed the current position; returns true on the frames a step lands. */
  update(x: number, y: number, z: number, delta: number) {
    if (!this.primed) {
      this.last.set(x, y, z);
      this.primed = true;
      return false;
    }

    const dx = x - this.last.x;
    const dz = z - this.last.z;
    this.last.set(x, y, z);

    const moved = Math.hypot(dx, dz);
    // Standing still (or being teleported to spawn) should not bank distance
    // toward a step that fires the instant you start walking again.
    if (delta > 0 && moved / delta < IDLE_SPEED) {
      this.travelled = 0;
      return false;
    }

    this.travelled += moved;
    if (this.travelled < STRIDE) return false;
    this.travelled -= STRIDE;
    return true;
  }

  reset() {
    this.travelled = 0;
    this.primed = false;
  }
}
