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

/**
 * How far a positional sound carries before it starts to fade.
 *
 * Inside this radius there is *no* attenuation at all, so it doubles as "how big
 * the room sounds". At 6 it was a quarter of the arena's width at full volume,
 * which is why distance barely read; 3.5 puts the fade inside normal fighting
 * range. The Web Audio default of 1 is the other extreme — everything inaudible
 * two steps away.
 *
 * Resulting curve, inverse model: 1.0 at 3.5 units, −7 dB at 7, −13 dB at 14,
 * −23 dB across the arena.
 */
const REF_DISTANCE = 3.5;
/** Clamps the distance used in the falloff. Just past the arena's diagonal. */
const MAX_DISTANCE = 60;
/** How sharply it falls once past `REF_DISTANCE`. Higher is a smaller-sounding room. */
const ROLLOFF = 1.25;
/**
 * Ramp on either end of a loop. Starting or stopping a buffer at full amplitude
 * puts a step in the waveform, which is a click — and a brush you can click on
 * and off is worse than no brush at all.
 */
const LOOP_FADE = 0.05;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
/** Looping sounds currently running, at most one per name. */
const loops = new Map<SoundName, { source: AudioBufferSourceNode; gain: GainNode }>();
let loading: Promise<void> | null = null;
let unlockBound = false;
let warnedSuspended = false;
/** Suspended by the pause menu rather than by never having been unlocked. */
let pausedByGame = false;

/**
 * Anything the browser counts as a user gesture. `keydown` matters most: you
 * cannot walk without pressing one, so footsteps can never be the first thing
 * that finds the context still locked.
 */
const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Keep trying to unlock on any gesture until one works, then stop listening.
 *
 * `Game.tsx` already unlocks on the role click, and that is the intended path —
 * but it is a single point of failure for the entire game's audio, and when it
 * fails it fails *silently*, which is exactly what happened here. These
 * listeners are the safety net: they live beside the context they unlock, so
 * they cannot go looking at the wrong one.
 */
function installUnlockListeners() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;

  const stop = () => {
    for (const type of GESTURES) window.removeEventListener(type, attempt, true);
  };
  const attempt = () => {
    if (!ctx) return;
    if (ctx.state === "running") {
      stop();
      return;
    }
    void ctx.resume().then(() => {
      if (ctx?.state === "running") stop();
    });
  };

  for (const type of GESTURES) {
    window.addEventListener(type, attempt, { capture: true, passive: true });
  }
}

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
  installUnlockListeners();
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
 * gesture this game uses is Create or Join in `StartMenu`.
 */
export function unlockAudio() {
  const context = ensureContext();
  if (!context) return;
  preloadSounds();
  if (context.state === "suspended") void context.resume();
}

/** Pause silences everything rather than letting sounds run on behind the menu. */
export function setAudioSuspended(suspended: boolean) {
  // Recorded even without a context, so a sound arriving while paused is never
  // mistaken for the "we were never unlocked" fault the warning below is for.
  pausedByGame = suspended;
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
  if (!context || !out || !buffer) return;

  // Still locked. Ask again — a sound being requested at all means the player is
  // doing something — drop this one, and say so once, because a silent game with
  // a silent cause is the worst thing this module can do.
  if (context.state !== "running") {
    const was = context.state;
    void context.resume();
    if (!warnedSuspended && !pausedByGame) {
      warnedSuspended = true;
      console.warn(
        `sound: "${name}" was dropped because the AudioContext was "${was}". ` +
          `It unlocks on the first click or keypress; if you see this repeatedly, ` +
          `unlockAudio() is not reaching the context that playSound() uses.`,
      );
    }
    return;
  }

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

/**
 * Start a sound looping, or do nothing if it already is.
 *
 * Loops are keyed by name, so `startLoop` is idempotent and callers can fire it
 * on every frame of a drag without checking. `stopLoop` is the only way one
 * ends.
 *
 * Unlike `playSound` this does *not* bail when the context is suspended: it
 * starts anyway and asks for a resume. A suspended context has a frozen clock,
 * so the sound and its fade simply begin when the context wakes.
 */
export function startLoop(
  name: SoundName,
  options: { gain?: number; rate?: number; once?: boolean } = {},
) {
  const context = ctx;
  const out = master;
  const buffer = buffers.get(name);
  if (!context || !out || !buffer || loops.has(name)) return;
  if (context.state !== "running") void context.resume();

  const source = context.createBufferSource();
  source.buffer = buffer;
  /**
   * `once` plays a sound through a single time but **keeps the handle**, which
   * is the whole reason it lives here rather than in `playSound`.
   *
   * A `playSound` one-shot cannot be stopped: nothing holds a reference to it.
   * That is right for a gunshot and wrong for seventy-six seconds of music,
   * which would otherwise carry on through the reveal and into the lobby when a
   * round ends early. Registered in `loops`, it is reached by `stopAllLoops`
   * along with everything else scoped to a room.
   */
  source.loop = options.once !== true;
  source.playbackRate.value = options.rate ?? 1;

  const gain = context.createGain();
  const target = SOUNDS[name].gain * (options.gain ?? 1);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(target, now + LOOP_FADE);

  source.connect(gain);
  gain.connect(out);
  // A `once` source ends on its own, and the entry has to go with it or the
  // guard above would refuse to play it a second time next round.
  source.onended = () => {
    if (loops.get(name)?.source === source) loops.delete(name);
  };
  source.start();
  loops.set(name, { source, gain });
}

/** Fade a loop out and tear it down. Safe to call when it is not running. */
export function stopLoop(name: SoundName) {
  const live = loops.get(name);
  if (!live) return;
  loops.delete(name);

  const context = ctx;
  const done = () => {
    live.source.disconnect();
    live.gain.disconnect();
  };

  if (!context) {
    try {
      live.source.stop();
    } catch {
      // never started
    }
    done();
    return;
  }

  const now = context.currentTime;
  live.gain.gain.cancelScheduledValues(now);
  live.gain.gain.setValueAtTime(live.gain.gain.value, now);
  live.gain.gain.linearRampToValueAtTime(0, now + LOOP_FADE);
  live.source.onended = done;
  live.source.stop(now + LOOP_FADE);
}

/** Every loop, silenced. For teardown — a loop outlives the component that
 *  started it otherwise, because nothing else ever stops one. */
export function stopAllLoops() {
  for (const name of [...loops.keys()]) stopLoop(name);
}

