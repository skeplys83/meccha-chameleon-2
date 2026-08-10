# src/game — the map

Everything the game is, both halves of it. Each folder below owns one thing and
carries its own `CLAUDE.md`; **read the doc for the folder you are about to edit,
and update it in the same change.** A pre-commit hook enforces the second half.

## The folders

| folder | owns | read it before touching |
|---|---|---|
| `shared/` | `Role` and the constants both halves must agree on | anything the server also reads |
| `server/` | the Colyseus room, schema, UDP discovery, the HTTP bootstrap | messages, validation, authority |
| `net/` | the Colyseus **client**, remotes, LAN session list | joining, remote transforms |
| `world/` | the arena: shell, obstacles, `ROOM_SURFACE` | room layout, collision, cover |
| `figure/` | the stick figure rig, the poses, `PART_SHAPE` | proportions, poses, limb geometry |
| `paint/` | per-body canvases, the brush, the palette, the panel | painting, brushes, skins, colours |
| `players/` | the local player and the remote ones, `BODY` | controls, camera, movement, jumping |
| `combat/` | the shotgun, the viewmodel, marks, graves | shooting, death, hit feedback |
| `hud/` | the 2D overlays outside the Canvas | menus, legends, name entry |

Two files sit at this level because they are the composition roots and belong to
no single folder:

- `Game.tsx` — the top-level state machine: role, session, paused, painting,
  killed. Every mode transition in the game is decided here.
- `Scene.tsx` — the `Canvas`, the lights, the `Physics` world, and the mark and
  grave lifetimes.

## The one hard boundary

**`server/` is a different runtime.** It sits here for convenience, but it runs in
Node, never reaches the browser, and may import *only* from `shared/`. Nothing
outside `server/` may import from it either. Everything else in this tree is
browser code and may mix freely.

The client folders do lean on each other in both directions in two places, and
that is known rather than accidental:

- `paint/` ↔ `figure/` — the brush needs the real limb sizes (`figure/parts.ts`);
  the figure needs the canvases to wear (`paint/skin.ts`).
- `players/` ↔ `combat/` — `Player` fires the shot; `combat/shoot.ts` raycasts
  `remoteFigures`, which `players/RemotePlayers` publishes.

Both are acyclic at the module level. `hud/` is the one folder with a real rule:
it renders outside the Canvas and must not import from `world/`, `figure/`,
`players/` or `combat/` — it talks to the game through `Game.tsx` props and
through `net/`. Reading `POSES` for a label is the allowed exception.

## Cross-cutting rules that live nowhere else

**Never call into rapier from a React effect — only from `useFrame`.** A handle
touched after its world is gone (an HMR remount is enough) panics inside wasm:
the console shows one `RuntimeError: unreachable` followed by an endless flood of
`recursive use of an object detected which would lead to unsafe aliasing in
rust`. Once that happens the module is poisoned, *every* later rapier call
throws, physics is dead and the frame loop aborts halfway — which looks like the
player teleporting into the ground and the screen going white. `useFrame` is the
one place the world is guaranteed alive. Colliders are likewise swapped by React
(a `key` on `CuboidCollider`) rather than mutated in place.

**No CDN assets, ever.** `<Environment preset="city" />` fetches an HDR at
runtime and, under one `Suspense`, blanks the whole scene. Lighting is plain
lights. Name labels use drei `Html`, not `Text` — troika fetches a font. This is
a LAN game; there may be no internet at all.

**The two roles do not share a control scheme.** Only `WASD` and `Space` mean the
same thing to both. See `players/CLAUDE.md` for the full table and `hud/` for the
legend that must agree with it.
