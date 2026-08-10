# shared — what the client and the server both have to believe

**Owns:** the handful of constants that would be a bug if the two halves of the
app disagreed about them.

**Entry points:** `@/shared/protocol.mjs` from TypeScript,
`../src/shared/protocol.mjs` from `server/`.

## Files

- `protocol.mjs` — `ROOM_HALF`, `ROOM_LIMIT`, `POSE_COUNT`, `MAX_STROKES`,
  `MAX_STROKE_LENGTH`.

## Invariants

1. **It is `.mjs`, not `.ts`, and must stay that way.** The server is plain Node
   with no build step and cannot import TypeScript. TypeScript reads this file
   directly via `allowJs`, so the client still gets exact literal types (the
   `@type {19.9}` JSDoc tags are what pin them) — the arrangement only works in
   that direction. Turning this into a `.ts` file breaks `npm run dev` instantly.
2. **Only add something both sides read.** Server-only tunables (`PATCH_MS`,
   `MAX_GRAVES`, the discovery timings) live in `server/`; client-only ones live
   in the folder that owns them. A shared module that accumulates unrelated
   constants is just a second global object, and the point here is the opposite.
3. **`ROOM_LIMIT` is deliberately not `ROOM_HALF`.** 19.9 vs 20 is a real
   distinction, not a rounding slip — see the comment on the constant and
   `players/CLAUDE.md` for why the margin is that thin.

## Contracts

- `world/Room.tsx` builds the arena shell from `ROOM_HALF`.
- `server/room.mjs` clamps movement to `ROOM_LIMIT` and pose indices to
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
`killed`) are still string literals typed out on both sides. They could live
here too; they have not caused a bug yet, so they have not been moved.
