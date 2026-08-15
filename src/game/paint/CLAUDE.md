# paint — drawing on yourself

**Owns:** the per-player canvas, the brush, the palette, the compact wire
format for a stroke, and the panel that mixes colours.

**Entry points:** `getSkin` / `paint` / `clearSkin` / `forgetSkin` /
`forgetAllSkins` / `encodeStroke` / `decodeStroke` / `SELF`
from `skin.ts`; `Brush` / `DEFAULT_BRUSH` from
`brush.ts`; `PaintPanel`.

## Files

- `skin.ts` — one canvas per player id, its pixels, the stroke history and its
  encoding.
- `brush.ts` — `Brush`, `DEFAULT_BRUSH`, `MIN_SIZE`, `MAX_SIZE`.
- `eyedropper.ts` — the pending screen-pixel pick, handed from the click that
  arms it to the frame that reads it.
- `palette.ts` — `PAINT`, the ten presets, and `SWATCHES`.
- `surface.ts` — the model as a paintable surface: triangles indexed by UV and
  by position, which texels the body covers, and `dab`, which paints a sphere
  onto it and pads the result into the gutter.
- `brushCursor.ts` — the cursor end: raycast your own figure, place the hover
  ring, lay strokes down as the mouse drags, and report when a drag starts or
  ends.
- `PaintPanel.tsx` — colour wheel, brightness slider, brush size, clear, pin.

## Invariants

1. **A dab is a sphere on the body, not a circle on the texture.** Painting
   raycasts the cursor against your own figure, and the hit's UV says *where on
   the body* the brush landed; `surface.ts` then paints every texel whose own
   surface point is inside a sphere of the brush's radius around it.

   **Drawing the circle in texture space instead was wrong in two visible ways,
   and both were reported as bugs before this existed.** A dab reaching the edge
   of a UV island spilled onto whatever island was packed beside it — paint
   appearing on a limb you never touched — and the same dab was cut along the
   seam, leaving a torn, notched edge. Neither is tunable: a circle in UV is
   simply not a circle on a body. Measured after the change: over 40 dabs spread
   across the body, the furthest painted texel sits 0.0600 from the centre of a
   0.060 brush and **no texel lands outside it at all**.

   **One canvas per body, and one continuous unwrap.** The body is a single
   skinned mesh wearing a single 1024² texture, unwrapped in Blender. There is
   no per-part anything: a stroke is a point in that unwrap, and `Stroke` is
   `{u, v, size, color}`.
2. **Brush size is an absolute radius in figure-local units** and is compared in
   those units, against distances on the body itself. Nothing converts it into
   texture space any more, so it needs no knowledge of how the model is
   unwrapped and cannot drift when the model is re-unwrapped. It is the same
   physical dot on a forearm as on the head by construction, not by measurement.
3. **Seams stop existing as far as the brush is concerned.** Both sides of a cut
   are painted by the same sphere test, so a stroke crossing one is continuous
   on the body even though it is two disconnected patches in the texture. This
   is the whole reason for painting in 3D rather than in UV.
4. **A dab may not wrap onto a surface facing away from the one it hit.**
   `FACING_MIN` in `surface.ts`: without it, painting between the thighs paints
   the far one too, because a sphere does not care that the body is in the way.
5. **Every dab is padded into the gutter around the islands it touched.** A
   texture is filtered — bilinear, then mipmaps — so at the edge of a UV island
   the GPU mixes painted texels with the empty space beside them, and on a white
   canvas that reads as **a white hairline tracing every seam across the body**.
   `PAD_TEXELS` in `surface.ts` floods the dab's own colour six texels outward
   into anything the model does not cover.

   **The flood starts from this dab's texels, not from a precomputed map.** A
   gutter texel can sit between two islands and can only mirror one of them; a
   one-time map picks a winner in advance, and when the *other* island is the
   one being painted the seam comes back. Measured: a precomputed map left 3.6%
   of island-edge gutter texels bare, and flooding per dab leaves 0.00%.
6. **The brush edge is sharp.** `FEATHER` is 5% of the radius — about one texel
   at the default size — which exists only so the boundary is not a staircase of
   hard texels. It is not a soft brush and should not become one.
7. **Painting needs no mode, only a free cursor.** Anyone whose pointer is not
   locked — always a chameleon — paints by left-dragging on their own body and turns
   the camera by right-dragging *off* their body — right-dragging *on* it sizes
   the brush instead. Hovering the body pops the panel open on its
   own; it lingers after the cursor leaves so you can reach it, and the header
   pins it.
8. **The pin is how a *hunter* paints.** Pinning releases their pointer lock and
   drops them to third person, so they can see their own figure. `Game.tsx` has
   to know about that, or losing the lock would raise the pause menu instead.
