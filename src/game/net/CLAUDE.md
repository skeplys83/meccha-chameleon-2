# net — the client half of the network

**Owns:** the Colyseus connection, everyone else's live transforms, the event
streams the scene subscribes to, and the LAN session list.

**Entry point:** `@/game/net` (`index.ts`). Import from there, not from the
individual modules — the split is an implementation detail.

The other half is `server/`. Every message named below has a handler there.

## Files

- `connection.ts` — the one live `Room` handle, the `Client` that opened it and
  the last reconnection token, plus `selfId()`. It exists so `send.ts` can reach the room without importing
  `client.ts` and forming a cycle.
- `client.ts` — `createLobby` / `joinLobby` / `rejoin` / `disconnect`, the schema
  callback wiring, and the move from a lobby into its match.
- `send.ts` — everything this client tells the room.
- `remotes.ts` — the `remotes` map and the roster event.
- `events.ts` — `onShot` / `onWhistle` / `onMark` / `onGrave` / `onKilled` /
  `onRoom` / `onMoved` / `onMoveFailed` / `onDropped` and their emitters.
- `sessions.ts` — `fetchSessions` against `/api/sessions`: which server, and the
  public games on it.
- `identity.ts` — `playerId()`, this tab's id for as long as it is open.
- `index.ts` — the public surface.

## Three doors, one room at a time

`createLobby` opens a waiting room of your own — `client.create`, never
`joinOrCreate`, which is precisely the behaviour that used to glue every player
on a machine into one game, and the only call that takes `listed`. `joinLobby`
is `joinById` on an invite code — the same call whether the game was listed or
not, since listing decides visibility and never admission. `rejoin` is that call
against a match you were already in — a respawn, or a reconnection.

**Only `rejoin` sends a role.** Nobody picks a side: the lobby ignores a role
option outright — everyone there is a seeker — and the draw at Start turns all
but one of them into hiders, so the role comes *back* on `RoomInfo`. A respawn is
the exception: being shot must not put you back in the draw.

A session is no longer one room, and the trip is made in both directions: the
host presses Start and everyone is carried into the match; sixty seconds later
the match carries them back to the same lobby. Either way the server holds a
seat and sends `moveTo`, and `attach` runs once per *room*, not once per
session.

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
5. **Attaching a room resolves only once the map *and our own player* have
   landed.** The map because the caller renders geometry from it, and drawing
   the wrong one for a frame is long enough to put a player inside a wall their
   opponents cannot see. Our own player because that is where the role lives:
   describing a room we are not yet in reports the wrong side, which is a camera
   in the wrong place and a pointer lock that should not have been taken. Both
   hold for the match just as much as for the first join.
6. **`sendPaint` splits its own batches at `MAX_STROKE_BATCH`.** The server caps
   a single `paint` at that number and silently drops the rest, so a long enough
   drag would lose its tail with nothing said. Joining does not replay your old
   paint — see `paint/CLAUDE.md` — but *being moved* does, which is a different
   thing and the only place `encodedHistory` is used.
7. **The two rooms overlap during a move, deliberately.** The match seat is
   consumed *before* the lobby is left, so a failed hand-off is a message on
   screen rather than a silent exit from the game. The consequence is that the
   lobby's `onLeave` fires while the match is already wired, so it checks
   `getRoom() === joined` before clearing anything. Get that wrong and arriving
   in the match wipes the players you just met.
8. **A move drops every remote skin and keeps your own.** Session ids are per
   room: the ids remote skins are keyed by will never be seen again, and
   everyone re-sends their paint on arrival through the ordinary
   `players.onAdd` replay. Yours is re-sent by you.
9. **The client outlives the room.** `consumeSeatReservation` is a method on the
   `Client`, not on the room being left, so `connection.ts` holds it for the
   session. A client scoped to one connect call leaves nothing able to make the
   trip.
10. **Reaching `onLeave` while still holding the room handle means nobody asked
   for this.** Every deliberate exit clears the handle first — `disconnect`
   before quitting or dying, `attach` before the old room is left on a hand-off
   — so that one check is what separates a drop from all four of them. Without
   it a drop was completely silent: other players vanished, input went nowhere,
   and the game looked fine.
11. **The reconnection token is captured while the room is healthy and outlives
   it.** It is read in `attach` and deliberately *not* cleared by a drop, because
   the moment it is needed is the moment the room has gone. `disconnect` does
   clear it — a deliberate exit gives up the seat — which is why `rejoin` reads
   it before calling that.
12. **The player id is generated with `crypto.getRandomValues`, not
   `crypto.randomUUID`.** The latter is secure-context only — it exists on
   localhost and over HTTPS and nowhere else — so it threw for every guest who
   opened the LAN URL and worked perfectly for whoever was testing. See trap 8
   in the root doc.
13. **The player id is `sessionStorage`, never `localStorage`.** Two tabs on one
   machine is how this game gets tested, and `localStorage` is shared across
   them — both tabs would be the same player and both would claim the host's
   button. Same reasoning as the name in `hud/`. It goes out on every way in
   (`createLobby`, `joinLobby`, `rejoin`), because it is the only thing that
   tells the server the tab coming back from a match opened the game.
14. **`rejoin` tries the token, then falls back to the room id.** The token is
   the good outcome: same session id, so side, position and paint are all still
   there. The fall-back is a fresh player and a hider, because the server takes
   no role from a client. Both are correct for their case, so it is one function
   rather than two.

## Contracts

- **Out** (`send.ts` → `server/room.ts`): `state` at 20 Hz — position, yaw,
  pitch, pose and `cling` — plus `paint` batched every 100 ms, `shoot`, `kill`
  and `clearSkin`, plus `whistle` on its own timer, plus `start` and `setMap`
  from a lobby host.
- **In** (`client.ts` ← server): `shot`, `whistle`, `mark`, `paint`, `clearSkin`,
  `killed`, `moveTo`, `moveFailed`, plus the `players` and `graves` schema
  callbacks. Every one of these needs a handler registered — Colyseus warns on
  any message type that has none, which is why the end of a match is signalled
  by `moveTo` rather than by a message of its own.
- **`onMoved` says the room you were in is not the room you are in**, which
  `onRoom` cannot: that also fires for a new host or a changed map. It is emitted
  only once the new room is wired and the paint replay is away, so a listener
  acting on it is looking at the room it actually landed in.
- **`onRoom` is how the UI learns anything about the room.** Which mode it is,
  **which side you are on**, the map under your feet, the map queued up, the
  invite code, whether you hold Start, the seconds left — all of it lives in
  state and all of it can change while you sit there, so it is pushed rather
  than returned. The clock means it now fires about once a second in a match. It fires
  only when one of those actually differs, not on every patch. The role is the
  reason this matters most: it flips underneath the player at the moment the
  match opens.
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
- `hud/StartMenu` polls `fetchSessions` every 2 s, for `self` alone; `Game.tsx`
  calls `createLobby` / `joinLobby` / `rejoin` / `disconnect` and subscribes to
  `onKilled`, `onRoom`, `onMoveFailed` and `onDropped`.

## Not built yet

No automatic retry — a dropped player is shown a panel and clicks Reconnect,
which is honest but means a blink still interrupts you. No way to tell a mistyped
code from a game that has since closed: both come back as a rejected join.
