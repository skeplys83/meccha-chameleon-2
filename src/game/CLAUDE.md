# src/game — the map

Everything the browser runs. Each folder below owns one thing and carries its
own `CLAUDE.md`; **read the doc for the folder you are about to edit, and update
it in the same change.** A pre-commit hook enforces the second half of that.

## The folders

| folder | owns | read it before touching |
|---|---|---|
| `core/` | `Role`, `BODY`, the paint palette, the pointer-lock handle | anything that needs a role or a colour |
| `net/` | the Colyseus client, LAN session list | messages, remote transforms, joining |
| `world/` | the arena: shell, obstacles, `ROOM_SURFACE` | the room layout, collision, cover |
| `figure/` | the stick figure rig, the poses, `PART_SHAPE` | proportions, poses, limb geometry |
| `paint/` | per-body canvases, the wire format, the panel | painting, brushes, skins |
| `players/` | the local player and the remote ones | controls, camera, movement, jumping |
| `combat/` | the shotgun, the viewmodel, marks, graves | shooting, death, hit feedback |
| `hud/` | the 2D overlays outside the Canvas | menus, legends, name entry |

Two files sit at this level because they are the composition roots and belong to
no single folder:

- `Game.tsx` — the top-level state machine: role, session, paused, painting,
  killed. Every mode transition in the game is decided here.
- `Scene.tsx` — the `Canvas`, the lights, the `Physics` world, and the mark and
  grave lifetimes.

## How the folders may depend on each other

`core/` depends on nothing and everything may use it. Otherwise the rule is that
a dependency should be obvious from the game, not from the file tree:

- `paint/` reads `figure/parts.ts` — the brush has to know the real size of the
  limb it is drawing on.
- `players/` is the busiest importer: it composes `figure/`, `world/`, `paint/`
  and `net/`, because the local player *is* where input, physics and the network
  meet.
- `combat/` reads `players/RemotePlayers` for `remoteFigures`, the raycast
  targets a shot can hit.
- `hud/` renders outside the Canvas and must never import from `world/`,
  `figure/` or `players/`. It talks to the game through `Game.tsx` props and
  through `net/`.

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
