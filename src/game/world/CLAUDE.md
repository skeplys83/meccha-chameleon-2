# world — the maps

**Owns:** every map the game can load, the registry that picks one, and the
`ROOM_SURFACE` name that shots and the camera filter on.

**Entry points:** `Room`, `ROOM_SURFACE`, `ROOM_HALF`.

## Files

- `maps.ts` — `GameMap` and the registry: every map's id, file, spawn, bound,
  round length and presentation, plus `MATCH_MAP_LIST` and `mapName`. Data only
  — no React, no three.js, because the **server** imports it.
- `mapIds.ts` — the ids alone, **import-free on purpose**. Also `LOBBY_MAP` and
  `MATCH_MAP_IDS`, which the server validates against.
- `surface.ts` — `ROOM_SURFACE`, alone for the same reason.
- `Room.tsx` — renders whichever map the room is playing, sets the background
  and the sky, and raises the loading flag while the file arrives. It preloads
  **nothing**; see `preload.ts`.
- `preload.ts` — `preloadMap(id)`, the one way a map's file is fetched ahead of
  being stood on. Called by `Game.tsx`, not from here.
- `levelScene.ts` — all of the *reading* of a level `.glb`: the split into a
  visual half and a collision half, the shadow setup on the file's lights, the
  instancing, and `checkLevel`. **No React**, so it runs in Node — see
  "Checking a level without a browser".
- `GltfLevel.tsx` — the mounting for the above: the colliders, the raycast
  proxies, and the map's ambient light. Thin on purpose.

## A map is one `.glb`, exported from Blender

There is one kind of map and one way to make one. `levels/<id>.blend` is the
map, `public/maps/<id>.glb` is its export, and the row in `maps.ts` is a display
name and the handful of numbers the game needs before the file has loaded.

**There is no build step, and that is deliberate.** Nothing in this repo reads,
writes or generates a `.blend` or a `.glb`; the Blender side is a separate
workflow that happens to drop a file into `public/maps/`. The cost is that
`spawn` and `bound` are typed by hand and can drift from the file — which is
what `checkLevel` is for.

**The registry is readable by Node, and the server reads it.** `server/room.ts`
imports `mapRoundSeconds` and `server/messages.ts` imports `mapLimit`. That works
because `maps.ts` and `mapIds.ts` import nothing but each other and
`shared/protocol.ts`, **and because they use relative `.ts` paths rather than
the `@/` alias**, which only the bundler resolves. Both halves are required: an
`@/` import here fails at server startup, not at build. **Importing a component
or three.js into `maps.ts` closes the door entirely** — which is why
`levelScene.ts` is a separate file even though it is pure logic.

## Editing a map in Blender

The file is read **by convention**. There is no level editor and no metadata
sidecar; an object's name is the whole interface:

| named | becomes |
| --- | --- |
| `col_*` | a **cuboid** collider from its bounding box. Walls, floors, crates — almost everything |
| `colhull_*` | a **convex hull** of its real vertices. Cylinders, cones, ramps, anything sloped |
| `coltri_*` | a **trimesh**. Only for shapes with a hole through them |
| `colball_*` | a **ball** from its bounding sphere. Spheres and domes |
| anything else | decoration. Drawn and shadowed, and **never collided with** |
| a light | a light, with shadows switched on at load |
| an Empty named `spawn` | the author's marker for the spawn point |

Everything else about the map — round length, background, sky, and the `bound`
the server clamps to — is typed in `maps.ts`. **Lighting is not on that list and
never should be**: see invariant 15.

The loop:

1. Edit `levels/<id>.blend`.
2. `./scripts/export-level.sh <id>` — or with no argument for every level. It is a
   wrapper around one `blender --background` call so the export settings live in
   one place rather than in somebody's memory, and it prints the size on disk
   and gzipped. Exporting by hand from the GUI is fine too: **glTF Binary**,
   +Y up, apply modifiers, include punctual lights, and **limit to visible
   objects** so the kit palette is left out.
3. Reload the page. If you moved the spawn point or changed the size of the map,
   the console tells you what to update in `maps.ts`.

`scripts/export-level.sh` and `scripts/export-level.py` are the only two files
that know how a `.blend` becomes a `.glb`, and nothing under `src/` reads either.
They are a convenience wrapper around one `blender --background` call — the game
still only ever loads whatever `.glb` is sitting in `public/maps/`.

**Collision is authored, not derived.** One merged slab across a whole room
beats one box per floor tile, and neither should follow the visual mesh — a
torch bracket is decoration and should be neither shootable nor stood on. This
is the single biggest lever on both frame rate and how a map *feels* to move
through. Prefer `col_`: a cuboid is one comparison, where a trimesh is the most
expensive collider rapier has.

