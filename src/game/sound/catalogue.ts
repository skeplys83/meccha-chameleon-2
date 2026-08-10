/**
 * Every sound in the game, and how loud it is relative to the others.
 *
 * Files live in `public/sounds/` and are served by this machine's own server —
 * a LAN game must never reach for a CDN.
 *
 * **Every file is peak-normalised to −1 dBFS**, so a `gain` here is a real
 * proportion rather than a guess about how hot that particular export happened
 * to be. `step.wav` arrived 21 dB below `shotgun.wav`; multiplied by a cautious
 * gain it was ~34 dB under the gunshot and simply could not be heard. If you add
 * a sound, normalise it the same way:
 *
 *     ffmpeg -i new.wav -af volumedetect -f null /dev/null   # read max_volume
 *     ffmpeg -i new.wav -af "volume=<-1 minus that>dB" out.wav
 *
 * **Positional sounds must be mono.** A stereo buffer cannot be spatialised: the
 * panner has nothing to place, because left and right are already baked in. That
 * is a property of the *file*, not of this table, so it is checked when the
 * buffers load — see `engine.ts`.
 */

export type SoundName = "shotgun" | "squash" | "step" | "whistle";

export type SoundSpec = {
  url: string;
  /** Baseline volume. Relative to the others, not absolute. */
  gain: number;
  /** Whether this sound is ever played at a point in the world. Mono-only. */
  positional: boolean;
};

export const SOUNDS: Record<SoundName, SoundSpec> = {
  /** A shot, at the shooter. Fires whether it hit a wall or a person. */
  shotgun: { url: "/sounds/shotgun.wav", gain: 0.9, positional: true },
  /** Someone died, at the body. Everyone hears it — it is how a hider learns
   *  the seeker is finding people, and roughly where. */
  squash: { url: "/sounds/squash.wav", gain: 1.0, positional: true },
  /** One footfall. Pitched by body size, see `footsteps.ts`. */
  step: { url: "/sounds/step.wav", gain: 0.6, positional: true },
  /** Global, stereo, and currently **unwired** — there is no round flow to start
   *  yet. It loads with the rest so hooking it up is a one-line change. */
  whistle: { url: "/sounds/whistle.wav", gain: 0.7, positional: false },
};

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
