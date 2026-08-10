# sound — everything that makes a noise

**Owns:** the Web Audio plumbing, the catalogue of sounds, the listener that
follows your head, and the footstep derivation.

**Entry points:** `playSound` / `unlockAudio` / `setAudioSuspended` from
`engine.ts`; `SoundStage`; `Stepper` / `jitteredStepRate` from `footsteps.ts`.

## Files

- `catalogue.ts` — every sound, its file, its gain, and whether it is positional.
- `engine.ts` — the context, the master gain, the decoded buffers, the listener,
  and one-shot playback.
- `footsteps.ts` — turns a stream of positions into footfalls, and pitches them.
- `SoundStage.tsx` — mounted in the Canvas; drives the listener and plays the
  networked events. Renders nothing.

## Invariants

1. **Positional sounds must be mono.** A stereo buffer cannot be spatialised —
   left and right are already baked in, so the panner has nothing to place, and
   the sound appears to come from everywhere. `step`, `shotgun` and `squash` are
   mono; `whistle` is global and correctly stereo. `preloadSounds` warns if a
   positional file arrives with more than one channel, because the symptom
   otherwise reads as "3D audio is just subtle".
2. **Every file is peak-normalised to −1 dBFS.** A `gain` in the catalogue is
   then a real proportion instead of a guess about how hot that export happened
   to be. This is not housekeeping: `step.wav` shipped 21 dB below `shotgun.wav`,
   and multiplied by a cautious gain it sat ~34 dB under the gunshot — perfectly
   wired, completely inaudible, and easy to misdiagnose as a broken trigger.
   Normalise anything you add:

   ```bash
   ffmpeg -i new.wav -af volumedetect -f null /dev/null    # read max_volume
   ffmpeg -i new.wav -af "volume=<-1 minus that>dB" out.wav
   ```

3. **The context unlocks on *any* gesture, not just the join click.** Browsers
   start every context suspended and only honour `resume()` from a user gesture.
   `Game.tsx` calls `unlockAudio()` on the role button, and that is the intended
   path — but it was a single point of failure for the entire game's audio, and
   when it failed it failed *silently*. `engine.ts` now also binds capture-phase
   `pointerdown` / `keydown` / `touchstart` listeners beside the context it
   unlocks, and drops them once it is running. `keydown` is the one that matters:
   you cannot walk without pressing a key, so footsteps can never be the first
   thing to discover the context is still locked.
4. **A dropped sound says why, once.** If `playSound` is called while the context
   is not running it retries the resume, drops that one sound, and warns to the
   console — naming the sound and the state. A silent game with a silent cause is
   the worst thing this module can do, and it cost a full debugging round.
5. **The context is created early, resumed late.** Constructing a suspended
   `AudioContext` needs no gesture, so `SoundStage` builds it on mount and decodes
   the buffers then — otherwise the first shot of the round would be the one
   waiting on a fetch.
6. **The listener reads `camera.position` / `camera.quaternion`, never
   `matrixWorld`.** `players/Player.tsx` drives the camera imperatively from its
   own `useFrame`, and matrices are only refreshed at render time — so a
   world-matrix read here would be a frame stale, and *which* frame would depend
   on `useFrame` ordering. The camera has no parent, so its local transform is its
   world transform.
7. **One-shots are plain Web Audio nodes, not `THREE.PositionalAudio`.** That is
   an `Object3D` you park in the scene graph, which suits a looping hum but would
   mean mounting and unmounting a node per shot. Each play here is a source, a
   gain and optionally a panner, all disconnected in `onended`.
8. **A missing sound must never break a frame.** `playSound` drops the call if the
   buffer has not decoded, the file 404'd, or the context is not running. It never
   throws and never awaits.
9. **Footsteps are derived, never networked.** Every client already has everyone's
   position at 20 Hz, so a step is a function of distance travelled — no message,
   no bandwidth, and it cannot drift out of sync with what you can see because it
   *is* what you can see.
10. **Only horizontal travel counts as walking.** Falling and jumping move you a
   long way in Y and must not tick the stride. This is also why remote figures
   cannot use the ground ray the local player has: nobody else's `grounded` is on
   the wire, so ignoring Y is the approximation that stands in for it.
