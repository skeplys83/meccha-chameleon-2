# paint — camouflage, and the brush that puts it on

**Owns:** the per-player canvases, the brush, the palette, the eyedropper, and
the panel they are driven from.

## What's here

| file              | what                                                       |
| ----------------- | ----------------------------------------------------------- |
| `skin.ts`         | one canvas per player, and the stroke encoding on the wire  |
| `surface.ts`      | where a dab lands on the texture, and the seam handling     |
| `brushCursor.ts`  | the drag: hit-testing the body, the ring, the stroke stream |
| `brush.ts` `palette.ts` `pick.ts` `eyedropper.ts` | size, colour, hit-testing, screen sampling |
| `PaintPanel.tsx`  | the palette UI                                              |

## The three rules that will bite you

1. **A dab is a sphere on the body, not a circle on the texture.** It is applied
   in 3D and projected, so it wraps a limb the way paint would. Brush size is an
   absolute radius in figure-local units, which is why it looks the same on an
   arm and on a torso.
2. **Every dab is padded into the gutter around the islands it touched**, and
   seams stop existing as far as the brush is concerned. Skip either and a
   stroke across a seam shows a hairline of bare texture at every mip level.
3. **Paint never survives leaving a room, by any door.** Joining, respawning and
   being carried to a match all clear it; `net/` re-sends yours on arrival,
   which is what makes painting yourself in a lobby worth doing. The strokes are
   *state* on the server, not a broadcast, so a late joiner is handed everyone's.

## Contracts

- **`SELF` is the local player's key**; remotes use their Colyseus session id.
- **Painting needs no mode, only a free cursor** — anyone not holding the pointer
  lock can paint, which is why a hunter has to open the palette to do it.
- **`createBrushCursor` takes getters, not values.** The figure and the ring are
  rebuilt under it; captured references go stale mid-drag.
- **Reads real limb sizes from `figure/parts.ts`**; `figure/` reads the canvases
  back. Known, acyclic.
- **`MAX_STROKES`, `MAX_STROKE_LENGTH` and `MAX_STROKE_BATCH` are in
  `shared/protocol.ts`** — the server clamps against the same numbers.

---

Fourteen invariants, the projection maths, and the one remaining cost:
[docs/notes/paint.md](../../../docs/notes/paint.md).