**Repeat a piece as a linked duplicate** (`alt+D`, not `shift+D`). Objects
sharing mesh data are batched into one draw call at load; separate copies of the
same tile cannot be.

### The kit palette

`levels/dungeon.blend` carries a `kit` collection holding **all 211 KayKit
models in a labelled grid**, parked at z ≈ +200, well clear of the map. It is
the palette you copy from: find the piece, `alt+D` it into the room, move it in.

The collection is **excluded from the view layer**, which is what keeps it out
of the export — exporting with "visible objects" leaves it behind entirely. Tick
it back on in the outliner to browse. You do not have to remember to untick it:
`export-level.py` forces the exclusion for the duration of the export and says
so, without saving the `.blend`. `export-level.sh` also shouts if a level suddenly exports
at more than twice its previous size, which is what a leak looks like from
outside.

The raw pack also lives at `levels/kit/dungeon/` as the original `.gltf` files,
for re-importing anything the grid has lost.

### Checking a level without a browser

`levelScene.ts` is free of React and takes a plain `THREE.Object3D`, so the
*actual* runtime reading of a level can be run in Node over the exported `.glb`:
parse it with `GLTFLoader.parse`, hand `gltf.scene` to `prepareLevel`, and every
claim in the table above is measurable — how many pieces are drawn against how
many are collision, which collider kinds came out, whether any `ROOM_SURFACE`
leaked into the visual half, and what the draw call count came to after batching.
`checkLevel` can be called the same way. Three DOM globals have to be stubbed for
the texture decode (`self`, `URL.createObjectURL`, `createImageBitmap`); the
texture failing to load is expected and affects none of the above.

This is the check worth running after a big edit, because the failures it catches
are the quiet ones and none of them look wrong until somebody falls through the
world.

## Adding a map

Add the id to `mapIds.ts`, export a `.glb` to `public/maps/`, and add a row to
`maps.ts`. Nothing else: the menu and the lobby panel both list `MATCH_MAP_LIST`,
the server validates a chosen id against `MATCH_MAP_IDS`, `Room` renders it, and
its file is preloaded. `maps.ts` throws at import time if the two files disagree,
so a half-added map fails the build instead of showing an empty menu entry or
silently refusing a legitimate choice.

## Downloading a map is demand-driven, and triggered from outside this folder

`Room.tsx` used to loop over `MAPS` at import time and preload every model in
the game. Because `Game.tsx` imports `Scene` statically, that ran on **page
load**: everybody who opened the start menu pulled the whole dungeon down,
whether they ever played it or not.

It is now `preloadMap(id)` in `preload.ts`, called from `Game.tsx` at two
moments and no others:

1. **On arriving in a lobby**, keyed on `nextMap`, so it re-fires when the host
   changes their pick. This is the one that matters — the whole
   gathering-and-painting wait is free budget.
2. **When the countdown starts**, as a backstop. A no-op for anybody the first
   trigger already covered, since drei's cache is keyed by URL. It is there for a
   host who changed the map moments before pressing Start.

**Do not put a preload back at module scope.** An import-time side effect cannot
be told which map anybody wants, and it is invisible at the call site.

**Neither trigger is a guarantee, and a player who misses is covered twice:**

- **The body is held.** `players/Player.tsx`'s frame loop zeroes `vy` and returns
  for as long as its `ROOM_SURFACE` list is empty, so nobody falls through where
  the floor will be — invariant 14 in `players/CLAUDE.md`.
- **The screen is covered.** `Room`'s `Suspense` fallback calls `beginLoading`
  from `src/game/loading.ts`, which puts `hud/LoadingScreen` up until the map
  commits.

Neither is sufficient alone: the hold without the screen is a frozen player
staring at nothing, and the screen without the hold is a spinner over a body
falling out of the world. The boundary is deliberately the signal rather than a
fetch counter — it wraps exactly the map *this room is playing*, so the next map
downloading in the background cannot raise it.

## Invariants

1. **`mapIds.ts` and `surface.ts` must stay import-free**, and `maps.ts` must
   import only those and `shared/protocol.ts`. The server reads
   the registry, and the server is plain Node. Adding a React or three.js import
   anywhere in that set breaks `npm run dev` at startup, not at build — which is
   the loud, early failure this arrangement is designed for.
2. **A map id is a wire value.** It is chosen in the menu, stored in room state
   and read by every client. Add ids freely; rename one and you break anybody
   mid-session, the same as renaming a message.
3. **The map is fixed for a room's life.** Swapping geometry under players
   standing on it has no sane outcome, and a map chosen per client would put
   people inside walls their opponents cannot see. A lobby is *always* the
   arena; the map a host picks is `nextMap`, which the match is created with.
   Changing the map is therefore always changing rooms.
