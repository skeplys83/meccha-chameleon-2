# sound — everything that makes a noise

**Owns:** the Web Audio plumbing, the catalogue of sounds, the listener that
follows your head, and the footstep derivation.

**Entry points:** `playSound` / `startLoop` / `stopLoop` / `unlockAudio` /
`setAudioSuspended` from `engine.ts`; `SoundStage`; `Stepper` /
`jitteredStepRate` / `strideFor` from `footsteps.ts`.

## Files

- `catalogue.ts` — every sound, its file, its gain, and whether it is positional.
  Nothing else: `WHISTLE_INTERVAL_MS` lives in `shared/`, because the server
  rate-limits against it. A copy briefly lived here too and was the one people
  found first, which is why `scripts/check-constants.mjs` exists.
- `engine.ts` — the context, the master gain, the decoded buffers, the listener,
  one-shot playback and looping playback. Nothing is exported from it that has no
  caller; `audioReady` and `brokenSounds` were removed once it was clear the HUD
  hint and the test seam their comments promised had never been written.
- `footsteps.ts` — turns a stream of positions into footfalls, and pitches them.
- `SoundStage.tsx` — mounted in the Canvas; drives the listener and plays the
  networked events. Renders nothing.

## Invariants

1. **Positional sounds must be mono.** A stereo buffer cannot be spatialised —
   left and right are already baked in, so the panner has nothing left to place
   and the sound appears to come from everywhere at once. That is not a theory:
   `whistle.wav` shipped stereo and sounded exactly like that until it was
   converted. Everything positional — `step`, `shotgun`, `squash`, `whistle` —
   is mono. Only `brush` is not, because it is your own hand at your own ear.
   `preloadSounds` warns if a positional file arrives with more than one channel,
   because the symptom otherwise reads as "3D audio is just subtle".
2. **Loudness is raised by compression, not by a gain above 1.** Every file peaks
   at −1 dBFS, so a catalogue gain over 1.0 clips. When a sound needs to be
   *louder* rather than *hotter*, lift its average level and re-normalise —
   `squash.wav` went from −22.6 dB mean to −18.6 dB that way, +4 dB perceived,
   with its peak untouched:

   ```bash
   ffmpeg -i s.wav -af "acompressor=threshold=-20dB:ratio=3:attack=5:release=140" _s.wav
   # then peak-normalise _s.wav back to -1 dBFS as below
   ```

3. **Every file is peak-normalised to −1 dBFS.** A `gain` in the catalogue is
   then a real proportion instead of a guess about how hot that export happened
   to be. This is not housekeeping: `step.wav` shipped 21 dB below `shotgun.wav`,
   and multiplied by a cautious gain it sat ~34 dB under the gunshot — perfectly
   wired, completely inaudible, and easy to misdiagnose as a broken trigger.
   Normalise anything you add:

   ```bash
   ffmpeg -i new.wav -af volumedetect -f null /dev/null    # read max_volume
   ffmpeg -i new.wav -af "volume=<-1 minus that>dB" out.wav
   ```

4. **A looped file needs its seam closed.** `brush.wav` arrived ending at full
   level while starting near silence, so every 0.78 s the loop stepped straight
   down — an audible click, forever, under the one sound that is supposed to sit
   in the background. Check both ends against the middle and fade whichever one
   is hot:

   ```bash
   ffmpeg -ss <duration-0.004> -t 0.004 -i loop.wav -af volumedetect -f null /dev/null
   ffmpeg -i loop.wav -af "afade=t=in:st=0:d=0.004,afade=t=out:st=<d-0.012>:d=0.012" out.wav
   ```

5. **The context unlocks on *any* gesture, not just the join click.** Browsers
   start every context suspended and only honour `resume()` from a user gesture.
   `Game.tsx` calls `unlockAudio()` on Create or Join, and that is the intended
   path — but it was a single point of failure for the entire game's audio, and
   when it failed it failed *silently*. `engine.ts` now also binds capture-phase
   `pointerdown` / `keydown` / `touchstart` listeners beside the context it
   unlocks, and drops them once it is running. `keydown` is the one that matters:
   you cannot walk without pressing a key, so footsteps can never be the first
   thing to discover the context is still locked.
6. **A dropped sound says why, once — but not when the pause did it.** If
   `playSound` is called while the context is not running it retries the resume,
   drops that one sound, and warns to the console, naming the sound and the
   state. A silent game with a silent cause is the worst thing this module can
   do, and it cost a full debugging round. `setAudioSuspended(true)` records that
   the silence is deliberate, so the whistle firing behind the pause menu does
   not cry wolf — a diagnostic nobody trusts is worse than none.
