"use client";

import * as THREE from "three";
import { SOUNDS, SOUND_NAMES, type SoundName } from "./catalogue";

/**
 * The Web Audio plumbing: one context, one master gain, a decoded buffer per
 * sound, and fire-and-forget playback.
 *
 * Deliberately not `THREE.PositionalAudio`. That is an `Object3D` you park in the
 * scene graph, which suits a looping engine hum but not a shotgun — every shot
 * would mean mounting and unmounting a node. A one-shot here is three plain Web
 * Audio nodes that disconnect themselves when the sound ends.
 */

/** How far a positional sound carries at full volume. Tuned to the 40×40 arena —
 *  the Web Audio default of 1 makes everything inaudible two steps away. */
const REF_DISTANCE = 6;
/** Past this, a sound is silent. Just inside the arena's diagonal. */
const MAX_DISTANCE = 45;
const ROLLOFF = 1.1;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Sounds that turned out to be unplayable, so the warning is logged once. */
const broken = new Set<SoundName>();

const forward = new THREE.Vector3();
const up = new THREE.Vector3();

function ensureContext() {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // Legal to create before any gesture — it simply starts suspended and makes no
  // sound until `unlockAudio` resumes it. Creating it early is what lets the
  // buffers decode before the first shot rather than during it.
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return ctx;
}

/**
 * Fetch and decode every sound. Safe to call repeatedly — the work happens once.
 * Called on mount, well before anything wants to play.
 */
export function preloadSounds() {
  const context = ensureContext();
  if (!context || loading) return loading ?? Promise.resolve();

  loading = Promise.all(
    SOUND_NAMES.map(async (name) => {
      const spec = SOUNDS[name];
      try {
        const res = await fetch(spec.url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const buffer = await context.decodeAudioData(await res.arrayBuffer());

        // A positional sound has to be mono or the panner has nothing to place.
        // Worth shouting about: the symptom is a sound that plays fine but never
        // seems to come from anywhere, which is easy to mistake for "3D audio is
        // just subtle".
        if (spec.positional && buffer.numberOfChannels !== 1) {
          console.warn(
            `sound: "${name}" is positional but has ${buffer.numberOfChannels} channels. ` +
              `It will not be spatialised. Re-export it as mono ` +
              `(ffmpeg -i ${spec.url.split("/").pop()} -ac 1 out.wav).`,
          );
        }
        buffers.set(name, buffer);
      } catch (e) {
        broken.add(name);
        console.warn(`sound: could not load "${name}" from ${spec.url}`, e);
      }
    }),
  ).then(() => undefined);

  return loading;
}

/**
 * Hand the audio context the user gesture it has been waiting for.
 *
 * **Must be called from inside a real click handler.** Browsers start every
 * context suspended and only `resume()` succeeds from a gesture; call it from an
 * effect and the promise rejects silently, leaving the whole game mute. The
 * gesture this game uses is picking a role in `RoleMenu`.
 */
export function unlockAudio() {
  const context = ensureContext();
  if (!context) return;
  preloadSounds();
  if (context.state === "suspended") void context.resume();
}

/** Pause silences everything rather than letting sounds run on behind the menu. */
export function setAudioSuspended(suspended: boolean) {
  if (!ctx) return;
  if (suspended && ctx.state === "running") void ctx.suspend();
  if (!suspended && ctx.state === "suspended") void ctx.resume();
}

/**
 * Point the listener at wherever the camera is now.
 *
 * Read straight off `camera.position` / `camera.quaternion` rather than
 * `matrixWorld` or `getWorldDirection`: `players/Player.tsx` drives the camera
 * imperatively from its own `useFrame`, and matrices are only refreshed at render
 * time — so a world-matrix read here would be one frame stale, and which frame
 * would depend on `useFrame` ordering. The local transform is always current, and
 * the camera has no parent, so local *is* world.
 */
export function updateListener(camera: THREE.Camera) {
  if (!ctx) return;
  const l = ctx.listener;
  const p = camera.position;
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);

  // The AudioParam form is current; the setters are deprecated but are all older
  // Safari understands.
  if (l.positionX) {
    l.positionX.value = p.x;
    l.positionY.value = p.y;
    l.positionZ.value = p.z;
    l.forwardX.value = forward.x;
    l.forwardY.value = forward.y;
    l.forwardZ.value = forward.z;
    l.upX.value = up.x;
    l.upY.value = up.y;
    l.upZ.value = up.z;
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

export type PlayOptions = {
  /** World position. Omit for a sound with no location — your own footsteps, the
   *  whistle, anything already at the listener. */
  position?: readonly [number, number, number];
  /** Playback rate, which is also the pitch. 1 is the file as recorded. */
  rate?: number;
  /** Multiplied with the catalogue gain. */
  gain?: number;
};

/**
 * Play one shot of a sound. Never throws and never blocks: if the buffer has not
 * finished decoding, or the file was missing, the call is simply dropped. A
 * missing sound must not be able to break a frame.
 */
export function playSound(name: SoundName, options: PlayOptions = {}) {
  const context = ctx;
  const out = master;
  const buffer = buffers.get(name);
  if (!context || !out || !buffer || context.state !== "running") return;

  const spec = SOUNDS[name];
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.rate ?? 1;

  const gain = context.createGain();
  gain.gain.value = spec.gain * (options.gain ?? 1);

  let head: AudioNode = gain;
  let panner: PannerNode | null = null;
  if (options.position) {
    panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = REF_DISTANCE;
    panner.maxDistance = MAX_DISTANCE;
    panner.rolloffFactor = ROLLOFF;
    const [x, y, z] = options.position;
    // Set once: these sounds are all about a second long, so nothing moves far
    // enough during one for tracking to be worth a per-frame update.
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }
    gain.connect(panner);
    head = panner;
  }

  head.connect(out);
  source.connect(gain);

  // Buffer sources are single-use, so everything here is torn down on end.
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    panner?.disconnect();
  };
  source.start();
}

/** Whether anything is actually going to come out. Used by the HUD hint only. */
export function audioReady() {
  return !!ctx && ctx.state === "running" && buffers.size > 0;
}

/** Test seam: which sounds failed to load. */
export function brokenSounds() {
  return [...broken];
}