4. **The arena is `LOBBY_MAP`, not a choice.** It is where every game waits —
   playable on purpose, so you can walk about and paint while people arrive — and
   it is absent from `MATCH_MAP_IDS`, refused by `onCreate` and `setMap`, and
   missing from both pickers. Offering it would mean pressing Start and arriving
   where you already were.
5. **`ROOM_SURFACE` goes on the collision layer and on nothing else.** That name
   is what `players/Player.tsx` filters on for the shot raycast, the ground test
   and the camera pull-in, so a raycast reads the same simple boxes physics does
   rather than a torch's forty triangles. Two consequences while building a
   level: decoration cannot be shot, stood on or clung to, and a piece of cover
   with no collision object is cover you walk straight through.
6. **The prefix chooses the collider, and the wrong one does not error.** A hull
   around the arena's ring fills in the hole you run through; a box around its
   dome is a box; a cuboid around a rotated ramp is right only because the
   rotation is kept on the collider. None of these fail loudly — they just make a
   shape behave like a different shape.
7. **Everything tall has a way up.** Jump apex is `JUMP_SPEED²/2g` ≈ 3 units, so
   no step in the arena is more than ~2: the ziggurat is three 1-unit tiers, the
   divider is a lip then a wall, the stairs rise 0.9 each onto a catwalk that
   dead-ends at the slab, and the big drum has a smaller drum beside it as its
   step. The cone, the capsule and the crystal are the deliberate exceptions.
8. **A map must suspend exactly once, before any collider exists.** `Room`'s
   `Mounted` calls `useGLTF(map.src)` once, above `GltfLevel`. React discards a
   suspended tree, so a component that suspended *below* a mounted collider would
   have that collider torn down and rebuilt — and rapier does not survive that:
   it panics with `unreachable` and every later call throws `recursive use of an
   object`, killing physics for the session.
9. **Anything that changes the set of surfaces must call `bumpSurfaces`.**
   `players/Player.tsx` collects `ROOM_SURFACE` meshes and reuses the list for
   the shot raycast, the climb probes and the camera. It used to collect them
   once on mount, which broke the moment maps started loading from files: the
   player mounted first, found nothing, and kept an empty list forever — no
   walls, no climbing, no shots, which reads exactly like "the controls are
   broken". `Room` bumps the counter when a map mounts and again when it
   unmounts. **Standing up is not on this list**: the character controller finds
   the floor through rapier's own colliders, so an empty surface list costs you
   shooting, climbing and the camera but still leaves you able to walk around.
10. **The loaded scene is cloned before it is touched.** `prepareLevel` does the
    clone, in a `useMemo` — before render, so the `ROOM_SURFACE` proxies exist by
    the time `players/Player.tsx` collects them. drei caches the parsed glTF by
    URL and hands the *same* object out to every caller, so mutating it directly
    would leak shadow flags and removed colliders into the next room that loads
    the same file.
11. **Levels are committed as one uncompressed `.glb` each, and that is still
    the right call.** Both maps together are 959 KB — less than the music — and
    they gzip to 45 KB and 223 KB, so **serving `public/` compressed is worth
    more than any pipeline change** and costs nothing. Geometry is the whole
    file: the dungeon's 693 KB of buffer is 676 KB of vertices against 17 KB of
    texture, because the kit shares one atlas, so KTX2 would be pure overhead.

    When that stops being enough the order is **quantization first**
    (`KHR_mesh_quantization`, roughly halves geometry, and three reads it with
    **no decoder at all**), then **meshopt** (29 KB decoder, shipped in
    `three/examples/jsm/libs/`). **Draco is the one to skip**, but not for the
    reason first written here: its decoder *can* be self-hosted — the files are
    in `three/examples/jsm/libs/draco/` and trap 3 only forbids drei's default
    CDN path. The reason is arithmetic. That decoder is a 285 KB wasm plus a
    59 KB wrapper, against geometry gzip already takes to 223 KB.
12. **`spawn` and `bound` are typed by hand and `checkLevel` is the only thing
    stopping them rotting.** There is no build step, so nothing *makes* them
    agree with the `.glb`. Both ways they drift are silent: a stale `bound` has
    `server/messages.ts` clamping players inside a room they can still walk
    around in, so everyone else watches them stop dead at an invisible wall while
    their own screen shows them walking on; a stale `spawn` starts the round with
    everybody falling out of the world. `checkLevel` compares both against the
    file at load, in development only, and warns rather than throws. It tolerates
    1.5 units of overshoot on `bound` because a perimeter wall always reaches
    past the floor it encloses by its own thickness.
13. **Nothing drawn is collided with and nothing collided with is drawn.** The
    two halves are split on the name prefix in `levelScene.ts`, and the split is
    the whole reason this format was worth moving to. Both directions fail
    quietly. Give the visual meshes colliders and you are back to a body per
    piece with hulls generated off render geometry — hundreds of them, decomposed
    on every map load, and the physics step starts costing more than the frame.
    Name a piece of decoration `col_` and it becomes an invisible wall that
    nothing on screen explains.
