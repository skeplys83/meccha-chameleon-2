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

## The four rules that will bite you

1. **A dab is a sphere on the body, not a circle on the texture.** It is applied
   in 3D and projected, so it wraps a limb the way paint would. Brush size is an
   absolute radius in figure-local units, which is why it looks the same on an
   arm and on a torso.
2. **Every dab is padded into the gutter around the islands it touched**, and
   seams stop existing as far as the brush is concerned. Skip either and a
   stroke across a seam shows a hairline of bare texture at every mip level.
3. **A drag is spaced by the brush, and the gap between mouse events is filled
   in.** Two separate reasons a fast smear used to come out as dots:

   - The spacing was a flat `0.012` in UV. A dab's radius in UV is about half
     the brush size, so at `MIN_SIZE` (0.015) it was 0.0075 — **smaller than
     the step**, and the smallest brush laid down dabs that did not touch even
     at a crawl. The step is now `0.2 × size`.
   - One mouse move is one dab, and a flick produces few moves. The skipped
     segment is now walked and a dab laid at each step, **by re-casting the ray
     at points along it** rather than by interpolating UV — the unwrap has
     seams, and a straight line across one runs through unrelated parts of the
     atlas. Every filled dab is a real hit with its own UV.

   Filling costs strokes: a fast drag now sends up to `MAX_FILL` (16) times as
   many. `MAX_STROKES` on the server is 800 per player and drops the oldest, so
   a heavy painter reaches that sooner — only late joiners see the difference,
   since the local canvas is never replayed.
4. **Paint never survives leaving a room, by any door.** Joining, respawning and
   being carried to a match all clear it; `net/` re-sends yours on arrival,
   which is what makes painting yourself in a lobby worth doing. The strokes are
   *state* on the server, not a broadcast, so a late joiner is handed everyone's.

## The eyedropper picks albedo, not the pixel

**Paint is albedo.** A skin is a `map` on a `MeshStandardMaterial`, so whatever
the picker returns is lit and tone-mapped like every other surface. Returning
the *drawn pixel* therefore applies the room's lighting twice: pick a floor
rendering at 40% brightness, paint it on, and the body renders at 16%. That was
"I picked the ground and it came out way darker", and it got worse the darker
the map — obvious in the dungeon, barely visible in the arena.

Albedo against albedo is also just what camouflage is. Two surfaces with the
same base colour under the same light render the same colour.

So `albedo.ts` raycasts the drawn geometry on the click itself and returns
`material.color` times the texel under the hit UV. Both maps make that exact:
the arena's twelve materials are untextured and **named for their own hex**
(11 of 12 round-trip to their own name through the linear→sRGB conversion; the
twelfth is just called "Material"), and the dungeon is one 1024² atlas with a
white base factor. Neither has vertex colours. It needs no frame at all — the
ray is cast in the pointer handler.

**Skinned meshes are excluded on purpose.** `SkinnedMesh.raycast` costs ~6 ms a
ray (see `pick.ts`), so with several players on screen one click would drop a
frame. The cost is that you cannot pick another player's paint; scenery is the
point.

### The framebuffer read is still there, as the fallback

When the ray hits nothing solid — sky, background — `eyedropper.ts` reads the
drawn pixel at frame priority 3 instead, which for something unlit is right.

**The trap there is that `FrameLimiter` does not draw every frame.** It caps at
60 fps by skipping `gl.render` outright, so on a 120 Hz display half of all
frames draw nothing, and a read on one of those returns zeroes — `#000000`. A
pick is therefore only *taken* on a frame that drew, and stays pending
otherwise. **Anything else that takes over `gl.render` must call `markDrawn`.**

## What makes everyone's copy of a body identical

Paint is replicated as **strokes, not pixels** — a list of
`u,v,size,color` replayed on every client. Three things have to hold for that
to land on the same image everywhere, and two of them already did:

- **The rasteriser is deterministic.** A dab is raw arithmetic into an
  `ImageData`, never a canvas-2D `arc()` or `fill()`, so no browser's
  antialiasing gets a vote. Same canvas size (1024², fixed), same model, same
  floats, same pixels.
- **Order is preserved.** One sender, one socket.
- **The numbers have to be the same numbers.** `encodeStroke` rounds to three
  decimals — half a texel — and the painter used to apply the *unrounded* hit
  locally while sending the rounded one. Your own body was the one copy nobody
  else could see. Dabs are now painted from the decoded wire form, so every
  canvas is fed byte-identical input.

**The hole that is left is `MAX_STROKES`.** The server keeps the last 800 per
player and drops the oldest, and a client re-sends its whole history on entering
a room. Anyone watching live sees every stroke; anyone who *replays* the list —
a late joiner, and **the hunter arriving from the lobby is always one** — sees
the last 800. Past that they get a body missing its earliest strokes, which
shows as bare white where the first pass went.

How much 800 buys, at the current spacing:

| brush | step | travel that fits |
| ----- | ---- | ---------------- |
| min (0.015) | 0.0030 UV | ~2 UV units |
| default (0.06) | 0.0120 UV | ~10 UV units |
| max (0.5) | 0.1000 UV | ~80 UV units |

So a thorough job with a small brush overruns it. Two ways out, in order of
what they buy: make a stroke a **segment** (`u0,v0 → u1,v1`, rasterised as a
capsule) so one mouse move is one stroke instead of up to sixteen — smoother
*and* five to sixteen times cheaper — or simply raise `MAX_STROKES`, which is
one number and grows the schema.

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
