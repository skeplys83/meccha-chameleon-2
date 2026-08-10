# net — the client half of the network

**Owns:** the Colyseus connection, everyone else's live transforms, the event
streams the scene subscribes to, and the LAN session list.

**Entry point:** `@/game/net` (`index.ts`). Import from there, not from the
individual modules — the split is an implementation detail.

The other half is `server/`. Every message named below has a handler there.

## Files

- `connection.ts` — the one live `Room` handle, plus `selfId()`. It exists so
  `send.ts` can reach the room without importing `client.ts` and forming a cycle.
- `client.ts` — `connect` / `disconnect` and all the schema callback wiring.
- `send.ts` — everything this client tells the room.
- `remotes.ts` — the `remotes` map and the roster event.
- `events.ts` — `onShot` / `onWhistle` / `onMark` / `onGrave` / `onKilled` and
  their emitters.
- `sessions.ts` — `fetchSessions` against `/api/sessions`.
- `index.ts` — the public surface.

## Invariants

1. **`remotes` lives outside React and is mutated in place.** Re-rendering the
   tree twenty times a second is what makes naive multiplayer stutter. The
   `onChange` handler writes into the *existing* `target` object rather than
   replacing it, so `players/RemotePlayers` keeps damping toward the same
   reference. React only re-renders when the roster changes — `onRoster`.
2. **Local state goes out on a `setInterval`, never from `useFrame`.** A
   backgrounded tab stops running frames entirely, which would look to everyone
   else like that player freezing in place. The interval is in
   `players/Player.tsx`; this folder just provides `sendState`.
3. **The server never echoes your own paint back to you.** You already drew it
   locally as the brush moved. `client.ts` therefore treats every inbound `paint`
   message as somebody else's, with no id check needed beyond routing it to the
   right skin.
4. **Graves are state, marks are events — but both arrive as events here.**
   `graves.onAdd` fires for the backlog you inherit on join *and* for each new
   one, so `client.ts` funnels both into `emitGrave` and the scene has exactly
   one way in. Do not add a second path for "existing" graves.
5. **`connect` resolves only once the first state patch has landed.** The map id
   lives in room state and the caller renders geometry from it, so returning
   early would draw the wrong map for a frame — long enough to put a player
   inside a wall their opponents cannot see.
6. **`sendPaint` splits its own batches at `MAX_STROKE_BATCH`.** The server caps
   a single `paint` at that number and silently drops the rest, so a long enough
   drag would lose its tail with nothing said. Joining no longer replays your old
   paint at all — see `paint/CLAUDE.md`.

## Contracts

- **Out** (`send.ts` → `server/room.ts`): `state` at 20 Hz — position, yaw,
  pitch, pose and `cling` — plus `paint` batched every 100 ms, `shoot`, `kill`
  and `clearSkin`, plus `whistle` on its own timer.
- **In** (`client.ts` ← server): `shot`, `whistle`, `mark`, `paint`, `clearSkin`,
  `killed`,
  plus the `players` and `graves` schema callbacks.
- **`shot` carries the shooter's session id, not a position.** Every client
  already knows where that player is, so a coordinate on the wire would only be
  staler. It fires on *both* server paths — a wall shot and a kill — because a
  kill relays no `mark`, and `sound/` would otherwise be silent on the most
  dramatic shot in the game.
- **`killed` carries the death position** as a third argument to `onKilled`, so
  `sound/` can play the death where it happened. `Game.tsx` ignores it and uses
  only the first two.
- **Writes into `paint/skin.ts`** directly — inbound strokes are decoded and
  painted onto the sender's canvas, and a departing player's skin is disposed via
  `forgetSkin`.
- **`PlayerSchema` in `client.ts` mirrors `server/schema.ts` by hand.** The room
  is untyped on this side. Adding a field to the schema means adding it here or
  it simply will not exist for the client.
- `hud/RoleMenu` polls `fetchSessions` every 2 s; `Game.tsx` calls `connect` and
  `disconnect` and subscribes to `onKilled`.

## Not built yet

No reconnection (`allowReconnection` is unused — a drop is final and respawning
is a fresh join), no room list beyond the one room named `"game"`, and no
handling of a session that disappears while you are looking at it in the menu.
