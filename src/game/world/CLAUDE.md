# world — the arena

**Owns:** the room everyone plays in: the shell, the twenty-five pieces of
cover, and the `ROOM_SURFACE` name that shots and the camera filter on.

**Entry points:** `Room`, `ROOM_SURFACE`, `ROOM_HALF`.

## Files

- `Room.tsx` — renders whichever map the room is playing. Four lines.
- `maps.ts` — the registry: every map's id, name, blurb and component.
- `mapIds.ts` — the ids alone, **import-free on purpose**.
- `surface.ts` — `ROOM_SURFACE`, alone for the same reason.
- `Piece.tsx` — one loaded glTF model, placed. The counterpart of `Solid` for
  maps built from files.
- `maps/arena.tsx` — the 40×40 arena, built from primitives via the local `Solid`
  helper: twenty-five pieces, no downloaded assets, exact palette colours.
- `maps/dungeon.tsx` — a 12×12 KayKit chamber, built from `Piece` and a layout
  table. Assets in `public/maps/dungeon/`.

## Two kinds of map, and when to use which

**Primitives** (`arena.tsx`) cost nothing to download, let you pick a collider per
shape, hit `PAINT` hexes exactly, and give the climb probes clean flat normals.
Prefer them for anything expressible as boxes and cylinders.

**Loaded models** (`dungeon.tsx`) buy detail that primitives cannot, at the cost
of bytes in the repo and whatever the artist chose for colours. Use `Piece`,
which handles the two things a model does not arrive with: the `ROOM_SURFACE`
name on every mesh, and a collider type you choose per piece.

## Adding a map

Drop a component in `maps/`, add its id to `mapIds.ts` and an entry to `maps.ts`.
Nothing else: the menu lists whatever is in the table, the server validates a
chosen id against it, and `Room` renders it. `maps.ts` throws at import time if
the two files disagree, so a half-added map fails the build instead of showing an
empty menu entry or silently refusing a legitimate choice.

## Invariants

1. **`mapIds.ts` and `surface.ts` must stay import-free.** The server validates a
   chosen map id, and the server is plain Node — it cannot import `maps.ts`,
   which pulls in React components and three.js. Splitting the ids out is what
   lets both halves share them. Adding an import to either file breaks
   `npm run dev` at startup, not at build.
2. **A map id is a wire value.** It is chosen in the menu, stored in room state
   and read by every client. Add ids freely; rename one and you break anybody
   mid-session, the same as renaming a message.
3. **The map is fixed for a room's life**, chosen by whoever opened it. Swapping
   geometry under players standing on it has no sane outcome, and a map chosen
   per client would put people inside walls their opponents cannot see.
4. **Every surface must be named `ROOM_SURFACE`.** That name is what
   `players/Player.tsx` filters on for the shot raycast, the ground test and the
   camera pull-in. A new piece without it is shot straight through, cannot be
   stood on, and the camera clips into it. `Solid` sets it for you — hand-rolled
   geometry must not forget.
5. **A non-box shape must name the collider it needs.** `Solid`'s `colliders`
   prop goes to rapier's auto-generation: `cuboid` reads a bounding box (correct
   for boxes, including rotated ones like the ramp), `hull` wraps the real
   vertices (cylinders, cones, the crystal, the capsule), `ball` is the exact
   sphere, and the ring **must** be `trimesh` — a hull fills its hole in.
   Getting this wrong does not error; it just puts an invisible box around the
   piece.
6. **Everything tall has a way up.** Jump apex is `JUMP_SPEED²/2g` ≈ 3 units, so
   no step in the room is more than ~2: the ziggurat is three 1-unit tiers, the
   divider is a lip then a wall, the stairs rise 0.9 each onto a catwalk that
   dead-ends at the slab, and the big drum has a smaller drum beside it as its
   step. The cone, the capsule and the crystal are the deliberate exceptions — a
   hider who cannot reach the high ground has nowhere to hide but the corners.
7. **A map that loads files must suspend exactly once, before any `RigidBody`
   exists.** Each `Piece` calls `useGLTF`, so if the first piece to want a file
   were the one to fetch it, the map would suspend once *per file* — and React
   discards a suspended tree, so pieces that had already committed would have
   their rigid bodies torn down and rebuilt on every round. Rapier does not
   survive that: it panics with `unreachable` and every later call throws
   `recursive use of an object`, killing physics for the session. `dungeon.tsx`
   loads all seven models in one `useGLTF(PIECES)` at the top of the component;
   the per-piece calls below then read from cache.
8. **Anything that changes the set of surfaces must call `bumpSurfaces`.**
   `players/Player.tsx` collects `ROOM_SURFACE` meshes and reuses the list for
   the shot raycast, the ground ray, the climb probes and the camera. It used to
   collect them once in a mount effect, which worked only because the arena is
   plain JSX and exists by then. A map built from files suspends, so the player
   mounted first, found nothing, and kept an empty list forever — no floor, no
   walls, no climbing, no shots, which reads exactly like "the controls are
   broken". `Room` bumps the counter when a map mounts and again when it
   unmounts, and the player re-collects on the next frame.
9. **A loaded model must be cloned per placement, and named.** One `Object3D`
   cannot be in two places, and the dungeon uses the same wall two dozen times.
   `Piece` clones in a `useMemo` — before render, so the `ROOM_SURFACE` names
   exist by the time `players/Player.tsx` collects them in its mount effect — and
   `clone(true)` shares geometry and materials, so every piece still draws from
   the one 17 KB atlas.
10. **Assets are committed uncompressed, beside their `.bin` and their texture.**
   No Draco: drei's decoder is fetched from a Google CDN, which a LAN game cannot
   reach. And `.gltf` rather than `.glb` on purpose here — the pack shares one
   atlas across every piece, so keeping it external means one download and one
   GPU texture, where `.glb` would embed a copy per file.
11. **Only the pieces a map uses are copied in.** KayKit's pack is 6.3 MB across
   211 models; the dungeon needs seven, which is 204 KB including the atlas.
12. **Nine pieces are painted in exact `PAINT` hexes.** Same table the swatch row
   renders. Pick the matching swatch, paint yourself, and you can test camouflage
   against a true match instead of eyeballing it. That is the whole point; do not
   "tidy" an arena colour to something off-palette.

## Contracts

- **Reads `ROOM_HALF` from `shared/protocol.ts`**, which `server/room.ts` also
  reads as `ROOM_LIMIT`. They describe the same bound and are no longer two
  constants — but they are deliberately *different numbers* (20 vs 19.9); see
  `shared/CLAUDE.md`.
- **Reads `PAINT` from `paint/palette.ts`.**
- `players/Player.tsx` collects `ROOM_SURFACE` meshes once from the scene graph
  on mount, because the room is static. If the arena ever gains pieces that
  appear or move at runtime, that collection has to become dynamic.
- `combat/Graves.tsx` deliberately does **not** use this name — a grave is paint
  on the floor and must not stop a bullet or the camera.

## Not built yet

The layout is fixed — no variants, no randomisation, no second map. The arena is
40×40×12 and lit by two plain lights in `Scene.tsx`.
