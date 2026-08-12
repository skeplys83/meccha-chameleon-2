# world — the arena

**Owns:** the room everyone plays in: the shell, the twenty-five pieces of
cover, and the `ROOM_SURFACE` name that shots and the camera filter on.

**Entry points:** `Room`, `ROOM_SURFACE`, `ROOM_HALF`.

## Files

- `shapes.ts` — `Shape`, `Solid` and `Colliders`: what a map is made of, as
  data. **Import-free on purpose.**
- `Room.tsx` — renders whichever map the room is playing, and preloads every
  map's models at import time.
- `Solids.tsx` — the only thing that turns a `Solid` into geometry: the mesh, the
  `ROOM_SURFACE` name and the rigid body. Primitives and glTF models both.
- `maps.ts` — the registry: every map's id, name, blurb, solids and models, plus
  `MATCH_MAP_LIST` and `mapName`. Data only — no React, no three.js.
- `mapIds.ts` — the ids alone, **import-free on purpose**. Also `LOBBY_MAP` and
  `MATCH_MAP_IDS`, which the server validates against.
- `surface.ts` — `ROOM_SURFACE`, alone for the same reason.
- `maps/arena.ts` — the 40×40 arena as a table of primitives: twenty-five pieces
  of cover plus a six-piece shell, no downloaded assets, exact palette colours.
- `maps/dungeon.ts` — a 52×52 KayKit warren: nine rooms, a gallery and a grate
  pit, generated from a 13×13 character plan. Assets in `public/maps/dungeon/`.

## A map is data, not a component

Both maps are plain `Solid[]` — a shape, a position, a colour, a collider kind —
and `Solids.tsx` is the single reader. Three things follow:

**Every rule about how a piece is built lives in one place.** The `ROOM_SURFACE`
name, the shadow flags, the collider default, the fact that the transform sits on
the *mesh* rather than the body: a new map cannot get any of them wrong, because
it does not spell any of them out.

**A map says whether it is open to the sky, and hides its own lid.** The arena's
ceiling is `hidden` rather than absent: the lid still stops a jump leaving the
room and a chameleon can still cling to it and walk it upside down, but nothing
draws it, so the waiting room has weather. `sky` is a boolean rather than an
asset because the sky is a *shader* — drei's `Sky`, Preetham scattering with no
texture behind it. `<Environment>` is the one that fetches an HDR from a CDN and
blanks the scene on a network with no internet; see trap 3.

**A map carries its own round length.** `roundSeconds` is the whole playable
round — the hiding phase is carved out of it, not added to it — because a 40×40
arena and a 52×52 warren want very different amounts of time.

**A map carries its own size, and the server reads it.** `bound` is the
half-extent of the playable footprint and `mapLimit(id)` is what
`server/messages.ts` clamps every reported position to, minus the same 0.1 of
slack `ROOM_LIMIT` has always carried. This used to be `ROOM_LIMIT` for every
room in the game, which silently capped **every** map at the arena's 40×40: the
dungeon's outer rooms would have been walkable but unreportable, so everyone else
watched you stop dead at ±19.9 and slide along an invisible wall while your own
screen showed you walking on. Adding a map bigger than the arena means setting
`bound`; forgetting it is not a build error, it is that bug.

**A map carries its own spawn point.** `GameMap.spawn` is where a body's centre
starts, and it belongs to the map because it is a fact about that map's floor:
both maps put their floor's top face at y = 0 and spawn a body centre at 2,
clearing the tallest half-height (1.3, the hunter) by 0.7. Keep the drop
*small* — the world has no colliders while a map is loading, and every unit of
height is more time spent falling through a floor that is not there yet. The
array identity must stay stable, because `players/Player.tsx` passes it straight
to `RigidBody position`; the map table hands out the same array each time.

**A map's model list is derived, not declared.** `modelsIn` walks the solids, so
a piece cannot reference a file the map forgot to preload — which was previously
a hand-maintained array sitting beside the layout.

