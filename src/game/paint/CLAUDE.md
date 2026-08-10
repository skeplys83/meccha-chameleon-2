# paint — drawing on yourself

**Owns:** the per-player canvases, the brush, the compact wire format for a
stroke, and the panel that mixes colours.

**Entry points:** `getSkin` / `paint` / `clearSkin` / `encodeStroke` /
`decodeStroke` / `SELF` from `skin.ts`; `Brush` / `DEFAULT_BRUSH` from
`brush.ts`; `PaintPanel`.

## Files

- `skin.ts` — canvases keyed by player id, the draw call, the stroke history and
  its encoding.
- `brush.ts` — `Brush`, `DEFAULT_BRUSH`, `MIN_SIZE`, `MAX_SIZE`.
- `PaintPanel.tsx` — colour wheel, brightness slider, brush size, clear, pin.

## Invariants

1. **Painting is UV painting, not decals.** Every body part owns a 256² canvas
   used as its material `map`. Painting raycasts the cursor against your own
   figure and draws a dot at the reported `uv` — the raycast hands back exactly
   the coordinate the texture is drawn in, so no unwrapping is needed.
2. **Brush size is an absolute radius in figure-local units, not a fraction of a
   texture.** Each part's texture wraps a different circumference, so the same
   fraction painted a far bigger mark on the head than on a forearm. `skin.ts`
   converts per part using `figure/parts.ts`, and the brush becomes an *ellipse*
   in texture space — U spans the circumference, V spans the length plus the two
   caps — so it lands as a circle on the body.
3. **A dot near a capsule seam is drawn twice.** Capsule UVs wrap, so a dot
   within one radius of either edge is repeated on the far side or the seam
   shows a hard cut.
4. **Painting needs no mode, only a free cursor.** Anyone whose pointer is not
   locked — always a hider — paints by left-dragging on their own body and turns
   the camera by right-dragging. Hovering the body pops the panel open on its
   own; it lingers after the cursor leaves so you can reach it, and the header
   pins it.
5. **The pin is how a *seeker* paints.** Pinning releases their pointer lock and
   drops them to third person, so they can see their own figure. `Game.tsx` has
   to know about that, or losing the lock would raise the pause menu instead.
6. **`SELF` is the local player's key in these maps**, remotes use their Colyseus
   session id. `Viewmodel` draws the seeker's own arms from `SELF`'s canvases, so
   a seeker sees their own paint in first person.
7. **The history is what survives a respawn.** A respawn joins as a brand new
   player, so `net/client.ts` replays `encodedHistory(SELF)`. Trimming the
   history below the server's cap silently loses paint.

## Contracts

- **Reads `figure/parts.ts`** for `PARTS` and `PART_SHAPE`. The brush maths and
  the capsule geometry must come from the same radii — see `figure/CLAUDE.md`.
- **Reads `MAX_STROKES` from `shared/protocol.mjs`**, the same cap the server
  keeps in schema.
- **`encodeStroke` output must stay under `MAX_STROKE_LENGTH` (40).** It is
  currently ~30 characters: `partIndex,u,v,size,rrggbb`, each number to three
  decimals. Adding a field to `Stroke` means checking that budget and updating
  `decodeStroke`, which is the only validation on the way back in.
- `players/Player.tsx` owns the raycast, the hover ring and the 100 ms batch
  flush; this folder owns what a stroke *is* and what it draws.
- `net/` calls `paint`, `clearSkin` and `forgetSkin` for remote players.
- `core/palette.ts` supplies the swatch row.

## Not built yet

No undo and no per-part erase — only "clear paint", which wipes the whole body.
No way to paint anyone but yourself, and no persistence between sessions.