9. **`SELF` is the local player's key in these maps**, remotes use their Colyseus
   session id. **The hunter's first-person arms no longer wear it.** They are
   capsules, and the model's unwrap scatters each limb across several islands,
   so there is no rectangle of the texture that means "forearm" to map them
   into. They are plain white until they are built from the model's own
   geometry — see `combat/CLAUDE.md`, invariant 11.
10. **Paint never survives leaving a room, by any door.** Joining, respawning,
   being carried into a match and being carried home again all arrive unpainted,
   yours and everyone else's: `Game.tsx` calls `forgetAllSkins()` on every join
   *and* from `onLeftRoom`, which `net/` fires at each of the three ways a room
   ends. That also clears the leftover skins of whoever was in the last session,
   keyed by session ids that will never be seen again.

   **The hand-off used to be the exception, and reversing this is a design
   decision rather than a fix.** `encodedHistory` existed solely so
   `net/client.ts` could replay your own strokes into the match, on the reasoning
   that you paint yourself in the waiting room while people arrive and arriving
   stripped makes the waiting room pointless. That reasoning has not stopped
   being true: the arena's nine palette-matched pieces exist so a chameleon can test
   camouflage against an exact match, and that preparation no longer travels with
   them — painting is now a lobby activity that ends at Start. `encodedHistory`
   is deleted rather than left for a second caller to find, so putting it back
   means restoring it plus a replay in `move()` and dropping `forgetAllSkins`
   from the `onLeftRoom` handler.
11. **A drag is throttled by UV distance, not by time.** `PAINT_STEP` in
   `brushCursor.ts` — a smear at 60 fps would otherwise be hundreds of
   near-identical strokes, all of them sent and stored.
12. **A press or a live drag may land slightly off the body.** A limb is a few
    pixels wide at its tip, so a stroke running off the end of an arm used to
    stop dead. `EDGE_RINGS` in `brushCursor.ts` fires rays in rings out to 19 px
    and takes the first hit. **Hovering deliberately does not**, and casts once:
    a ray against a skinned mesh transforms every triangle by its bones, so two
    dozen of them per mouse move would cost more than the convenience is worth.
13. **`createBrushCursor` takes getters, not values.** The figure and the ring
   mount after the handlers are installed, and the brush changes while they are
   live; reading them through getters is what lets the pointer handlers be bound
   exactly once, which is the invariant `Player.tsx` depends on.

## Contracts

- **Reads `figure/model.ts`** for `characterGeometry()`, the bind-space mesh
  every body shares. `parts.ts` is gone: `PARTS`, `PART_SHAPE` and the atlas
  went with the per-part model, and no constant replaced them — the brush works
  in the body's own units now.
- **`surface.ts` is built once, lazily, the first time anybody paints** — 10 ms
  for 9,564 triangles, including rasterising the coverage mask the padding needs
  — and is shared by every player's canvas, because it describes the model
  rather than any one body. Dabs after that are ~0.2 ms.
- **The body mesh is found by `userData.body`**, and the hit's UV is used as-is.
- **Reads `MAX_STROKES` from `shared/protocol.ts`**, the same cap the server
  keeps in schema.
- **`encodeStroke` output must stay under `MAX_STROKE_LENGTH` (40).** It is
  currently ~24 characters: `u,v,size,rrggbb`, each number to three decimals.
  The part index it used to carry went with the per-part model. Adding a field to `Stroke` means checking that budget and updating
  `decodeStroke`, which is the only validation on the way back in.
- `players/Player.tsx` owns the pointer handlers and the 100 ms batch flush, and
  builds the ring mesh at `brush.size × hy`; `brushCursor.ts` owns the raycast,
  where the ring goes and when a stroke happens. It hands each encoded stroke
  back through `onStroke` and never talks to `net/` itself.
- **`onDrawingChange` reports the start and end of a drag, and nothing more.**
  This folder does not import `sound/` — it says a drag began; `players/Player.tsx`
  decides that means a looping brush sound. The callback exists rather than
  leaving the caller to watch `begin`/`end`/`cancel`, because `cancel` is the one
  that gets forgotten and the symptom is a brush still scrubbing behind the pause
  menu.
- `net/` calls `paint`, `clearSkin` and `forgetSkin` for remote players.
- **Nine arena pieces are painted in exact `PAINT` hexes, so a preset is a true
  match for something you can lie against** — camouflage is not testable
  otherwise. Those colours now live in `levels/arena.blend` as one material per
  hex rather than in a table that imported this file, so **nothing enforces the
  match any more**: changing a preset here silently stops it matching the room.
  Never "tidy" a preset without opening the .blend. See `world/CLAUDE.md`,
  invariant 16.

## Not built yet

No undo and no per-part erase — only "clear paint", which wipes the whole body.
No way to paint anyone but yourself, and no persistence between sessions.
