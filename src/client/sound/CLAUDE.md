# sound — everything that makes a noise

**Owns:** the audio engine, the catalogue, the loops, and footsteps.

## What's here

| file             | what                                                      |
| ---------------- | ----------------------------------------------------------- |
| `engine.ts`      | the context, one-shots, loops, unlocking, suspending, preload |
| `catalogue.ts`   | the nine files, and the gain and rate each is played at      |
| `footsteps.ts`   | `Stepper`: distance travelled → a step, per player           |
| `SoundStage.tsx` | the listener, and a stepper for each remote figure            |

## The three rules that will bite you

1. **Positional sounds must be mono.** A stereo buffer cannot be spatialised —
   it plays at full volume in both ears from anywhere on the map, which reads as
   the panning being broken rather than as the file being wrong.
2. **The context unlocks on a user gesture, and nothing is fetched on page
   load.** `app/Game.tsx` calls `unlockAudio()` from the join *click*; anywhere
   else — an effect, a timer — is silently refused and the whole game stays
   mute. The music is fetched on arriving in a lobby, not on opening the page.
3. **Whoever starts a loop must stop it.** Nothing else will. Loops are keyed by
   name, at most one runs per name, and `app/Game.tsx` stops them all on
   `onLeftRoom`, on a drop and on unmount. `ambient` is the one with a phase
   attached: `useRoundAudio` starts it on the hunt and stops it on *any* phase
   that is not the hunt, so it cannot play under the gong.

   **`ambient` loops, and its file is not cut for looping.** 76.6s long, with a
   half-second fade-in from silence (−68 dB mean) against a tail that is still
   sounding (−19.8 dB peak) — so the seam is a short hole rather than a click.
   Closing it means trimming the head and crossfading the file into itself; see
   invariant 6 in the archive for the same problem on `brush`.

## Contracts

- **Footsteps are derived, never networked.** Every client already has everyone's
  position; a step is distance travelled, horizontally only. `cling` comes over
  the wire precisely so a climber's steps stay silent for everyone else.
- **Both stride and pitch come from `BODY`** in `players/body.ts` — a chameleon
  is smaller, so they take shorter, higher steps.
- **The listener reads `camera.position`/`quaternion`** at frame priority 1,
  after the camera has been placed.
- **A missing sound drops the call rather than breaking the frame.**
- **`WHISTLE_INTERVAL_MS` is in `shared/protocol.ts`** — the server rate-limits
  against the same number.

---

Twenty-three invariants, the encoding and normalisation rules, and the tuning:
[docs/notes/sound.md](../../../docs/notes/sound.md).