11. **Both stride *and* pitch come from `BODY`.** A hider is smaller, so they
    take shorter, quicker, higher steps than a seeker: stride 1.9 vs 2.47 and
    pitch 1.3 vs 1.0. At the shared movement speed of 6 that is 3.1 footfalls a
    second against 2.4. Re-proportioning a role changes both automatically.
    This is a gameplay signal, not decoration — hearing a step you cannot see and
    knowing whether it is prey or the hunter is most of what audio contributes to
    hide-and-seek.
12. **The stepper carries a remainder, so cadence is frame-rate independent.**
    Verified at 30 and 60 fps: the same walk produces the same number of steps.
13. **Warping is not walking.** Anything faster than `WARP_SPEED` (20 u/s, well
    above the movement speed of 6) is a respawn, the under-the-floor catch, or a
    remote whose patch arrived after a gap — it resets rather than stepping, or
    every respawn would land a footfall on arrival. `MIN_STEP_GAP` is the backstop
    beneath that, capping any pathological input at ~9 steps a second.
14. **No `constructor(private x)` parameter properties in this folder.** Node's
    type stripping refuses them outright, and these modules are meant to import
    straight into Node for testing. `Stepper` writes the field out longhand.

## Contracts

- **Reads `net/`** for `onShot` and `onKilled`, and reads `remotes` directly each
  frame for footstep positions.
- **`onShot` carries the shooter's session id, not a position.** Every client
  already knows where that player is; a coordinate on the wire would only be
  staler. `remotes` never holds *you*, so your own shot resolves to no position —
  which is right, it is at your ear, and a panner at zero distance behaves badly.
- **The server broadcasts `shot` on both the `shoot` and the `kill` path.** That
  matters: a killing shot relays no `mark`, so hanging the bang on `mark` would
  have made the most dramatic shot in the game silent.
- **`killed` carries a position** so everyone hears the death where it happened.
  It rides on the broadcast rather than on the grave because `graves.onAdd` also
  replays the whole backlog to a joining client, who would otherwise hear every
  death in the room's history at once.
- **Reads `players/body.ts`** for `BODY`, to pitch steps by role.
- **`players/Player.tsx` owns your own footsteps**, because it is the only place
  that knows you are grounded. They are played without a position — you are the
  listener — and slightly quieter, since your own feet are the ones you least need
  to hear. `SoundStage` owns everyone else's.
- **`Game.tsx` calls `unlockAudio()` on join and `setAudioSuspended(paused)`**, so
  a shot fired the instant before Esc does not ring on behind the menu.

## Tuning

All the knobs, in the order you are likely to want them:

- per-sound loudness — `gain` in `catalogue.ts`
- your own footsteps — the `gain` passed at the `playSound("step", …)` call in
  `players/Player.tsx`
- how far sound carries — `REF_DISTANCE` (higher = audible further) and `ROLLOFF`
  in `engine.ts`. The Web Audio default `refDistance` of 1 would make everything
  inaudible two steps away in a 40×40 arena.
- **footstep cadence** — `STRIDE_PER_HALF_HEIGHT` in `footsteps.ts`. Raise it and
  everyone plods, lower it and everyone scurries; the hider/seeker difference
  scales with it automatically. Currently 1.9, giving 3.1 and 2.4 steps a second.
- the pitch spread — `JITTER`; the walk/idle threshold — `IDLE_SPEED`

## Testing it

Both `footsteps.ts` and `engine.ts` import straight into Node — no React, no
WebGL — with a throwaway resolve hook for the `@/` alias and, for the engine, a
~30-line Web Audio stub. That covers cadence, the idle/warp guards, frame-rate
independence, pitch, and the whole unlock path including the gesture listeners.
It is the only way to check any of this without a browser, and browsers are not
part of this project's workflow — see the root CLAUDE.md.

## Not built yet

No music, no ambience, no UI sounds, no volume control or mute in the HUD. No
reverb, so the arena sounds like open air rather than a room. `whistle.wav` is
loaded and deliberately unwired — it is waiting for a round to start, and there is
no round flow yet. Nothing varies footstep sound by surface, because every surface
in the arena is the same material.
