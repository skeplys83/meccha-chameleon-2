/**
 * Every sound in the game, and how loud it is relative to the others.
 *
 * Files live in `public/sounds/` and are served by this machine's own server —
 * nothing here is ever fetched from a third party. See trap 3, `docs/TRAPS.md`.
 *
 * **Every file is MP3, and peak-normalised to −1 dBFS *after* encoding.** The
 * gain here is then a real proportion rather than a guess about how hot that
 * export happened to be — `step` arrived 21 dB below `shotgun` once, and
 * multiplied by a cautious gain it sat ~34 dB under the gunshot: perfectly
 * wired, completely inaudible.
 *
 * The order matters. A lossy codec does not preserve the peak it was given —
 * the decoder reconstructs intersample peaks and can land *above* the source,
 * so `bell` normalised to −1 came back at 0.0 dBFS. Normalise the **encoded**
 * file, and iterate, because the peak does not move linearly with the pre-gain:
 *
 *     ffmpeg -y -i new.wav -c:a libmp3lame -b:a 96k out.mp3
 *     ffmpeg -i out.mp3 -af volumedetect -f null /dev/null   # read max_volume
 *     ffmpeg -y -i new.wav -af "volume=<-1 minus that>dB" -c:a libmp3lame -b:a 96k out.mp3
 *     # repeat until it settles; two or three passes is usual
 *
 * Bitrates: 64k for the mono positional sounds, 96k for the stereo announcements,
 * 128k for the music. That took `public/sounds/` from 15.6 MB to 1.3 MB.
 *
 * **Positional sounds must be mono.** A stereo buffer cannot be spatialised: the
 * panner has nothing to place, because left and right are already baked in. That
 * is a property of the *file*, not of this table, so it is checked when the
 * buffers load — see `engine.ts`.
 */

export type SoundName =
  | "shotgun"
  | "squash"
  | "step"
  | "brush"
  | "whistle"
  | "tick"
  | "bell"
  | "gong"
  | "ambient";

export type SoundSpec = {
  url: string;
  /** Baseline volume. Relative to the others, not absolute. */
  gain: number;
  /** Whether this sound is ever played at a point in the world. Mono-only. */
  positional: boolean;
};

export const SOUNDS: Record<SoundName, SoundSpec> = {
  /** A shot, at the shooter. Fires whether it hit a wall or a person. */
  shotgun: { url: "/sounds/shotgun.mp3", gain: 0.9, positional: true },
  /** Someone died, at the body. Everyone hears it — it is how a chameleon learns
   *  the hunter is finding people, and roughly where. */
  squash: { url: "/sounds/squash.mp3", gain: 1.0, positional: true },
  /** One footfall. Pitched by body size, see `footsteps.ts`. */
  step: { url: "/sounds/step.mp3", gain: 0.6, positional: true },
  /**
   * Looped while you are dragging the brush across your own body. Deliberately
   * the quietest thing in the game: it runs continuously, and a continuous sound
   * reads far louder than its peak suggests. Not positional — it is your own
   * hand, at your own ear — so stereo is right for it.
   */
  brush: { url: "/sounds/brush.mp3", gain: 0.28, positional: false },
  /**
   * Every player's periodic tell, at whoever let it out. Positional, so it is
   * mono like the rest — a stereo file already carries its own left/right image
   * and a panner has nothing left to place, which is why this used to sound like
   * it came from everywhere at once.
   */
  whistle: { url: "/sounds/whistle.mp3", gain: 0.9, positional: true },

  /**
   * The three round sounds. **None of them is positional, and that is the point:
   * they are announcements about the round, not events in the world.** Everyone
   * hears each one at the same instant and at the same volume, wherever they are
   * standing — a bell that got quieter with distance would tell a chameleon
   * hiding in a far corner less than it told the hunter, which is exactly
   * backwards. Being non-positional also means they may stay stereo, unlike
   * everything above them.
   *
   * They are driven by the *server's* clock rather than each client's, which is
   * the difference between these and the whistle below.
   */

  /**
   * One second of a countdown. Plays on every tick of one, for everybody.
   *
   * The quietest of the three by a distance: it repeats up to twenty times in a
   * row, and a repeating sound reads far louder than its peak suggests — the
   * same reasoning as `brush`. If it is annoying it is too loud, not too long.
   */
  tick: { url: "/sounds/tick.mp3", gain: 0.3, positional: false },
  /** The hiding phase is over and the hunter is coming. The one sound in the
   *  game that changes what you should be doing. */
  bell: { url: "/sounds/bell.mp3", gain: 0.85, positional: false },
  /**
   * The round is decided, either way. Followed by the reveal.
   *
   * **Half the gain of the bell, because it is struck three times over.** The
   * strikes are 220 ms apart and the sound is two seconds long, so all three
   * overlap and their amplitudes add: at 0.9 apiece the sum was pushing 2 and
   * clipping the master, which is the one thing invariant 2 says a gain must
   * never do. This is the volume of *one* strike, chosen so the chord of three
   * lands where a single loud sound would.
   */
  gong: { url: "/sounds/gong.mp3", gain: 0.42, positional: false },
  /**
   * Seventy-six seconds of music, played once `MUSIC_DELAY_MS` after the bell.
   *
   * Not *on* the bell: the two land on top of each other and the bell is the one
   * carrying information. A few seconds later the hunt has visibly begun and the
   * music arrives under it rather than across it.
   *
   * **The quietest thing in the catalogue except the brush**, and for the same
   * reason: it runs continuously under everything else, and a continuous sound
   * reads far louder than its peak suggests. It has to sit beneath footsteps
   * and whistles in particular — those are how a hunt is actually played, and
   * music that buried them would make the game worse, not more atmospheric.
   *
   * It is by far the largest asset in the project (14 MB of PCM against a 3.6 MB
   * bundle). Uncompressed like everything else here, which is defensible for a
   * one-second gunshot and much less so for a minute of music; encoding it would
   * cut it by roughly ninety per cent and `decodeAudioData` reads mp3 and ogg as
   * happily as wav.
   */
  ambient: { url: "/sounds/ambient-music.mp3", gain: 0.2, positional: false },
};

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

/**
 * How often the whistle sounds, from the moment you join.
 *
 * It runs on each client's own clock rather than the server's, so two players
 * who joined a minute apart hear it a minute apart. That is fine for a marker of
 * elapsed time; it would be wrong for a round boundary, which would have to be
 * broadcast so everyone heard the same one. There is no round flow yet — when
 * there is, this moves to the server.
 */
