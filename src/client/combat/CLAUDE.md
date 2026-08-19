# combat — the shotgun, and what it leaves behind

**Owns:** the gun, the viewmodel, the shot resolution, the wall marks and the
graves.

## What's here

| file            | what                                                    |
| --------------- | -------------------------------------------------------- |
| `shoot.ts`      | `resolveShot`: one raycast, people and walls together    |
| `Shotgun.tsx`   | the weapon a remote hunter carries                       |
| `Viewmodel.tsx` | the one in your own hands, riding the camera             |
| `Marks.tsx`     | wall marks and their tracers — three seconds, then gone  |
| `Graves.tsx`    | where somebody was found — permanent                     |

## The three rules that will bite you

1. **One raycast, people and walls together, and the nearer one wins.** Two
   casts let you shoot a chameleon through a wall, which is exactly the bug
   hiding is built to prevent.
2. **Graves are permanent and marks are not**, and that decides how each
   travels: a grave is schema state and arrives in a late joiner's backlog, a
   mark is a broadcast and is never stored. Getting it backwards gives you
   either invisible graves or a room full of ghost marks.
3. **A shot is broadcast separately from its mark.** `mark` is where the pellets
   landed; `shot` is where the gun was. A catch relays only `shot`, because
   there is no wall to mark — and it is still the same bang.

## Contracts

- **A kill is called by the shooter and checked by the server**, which refuses
  it in a lobby, outside the hunt phase, from a non-hunter, and against anyone
  who is already a hunter. The client's rate limit is for feel; the server's is
  what reaches everybody.
- **Graves are deliberately not named `ROOM_SURFACE`** — you cannot stand on one
  and you cannot shoot one.
- **Raycasts `remoteFigures`, which `players/RemotePlayers` publishes.** Known,
  acyclic.
- **The viewmodel rides the camera at frame priority 1**, it is not parented to
  it.

---

Twelve invariants, including the tracer's geometry and the known white-arms
regression: [docs/notes/combat.md](../../../docs/notes/combat.md).