**The registry is readable by Node, and the server now reads it.**
`server/room.ts` imports `mapRoundSeconds` to find out how long a round on this
map lasts — the first thing outside the browser to read map data, and the reason
the constraint was worth keeping. It works because `maps.ts` and everything under
it import nothing but `paint/palette.ts` and `shared/protocol.ts`, **and because
they use relative `.ts` paths rather than the `@/` alias**, which only the bundler
resolves. Both halves of that are required: an `@/` import here fails at server
startup, not at build. **Importing a component into `maps.ts` closes the door
entirely**, which is the same rule `mapIds.ts` has always had and the reason
`Solids.tsx` is a separate file.

## Two kinds of piece, and when to use which

**Primitives** (`arena.ts`) cost nothing to download, let you pick a collider per
shape, hit `PAINT` hexes exactly, and give the climb probes clean flat normals.
Prefer them for anything expressible as boxes and cylinders. Adding a new one is
a case in `Shape` and a case in `geometryFor` — the type turns a missing second
half into a build error rather than a silently absent piece.

**Loaded models** (`dungeon.ts`) buy detail that primitives cannot, at the cost of
bytes in the repo and whatever the artist chose for colours. `{ kind: "model",
src }` and `Solids.tsx` handles the two things a model does not arrive with: the
`ROOM_SURFACE` name on every mesh, and the collider type you choose per piece.

## Adding a map

Export a `Solid[]` from `maps/`, add its id to `mapIds.ts` and an entry to
`maps.ts`. Nothing else: the menu and the lobby panel both list `MATCH_MAP_LIST`,
the server validates a chosen id against `MATCH_MAP_IDS`, `Room` renders it, and
its models are preloaded because they were derived from the pieces. `mapName`
turns an id off the wire into its label. `maps.ts` throws at import time if the
two files disagree, so a half-added map fails the build instead of showing an
empty menu entry or silently refusing a legitimate choice.

## Invariants

1. **`mapIds.ts`, `surface.ts` and `shapes.ts` must stay import-free**, and
   `maps.ts` and the tables under `maps/` must import only other import-free
   modules. The server validates a chosen map id, and the server is plain Node.
   `mapIds.ts` is what it reads today; the rest of the registry is now clean
   enough to read too, and keeping it that way costs nothing. Adding a React or
   three.js import anywhere in that set breaks `npm run dev` at startup, not at
   build — which is the loud, early failure this arrangement is designed for.
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
   where you already were. It stays in `MAP_IDS` because it is still a real map
   that `Room` renders.
5. **Every surface must be named `ROOM_SURFACE`.** That name is what
   `players/Player.tsx` filters on for the shot raycast, the ground test and the
   camera pull-in. A new piece without it is shot straight through, cannot be
   stood on, and the camera clips into it. `Solids.tsx` sets it on every piece of
   both kinds, which is most of why maps stopped being components.
6. **A non-box shape must name the collider it needs.** A `Solid`'s `colliders`
   goes to rapier's auto-generation: `cuboid` reads a bounding box (correct
   for boxes, including rotated ones like the ramp), `hull` wraps the real
   vertices (cylinders, cones, the crystal, the capsule), `ball` is the exact
   sphere, and the ring **must** be `trimesh` — a hull fills its hole in.
   Getting this wrong does not error; it just puts an invisible box around the
   piece.
7. **Everything tall has a way up.** Jump apex is `JUMP_SPEED²/2g` ≈ 3 units, so
   no step in the room is more than ~2: the ziggurat is three 1-unit tiers, the
   divider is a lip then a wall, the stairs rise 0.9 each onto a catwalk that
   dead-ends at the slab, and the big drum has a smaller drum beside it as its
   step. The cone, the capsule and the crystal are the deliberate exceptions — a
   chameleon who cannot reach the high ground has nowhere to hide but the corners.
