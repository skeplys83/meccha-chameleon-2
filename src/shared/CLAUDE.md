# shared — what both halves have to agree on

**Owns:** `Role`, `Phase`, the durations and limits both sides read, and the map
registry.

**Imported by `src/server/` and `src/client/`, and it may import from neither.**
That is an ESLint rule. It also has to load in a Node process with no bundler
and no DOM, so nothing here may touch `window`, React or three.js.

## What's here

| file         | what                                                            |
| ------------ | ----------------------------------------------------------------- |
| `protocol.ts`| `Role`, `Phase`, phase durations, fire and whistle rates, bounds  |
| `mapIds.ts`  | the map ids, the lobby map, and which ones a match may use       |
| `maps.ts`    | the registry: name, file, spawn, bound, `roundSeconds`, lighting |

## The three rules that will bite you

1. **Nothing here may be defined twice.** `scripts/check-constants.mjs` runs in
   the pre-commit hook and fails if a constant defined here is *re-defined*
   anywhere under `src/`. This whole folder exists to prevent that one class of
   bug, which has been reintroduced before.
2. **Only add something both sides read.** Server-only tunables (`PATCH_MS`,
   the sweep interval) belong in `server/`; client-only ones belong in the folder
   that uses them. A constant here is a promise that both halves obey it.
3. **`ROOM_LIMIT` is deliberately not `ROOM_HALF`.** 19.9 against 20 is the
   margin that stops a client's own rounding reading as cheating. `mapLimit`
   applies the same margin per map, because the dungeon is 52 across and the
   arena 40 — a single global bound amputated whichever map was bigger.

## Contracts

- **`maps.ts` is read by the server** for `mapRoundSeconds` and `mapLimit`, and
  by the client for everything else. It is pure data, which is why it lives here
  rather than in `client/world/`.
- **`POSE_COUNT` is checked against `figure/poses.ts`** at import time.
- **Leave codes (`LEAVE_IN_PROGRESS`, `LEAVE_STARTING`) are here** rather than as
  a bare `4001` written twice.

---

The longer version: [docs/notes/shared.md](../../docs/notes/shared.md).
