# shared — what the browser and the server both have to believe

**Owns:** `Role`, plus the handful of constants that would be a bug if the two
halves of the app disagreed about them.

**Entry points:** `@/game/shared/protocol` from the client,
`../shared/protocol.ts` from `server/`.

## Files

- `protocol.ts` — `Role`, `ROOM_HALF`, `ROOM_LIMIT`, `POSE_COUNT`,
  `MAX_STROKES`, `MAX_STROKE_LENGTH`.

## Invariants

1. **Only add something both sides read.** Server-only tunables (`PATCH_MS`,
   `MAX_GRAVES`, the discovery timings) live in `server/`; client-only ones live
   in the folder that owns them. A shared module that accumulates unrelated
   constants is just a second global object, and the point here is the opposite.
2. **`ROOM_LIMIT` is deliberately not `ROOM_HALF`.** 19.9 vs 20 is a real
   distinction, not a rounding slip — see the comment on the constant and
   `players/CLAUDE.md` for why the margin is that thin.
3. **This file must stay import-free.** It is loaded by a Node process with no
   bundler and by the browser bundle; pulling anything else in drags that
   dependency into both. It currently imports nothing, and should not start.

## Contracts

- `Role` is used by the client everywhere and stored in schema by the server,
  which checks it before honouring a kill. It is protocol, not decoration —
  that is why it lives here rather than in a client folder.
- `world/Room.tsx` builds the arena shell from `ROOM_HALF`.
- `server/room.ts` clamps movement to `ROOM_LIMIT` and pose indices to
  `POSE_COUNT`.
- `figure/poses.ts` **throws at import time** if `POSES.length !== POSE_COUNT`.
  That is the drift guard: it fails `next build` during prerender with an
  explanatory message rather than letting a fifth pose silently never reach
  anyone else's screen. If you add a pose, change `POSE_COUNT` here in the same
  edit — the build will tell you if you forget.
- `paint/skin.ts` trims its replay history to `MAX_STROKES`, the same cap the
  server keeps in schema. A smaller client cap would silently lose paint on
  respawn, since the respawn replay is what restores it.

## Not built yet

Message *names* (`state`, `paint`, `shoot`, `kill`, `clearSkin`, `mark`,
`killed`) are still string literals typed out on both sides, as is the shape of
each payload — `net/client.ts` hand-mirrors the `Player` schema in a comment.
Now that both halves are TypeScript those could be real shared types. They have
not caused a bug yet, so they have not been moved.