8. **A map that loads files must suspend exactly once, before any `RigidBody`
   exists.** Each model piece calls `useGLTF`, so if the first piece to want a
   file were the one to fetch it, the map would suspend once *per file* — and
   React discards a suspended tree, so pieces that had already committed would
   have their rigid bodies torn down and rebuilt on every round. Rapier does not
   survive that: it panics with `unreachable` and every later call throws
   `recursive use of an object`, killing physics for the session. `Room`'s
   `Mounted` calls `useGLTF(map.models)` once, above `Solids`; the per-piece
   calls then read from cache. A primitive-only map passes `[]`, which drei
   resolves immediately — so both kinds of map take the same code path and
   nothing is conditional.
9. **Anything that changes the set of surfaces must call `bumpSurfaces`.**
   `players/Player.tsx` collects `ROOM_SURFACE` meshes and reuses the list for
   the shot raycast, the climb probes and the camera. It used to collect them
   once in a mount effect, which worked only because the arena was plain JSX and
   existed by then. A map built from files suspends, so the player mounted first,
   found nothing, and kept an empty list forever — no walls, no climbing, no
   shots, which reads exactly like "the controls are broken". `Room` bumps the
   counter when a map mounts and again when it unmounts, and the player
   re-collects on the next frame. **Standing up is no longer on this list**: the
   character controller finds the floor through rapier's own colliders, so an
   empty surface list now costs you shooting, climbing and the camera but still
   leaves you able to walk around — a smaller and much more confusing failure
   than the old one.
10. **A loaded model must be cloned per placement, and named.** One `Object3D`
    cannot be in two places, and the dungeon uses the same wall two dozen times.
    `Solids.tsx` clones in a `useMemo` — before render, so the `ROOM_SURFACE`
    names exist by the time `players/Player.tsx` collects them — and `clone(true)`
    shares geometry and materials, so every piece still draws from the one 17 KB
    atlas.
11. **Assets are committed uncompressed, beside their `.bin` and their texture.**
    No Draco: drei's decoder is fetched from a Google CDN, which trap 3 forbids.
     And `.gltf` rather than `.glb` on purpose here — the pack shares one
    atlas across every piece, so keeping it external means one download and one
    GPU texture, where `.glb` would embed a copy per file.
12. **The dungeon places every model in the pack, and a script enforces it both
    ways.** All 211 KayKit models are committed (6.3 MB) and all 211 are placed.
    `scripts/check-map-assets.mjs` — `npm run check:maps`, and in the pre-commit
    hook — fails if a committed `.gltf` under `public/maps/` is never placed, or
    if a placement names a file that is not committed. The second direction is
    the one that bites: a missing file leaves `Room` suspended forever, so the
    map simply never appears and the only clue is a failed fetch in the network
    tab. It reads `world/maps.ts` directly, which is only possible because that
    file and everything under it stay free of React and three.js.
13. **No wall in this pack is a door a hunter fits through, so hunter routes are
    gaps in the plan.** Measured off the geometry: the tallest aperture in any of
    the 32 wall models is `wall_open_scaffold` at 2.35 and the doorway frames are
    2.20, against a 2-tall chameleon and a **2.6-tall hunter**. `wall_doorway`
    and `wall_doorway_scaffold` are worse — they carry a door *leaf* inside the
    frame, so as built they are solid for everybody, which the old chamber's
    divider did not account for. A corridor is therefore floored cells with no
    wall between them. Put a doorway piece across a corridor and the hunt cannot
    reach the room behind it; nothing errors, the round is just unwinnable.
14. **The three pieces with a real hole go inside rooms, never in a seal.**
    `wall_doorway_Tsplit`, `wall_doorway_sides` and `wall_open_scaffold` are the
    only models with an unobstructed opening. Interior, they are a chameleon-only
    squeeze with a way round for everyone else, which is a good asymmetry. In the
    perimeter they are a hole a chameleon leaves the map through — which is why
    `wall_open_scaffold` is kept out of the `DROP_IN` list that the generator
    scatters along wall runs, despite being the right 4-unit width for it.