7. **The context is created early, resumed late.** Constructing a suspended
   `AudioContext` needs no gesture, so `SoundStage` builds it on mount and decodes
   the buffers then — otherwise the first shot of the round would be the one
   waiting on a fetch.
8. **The listener reads `camera.position` / `camera.quaternion`, never
   `matrixWorld`.** `players/Player.tsx` drives the camera imperatively from its
   own `useFrame`, and matrices are only refreshed at render time — so a
   world-matrix read here would be a frame stale, and *which* frame would depend
   on `useFrame` ordering. The camera has no parent, so its local transform is its
   world transform.
9. **One-shots are plain Web Audio nodes, not `THREE.PositionalAudio`.** That is
   an `Object3D` you park in the scene graph, which suits a looping hum but would
   mean mounting and unmounting a node per shot. Each play here is a source, a
   gain and optionally a panner, all disconnected in `onended`.
10. **A missing sound must never break a frame.** `playSound` drops the call if the
   buffer has not decoded, the file 404'd, or the context is not running. It never
   throws and never awaits.
11. **Footsteps are derived, never networked.** Every client already has everyone's
   position at 20 Hz, so a step is a function of distance travelled — no message,
   no bandwidth, and it cannot drift out of sync with what you can see because it
   *is* what you can see.
12. **Only horizontal travel counts as walking.** Falling and jumping move you a
   long way in Y and must not tick the stride. This is also why remote figures
   cannot use the ground ray the local player has: nobody else's `grounded` is on
   the wire, so ignoring Y is the approximation that stands in for it.
13. **Both stride *and* pitch come from `BODY`.** A hider is smaller, so they
    take shorter, quicker, higher steps than a seeker: stride 1.9 vs 2.47 and
    pitch 1.3 vs 1.0. At the shared movement speed of 6 that is 3.1 footfalls a
    second against 2.4. Re-proportioning a role changes both automatically.
    This is a gameplay signal, not decoration — hearing a step you cannot see and
    knowing whether it is prey or the hunter is most of what audio contributes to
    hide-and-seek.
14. **Positions arrive more slowly than frames, and the stepper must not divide
    by `delta`.** This is the one that cost two rounds of silent footsteps.
    `<Physics>` steps at a fixed 1/60, so `rb.translation()` is unchanged on any
    frame that fell between steps — most of them above 60 Hz. Remote players are
    worse: their target only moves on a 20 Hz patch, so at 60 fps two frames in
    three see nothing happen. **A stationary frame is completely normal at a dead
    run.** An earlier version treated one as "stopped" (speed-per-frame below a
    threshold) and zeroed the accumulated distance, so it could never reach a
    stride and *no footstep ever played* — while every other sound worked, which
    is what made it look like a wiring fault.

    So the stepper accumulates **distance**, treats sub-`NOISE` frames as "no news
    yet", and only drops a part-stride after `IDLE_GRACE` of genuine stillness.
    Nothing in it divides by `delta`. Measured at 60/144/165 fps against 60 and
    20 Hz position sources: 3.10 steps a second in every combination. The old
    version scored 0 in all of them but the artificially aligned one — which is
    the only case the first test covered. **Any test for this must tick positions
    slower than frames**, or it proves nothing.
15. **Warping is not walking.** Further than `WARP_DISTANCE` (3 units) in one
    frame is a respawn, the under-the-floor catch, or a remote whose patch arrived
    after a stall — it resets rather than stepping, or every respawn would land a
    footfall on arrival. A *distance*, not a speed, for the reason above.
    `MIN_STEP_GAP` is the backstop beneath it.
16. **No `constructor(private x)` parameter properties in this folder.** Node's
    type stripping refuses them outright, and these modules are meant to import
    straight into Node for testing. `Stepper` writes the field out longhand.
17. **Loops are keyed by name and at most one runs per name.** `startLoop` is
    therefore idempotent — a caller can fire it every frame of a drag without
    tracking whether it already did — and `stopLoop` is the only thing that ends
    one. Both fade over `LOOP_FADE`: starting or stopping a buffer at full
    amplitude is a step in the waveform, and a brush you can hear clicking on and
    off is worse than no brush at all.
18. **`startLoop` does not bail on a suspended context, unlike `playSound`.** A
    suspended context has a frozen clock, so the sound and its fade simply begin
    when it wakes. Dropping the loop instead would mean a player who started
    brushing before the first gesture got silence until they released and pressed
    again.