14. **Repeated geometry is instanced at load, not by the exporter.** Blender is
    *asked* for `EXT_mesh_gpu_instancing` and does not always give it — the flag
    is version-dependent and silently does nothing when it declines, which is
    exactly what happened on the dungeon's first export. Batching by
    geometry-and-material at load depends on nothing but the file having repeats,
    and on the dungeon it turns 149 meshes into 18 draw calls. This is also why a
    repeated piece must be a **linked duplicate**.
15. **A map is lit by its own file, and the game adds no light at all.** Every
    lamp in the game is an object in a `.blend`. There were two rounds of this:
    an `ambientLight` at 1.2 plus an overhead sun in `Scene.tsx` that applied to
    every map, and then a smaller per-map `ambientLight` in `GltfLevel`. Both are
    gone. They flatten an interior — a dungeon lit by a global ambient has no
    darkness in it to hide in, which for this game is the gameplay rather than
    the mood, and it makes what you see in Blender a poor guide to what you get.

    **Blender's World colour is not part of what exports**, and there is nowhere
    for it to go: `KHR_lights_punctual` has point, spot and directional and no
    concept of ambient. So a scene lit in Blender partly by its world background
    arrives darker than it looked. The fix is a light *object* in the `.blend`,
    not a knob here — a low sun, or a large area light, is what a world colour
    was standing in for.
16. **Nine arena pieces are in exact `PAINT` hexes.** Same values the swatch row
    renders. Pick the matching swatch, paint yourself, and you can test camouflage
    against a true match instead of eyeballing it. They are now materials in
    `levels/arena.blend`, one per colour, written as linear from the sRGB hex so
    the export round-trips. Do not "tidy" an arena colour to something
    off-palette, and do not let Blender's colour picker talk you into a near miss.
17. **The arena's lid is collision with no visual.** `col_ceiling` has no drawn
    counterpart: the lid still stops a jump leaving the room and a chameleon can
    still cling to it and walk it upside down, but nothing draws it, so the
    waiting room has weather. `sky` is a boolean rather than an asset because the
    sky is a *shader* — drei's `Sky`, Preetham scattering with no texture behind
    it. `<Environment>` is the one that fetches an HDR from a CDN and blanks the
    scene on a network with no internet; see trap 3.
18. **The arena's shell does not cast shadows, and that is not a perf tweak.**
    Its light is overhead, so a ceiling that cast would drop a shadow across the
    entire room and every interior would go black.

## Contracts

- **Reads `ROOM_HALF` and `ROOM_LIMIT` from `shared/protocol.ts`.** The arena's
  `bound` is `ROOM_HALF`, and the gap between the two (20 vs 19.9) is the slack
  every map gets through `mapLimit` — deliberate rather than a rounding slip, see
  `shared/CLAUDE.md`.
- **`server/messages.ts` clamps to `mapLimit(room.state.map)`** and
  **`server/room.ts` reads `mapRoundSeconds`**, so the registry is read on every
  `state` and every `kill`.
- **`Room` owns the background and the sky**, which `Scene.tsx` used to. Both are
  facts about the map.
- `players/Player.tsx` collects `ROOM_SURFACE` meshes from the scene graph
  whenever `surfaceRevision()` moves, which `Room` bumps on mount and unmount.
- `combat/Graves.tsx` deliberately does **not** use that name — a grave is paint
  on the floor and must not stop a bullet or the camera.
- **Nothing here reads `paint/palette.ts` any more.** The arena's palette colours
  live in its `.blend` as materials; the swatches are still `PAINT`, and the two
  are kept in step by hand — see invariant 16.

## Not built yet

**The dungeon is a test room, not a level.** One 28×28 hall, two staggered
partitions, a dozen props and four torches. It exists to have something with
walls and darkness in it to play in; it is not designed, and the nine-room warren
that used to be generated from a character grid is gone with the code that
generated it. Anything about it is fair game to change.

**No baked lighting.** A level's lights are punctual and real-time, and for
geometry this static the obvious next step is a Blender lightmap bake into a
second UV set, fed to three as `lightMap`. Nothing here is built for it:
`prepareLevel` would need to find the second UV set.

**No mesh compression and no chunking.** Meshopt is the compression to reach for
(invariant 11), and batching is the only draw-call work there is — a level big
enough to need per-room frustum culling would want chunk conventions to merge
within.

**No collision beyond the four primitives.** No capsule, no heightfield, no
compound shapes.

The arena's layout is fixed — no variants and no randomisation. There is exactly
*one* spawn point per map and everybody uses it, so a full lobby arrives in a
match stacked on the same square — and since players have no colliders against
each other, they simply overlap until they walk apart.