15. **A tall room next to a short one must be sealed above the short one's lid.**
    The generator walls the *difference* in courses from the taller side. Without
    it the volume between 4 and 8 above every corridor is an open attic: a
    chameleon climbs the hall wall, steps over the corridor's ceiling and walks
    the whole map at roof level. The bottom course stays open, which is the
    passage.
16. **Anything hung on a wall is positioned from the generated wall list, not by
    hand.** `spread()` distributes the 42 banners, the torches, the trophies and
    the shelves evenly over the ground-course wall slots the plan actually
    produced. Hand coordinates would be a banner floating in mid-air the first
    time a cell in `PLAN` changed from a room to rock, and nothing would report
    it.
17. **Nine pieces are painted in exact `PAINT` hexes.** Same table the swatch row
    renders. Pick the matching swatch, paint yourself, and you can test camouflage
    against a true match instead of eyeballing it. That is the whole point; do not
    "tidy" an arena colour to something off-palette.
18. **`hidden` is not the same as leaving a piece out.** The geometry stays, so
    rapier still builds its collider and — the part that matters — three still
    *raycasts* it. `Raycaster` tests an object's layers and that its material
    exists; it never looks at `visible`, on the object or on the material. So a
    hidden surface is still shot, still climbed, and still stops the camera. That
    is the whole reason the arena can be open to the sky without becoming a room
    you can jump out of. It is spelled on the *material* rather than the mesh —
    both work identically, and the material is the honest place to say "this
    surface has no appearance".
19. **The transform belongs to the mesh, not to the rigid body** — for
    primitives. Rapier derives the collider from the geometry as it stands
    relative to the body, so a body at the origin holding a placed mesh and a
    placed body holding a mesh at its origin are *not* interchangeable once
    rotation is involved: the arena's 18° ramp is the piece that moves. Models are
    the other way round, because a cloned glTF scene is placed whole. Both are in
    `Solids.tsx` and neither is a free choice.
20. **The arena's shell does not cast shadows, and that is not a perf tweak.**
    The one directional light is overhead, so a ceiling that cast would drop a
    shadow across the entire room and every interior would go black. `castShadow:
    false` on those six pieces is the fix; they still receive, which is what makes
    the cover read as solid.

## Contracts

- **Reads `ROOM_HALF` and `ROOM_LIMIT` from `shared/protocol.ts`.** `arena.ts`
  builds its shell from `ROOM_HALF` and the arena's `bound` is the same number;
  the gap between the two (20 vs 19.9) is the slack every map now gets through
  `mapLimit`, and it is deliberate rather than a rounding slip — see
  `shared/CLAUDE.md`.
- **`server/messages.ts` clamps to `mapLimit(room.state.map)`**, so the registry
  is read on every `state` and every `kill`. It was `ROOM_LIMIT` for all rooms
  until the dungeon outgrew the arena.
- **Reads `PAINT` from `paint/palette.ts`.**
- `players/Player.tsx` collects `ROOM_SURFACE` meshes from the scene graph
  whenever `surfaceRevision()` moves, which `Room` bumps on mount and unmount.
- `combat/Graves.tsx` deliberately does **not** use this name — a grave is paint
  on the floor and must not stop a bullet or the camera.

## Not built yet

The layout is fixed — no variants and no randomisation. The arena is 40×40×12
and lit by two plain lights in `Scene.tsx`, which are **not** linked to the sky's
sun — `SUN` in `Room.tsx` only aims the shader, so moving one does not move the
other. Fine while one map is outdoors; a second would want them tied. Nothing reads the map tables outside
the browser yet, though nothing stops it. There is exactly *one* spawn point per
map and everybody uses it, so a full lobby arrives in a match stacked on the same
square — and since players have no colliders against each other, they simply
overlap until they walk apart.