19. **Whoever starts a loop must stop it.** Nothing else will. `Player.tsx` stops
    the brush on `onDrawingChange(false)` *and* in its effect teardown, so a loop
    cannot outlive the component that began it; `stopAllLoops` is there for any
    future caller that needs the blunt version.

## Contracts

- **Reads `net/`** for `onShot` and `onKilled`, and reads `remotes` directly each
  frame for footstep positions — including `cling`, which silences a climber.
  A remote's stepper only ever sees a position, and sliding along a wall or
  walking a ceiling is indistinguishable from walking a floor, so the flag has to
  come off the wire. Climbing *straight up* is silent for free, since the stepper
  ignores Y.
- **`onWhistle` works exactly like `onShot`**, and for the same reason: the id
  is enough, because every client already knows where that player is. Your own
  resolves to no position — `remotes` never holds you — which is right, it is at
  your own head.
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
- **`Game.tsx` runs the whistle timer for hiders only**, and *sends* rather than
  plays: the room relays it back positioned at you. Giving your position away
  every 45 seconds is a cost the hidden pay; a seeker who announced themselves
  would be handing the advantage to the people they are hunting. The server
  refuses one from a seeker too, the same way it refuses a kill from a hider. `killedBy` is in the effect's deps, so a dead
  player stops whistling — a corpse that keeps piping up is both wrong and
  impossible to explain. `Game.tsx` also calls `stopAllLoops()` on death, on
  leaving and on unmount; the brush loop would otherwise keep scrubbing behind
  the death screen, since the component that started it is gone.
- **The brush loop is driven by `paint/brushCursor.ts`'s `onDrawingChange`**, via
  `players/Player.tsx`. `paint/` does not import `sound/` — it reports that a drag
  started or ended and lets the caller decide that makes a noise. One hook rather
  than three call sites, because the one that gets forgotten is `cancel`, and a
  forgotten cancel is a brush still scrubbing behind the pause menu.

## Tuning

All the knobs, in the order you are likely to want them:

- per-sound loudness — `gain` in `catalogue.ts`
- your own footsteps — the `gain` passed at the `playSound("step", …)` call in
  `players/Player.tsx`
- how far sound carries — `REF_DISTANCE` (higher = audible further) and `ROLLOFF`
  in `engine.ts`. The Web Audio default `refDistance` of 1 would make everything
  inaudible two steps away in a 40×40 arena.
- **how far sounds carry** — `REF_DISTANCE` in `engine.ts` is the radius inside
  which there is *no* attenuation, so it doubles as how big the room sounds. At 6
  it was a quarter of the arena at full volume and distance barely read; 3.5
  gives 0 dB up close, −7 at 7 units, −14 at 14 and −23 across the room.
  `ROLLOFF` sharpens the curve past that point.
- **the brush loop** — `brush` gain in `catalogue.ts`, and `LOOP_FADE` in
  `engine.ts` for how softly it starts and stops
- **footstep cadence** — `STRIDE_PER_HALF_HEIGHT` in `footsteps.ts`. Raise it and
  everyone plods, lower it and everyone scurries; the hider/seeker difference
  scales with it automatically. Currently 1.9, giving 3.1 and 2.4 steps a second.
- the pitch spread — `JITTER`; the walk/idle threshold — `IDLE_SPEED`

## Testing it

Both `footsteps.ts` and `engine.ts` import straight into Node — no React, no
WebGL — with a throwaway resolve hook for the `@/` alias and, for the engine, a
~30-line Web Audio stub. **Drive the stepper with positions that tick slower than
the frames**, at several refresh rates; a smooth position stream hides the only
bug this module has actually had. That covers cadence, the idle/warp guards, frame-rate
independence, pitch, and the whole unlock path including the gesture listeners.
It is the only way to check any of this without a browser, and browsers are not
part of this project's workflow — see the root CLAUDE.md.

## Not built yet

No music, no ambience, no UI sounds, no volume control or mute in the HUD. No
reverb, so the arena sounds like open air rather than a room. **Nobody else hears
you brushing** — the loop is local, because "is painting" is not on the wire. It
would be a fair thing to broadcast, and a good way to be found. Nothing varies
footstep sound by surface, because every surface in the arena is the same
material.

**The whistle is a periodic tell, not a round bell.** Each *hider* runs the timer
on their own clock and tells the room, so whistles arrive at different moments
for different people and each one gives away roughly where its owner is. Seekers
never whistle. A round
boundary would be the opposite — one broadcast everybody hears at once — and when
there is a round flow that will be a separate thing, not this.
