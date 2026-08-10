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

3. **`unlockAudio()` must be called from a real click.** Browsers start every
   context suspended and only honour `resume()` from a user gesture. The gesture
   this game uses is the role button in `RoleMenu`, via `Game.tsx`'s `join`. Move
   it into an effect or a timer and the whole game is silent with no error.
4. **The context is created early, resumed late.** Constructing a suspended
   `AudioContext` needs no gesture, so `SoundStage` builds it on mount and decodes
   the buffers then — otherwise the first shot of the round would be the one
   waiting on a fetch.
5. **The listener reads `camera.position` / `camera.quaternion`, never
   `matrixWorld`.** `players/Player.tsx` drives the camera imperatively from its
   own `useFrame`, and matrices are only refreshed at render time — so a
   world-matrix read here would be a frame stale, and *which* frame would depend
   on `useFrame` ordering. The camera has no parent, so its local transform is its
   world transform.
6. **One-shots are plain Web Audio nodes, not `THREE.PositionalAudio`.** That is
   an `Object3D` you park in the scene graph, which suits a looping hum but would
   mean mounting and unmounting a node per shot. Each play here is a source, a
   gain and optionally a panner, all disconnected in `onended`.
7. **A missing sound must never break a frame.** `playSound` drops the call if the
   buffer has not decoded, the file 404'd, or the context is not running. It never
   throws and never awaits.
8. **Footsteps are derived, never networked.** Every client already has everyone's
   position at 20 Hz, so a step is a function of distance travelled — no message,
   no bandwidth, and it cannot drift out of sync with what you can see because it
   *is* what you can see.
9. **Only horizontal travel counts as walking.** Falling and jumping move you a
   long way in Y and must not tick the stride. This is also why remote figures
   cannot use the ground ray the local player has: nobody else's `grounded` is on
   the wire, so ignoring Y is the approximation that stands in for it.
10. **Step pitch is derived from `BODY`, not hard-coded.** Pitch scales inversely
    with body size, so a hider (smaller) lands 1.3× above a seeker. That is a
    gameplay signal, not decoration — hearing a step you cannot see and knowing
    whether it is prey or the hunter is most of what audio contributes to
    hide-and-seek. Re-proportioning a role re-pitches it automatically.

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
- stride length and the pitch spread — `STRIDE`, `IDLE_SPEED`, `JITTER` in
  `footsteps.ts`

## Not built yet

No music, no ambience, no UI sounds, no volume control or mute in the HUD. No
reverb, so the arena sounds like open air rather than a room. `whistle.wav` is
loaded and deliberately unwired — it is waiting for a round to start, and there is
no round flow yet. Nothing varies footstep sound by surface, because every surface
in the arena is the same material.
