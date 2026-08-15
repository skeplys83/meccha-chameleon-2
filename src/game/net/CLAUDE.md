# net — the client half of the network

**Owns:** the Colyseus connection, everyone else's live transforms, the event
streams the scene subscribes to, and the session list.

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
  `onRoom` / `onMoved` / `onMoveFailed` / `onDropped` / `onLeftRoom` and their
  emitters.
- `sessions.ts` — `fetchSessions` against `/api/sessions`: which server, and the
  public games on it. A `Game` carries `started` **and** `starting`, which are
  the two states the server refuses a join in.
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
option outright — everyone there is a hunter — and the draw at Start turns all
but one of them into chameleons, so the role comes *back* on `RoomInfo`. A respawn is
the exception: being shot must not put you back in the draw.

A session is no longer one room, and the trip is made in **three** legs now: the
host presses Start and the chameleons are carried into the match; when the
round is over
the match carries them back to the same lobby. The hunter makes a third trip of their own, a whole hiding phase after the
chameleons: they stay in the lobby until the match rings the bell. Every leg is
the same mechanism — the server holds a seat and sends `moveTo` — and `attach`
runs once per *room*, not once per session.

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
   drag would lose its tail with nothing said. Nothing replays old paint any
   more, in either direction — see invariant 9.
7. **`emitLeftRoom` goes *before* `attach`, never after.** A room replays its
   `graves` backlog while it is being attached, and that lands earlier than the
   `RoomInfo` describing the room — so a listener that cleared on the room id
   instead would wipe the graves it had just been handed. The ordering inside
   `move()` is: forget the remote skins, `clearRemotes`, `emitLeftRoom`, *then*
   `attach(next)`. Reordering those four lines is a silent bug, not a crash.
8. **The two rooms overlap during a move, deliberately.** The match seat is
   consumed *before* the lobby is left, so a failed hand-off is a message on
   screen rather than a silent exit from the game. The consequence is that the
   lobby's `onLeave` fires while the match is already wired, so it checks
   `getRoom() === joined` before clearing anything. Get that wrong and arriving
   in the match wipes the players you just met.
9. **A move drops every skin, yours included.** Session ids are per room, so the
   ids remote skins are keyed by will never be seen again; everyone's paint
   arrives afresh through the ordinary `players.onAdd` replay. Your own used to
   be the exception — kept and replayed with `encodedHistory` so a waiting room
   was worth painting in — and is not any more: a match now opens on a clean
   slate. `encodedHistory` went with it, and `move()` sends no paint at all.
10. **The client outlives the room.** `consumeSeatReservation` is a method on the
   `Client`, not on the room being left, so `connection.ts` holds it for the
   session. A client scoped to one connect call leaves nothing able to make the
   trip.
11. **Reaching `onLeave` while still holding the room handle means nobody asked
   for this.** Every deliberate exit clears the handle first — `disconnect`
   before quitting or dying, `attach` before the old room is left on a hand-off
   — so that one check is what separates a drop from all four of them. Without
   it a drop was completely silent: other players vanished, input went nowhere,
   and the game looked fine.
12. **The reconnection token is captured while the room is healthy and outlives
   it.** It is read in `attach` and deliberately *not* cleared by a drop, because
   the moment it is needed is the moment the room has gone. `disconnect` does
   clear it — a deliberate exit gives up the seat — which is why `rejoin` reads
   it before calling that.
13. **The player id is generated with `crypto.getRandomValues`, not
   `crypto.randomUUID`.** The latter is secure-context only — it exists on
   localhost and over HTTPS and nowhere else — so it threw for every guest who
   opened a plain-http address and worked perfectly for whoever was testing. See trap 8
   in the root doc.
14. **The player id is `sessionStorage`, never `localStorage`.** Two tabs on one
   machine is how this game gets tested, and `localStorage` is shared across
   them — both tabs would be the same player and both would claim the host's
   button. Same reasoning as the name in `hud/`. It goes out on every way in
   (`createLobby`, `joinLobby`, `rejoin`), because it is the only thing that
   tells the server the tab coming back from a match opened the game.
15. **A join that is refused must *reject*, not wait.** The server accepts the
   socket and decides afterwards — `onJoin` closes it on a stranger reaching a
   lobby whose round is running or whose countdown has started — so a refusal
   arrives as `onLeave` with a code, before any state has landed. Invariant 5's
   wait has no timeout, so without this it never resolved and never rejected: the
   menu sat on a spinner with nothing on screen and nothing in the console.
   `attach` arms `rejectJoin` for exactly the length of that wait and clears it in
   a `finally`, which is what keeps a socket dying *after* we are seated an
   ordinary drop. The refusal path deliberately does **not** `emitDropped` —
   there is nothing to reconnect to for somebody who never got in — and `refusal`
   turns the code into the sentence shown on the menu.
16. **`rejoin` tries the token, then falls back to the room id.** The token is
   the good outcome: same session id, so side, position and paint are all still
   there. The fall-back is a fresh player and a chameleon, because the server takes
   no role from a client. Both are correct for their case, so it is one function
   rather than two.
17. **`Game.tsx` must never read `target.name` on a missing target.** When the
   session list is empty or stale, the menu can still render a button that calls
   into the lobby flow; the correct behaviour is to stop before any join call and
   surface a normal error instead of crashing on `undefined`. `fetchSessions`
   also coerces the server payload to always include `name`, `host` and numeric
   ports, because a null or malformed session is a client bug and not a reason to
   dereference it blindly.

18. **The browser-facing socket port is normalized before a join.** The server
   reports its bind and public ports separately, and the client rewrites any
   missing values to safe defaults: `gamePort` becomes a number, `host` falls back
   to `location.hostname`, and the local server record keeps its name stable even
   when the list is empty or stale. That is how the app stays resilient behind
   nginx and a TLS terminator without guessing at a `ws://` target that was never
   actually advertised.

## Contracts

- **Out** (`send.ts` → `server/room.ts`): `state` at 20 Hz — position, yaw,
  pitch, pose and `cling` — plus `paint` batched every 100 ms, `shoot`, `kill`
  and `clearSkin`, plus `whistle` on its own timer, plus `start` and `setMap`
  from a lobby host.
- **In** (`client.ts` ← server): `shot`, `whistle`, `mark`, `paint`, `clearSkin`,
  `caught`, `moveTo`, `moveFailed`, plus the `players` and `graves` schema
  callbacks. Every one of these needs a handler registered — Colyseus warns on
  any message type that has none, which is why the end of a match is signalled
  by `moveTo` rather than by a message of its own.
- **`onMoved` says the room you were in is not the room you are in**, which
  `onRoom` cannot: that also fires for a new host or a changed map. It is emitted
  only once the new room is wired and the paint replay is away, so a listener
  acting on it is looking at the room it actually landed in.
- **`onLeftRoom` is the other half of that, and fires at the opposite moment.**
  It means *the old room stopped counting*, and it is emitted at each of the
  three places a room is left — a hand-off, a deliberate exit, a dead socket —
  right beside `clearRemotes`, which has always marked the same instant. **It is
  the project's single reset point**: `Game.tsx` drops paint and looping sounds
  there, `Scene.tsx` its marks and graves. Anything added later that belongs to a
  room joins it rather than inventing its own teardown.
- **`onRoom` is how the UI learns anything about the room.** Which mode it is,
  **which side you are on**, the map under your feet, the map queued up, the
  invite code, whether you hold Start, the seconds left, **the phase, the cap and
  the head count** — all of it lives in state and all of it can change while you
  sit there, so it is pushed rather than returned. The clock means it now fires about once a second in a match. It fires
  only when one of those actually differs, not on every patch. The role is the
  reason this matters most: it flips underneath the player at the moment the
  match opens.
- **`shot` carries the shooter's session id, not a position.** Every client
  already knows where that player is, so a coordinate on the wire would only be
  staler. It fires on *both* server paths — a wall shot and a kill — because a
  kill relays no `mark`, and `sound/` would otherwise be silent on the most
  dramatic shot in the game.
- **`caught` replaces `killed`, and the rename is the behaviour.** Being caught
  does not remove you: the server flips your `role` to `hunter` in place, wipes
  your paint and leaves you in the room. `Game.tsx` uses it only to know the
  thing that just happened was about *you*, and shows a toast; the actual change
  of side arrives through `onRoom`, because it is schema. It carries the position
  as a third argument so `sound/` can place the catch where it happened — which
  is how the chameleons still hiding hear the hunt closing in.
- **A grave is `"x,y,z,name"`.** The name is taken as the *remainder* after the
  three coordinates rather than as a fourth field, because a player name may
  contain a comma. It exists so the reveal can label a spot.
- **The bell and the gong are not messages.** They are the `phase` changing, which
  is already in state and already arrives at every client in the same patch — so
  the transition *is* the announcement, with nothing to keep in step with it and
  no message type needing a handler. `Game.tsx` compares against the previous
  phase, so a player handed into a match that is already hunting is not played a
  bell they missed.
- **Writes into `paint/skin.ts`** directly — inbound strokes are decoded and
  painted onto the sender's canvas, and a departing player's skin is disposed via
  `forgetSkin`.
- **`PlayerSchema` in `client.ts` mirrors `server/schema.ts` by hand.** The room
  is untyped on this side. Adding a field to the schema means adding it here or
  it simply will not exist for the client.
- **An unknown `phase` off the wire becomes `waiting`.** `describe()` checks it
  against the union rather than casting, because a room can be running a build
  the client has never met — during a rolling restart, or simply an old tab — and
  a phase nothing renders is better as "nothing is happening" than as a blank
  HUD. Same instinct as `safeMapId`.
- **The countdown tick is driven off `timeLeft` changing, not off a timer.**
  `Game.tsx` plays `tick` when `onRoom` reports a new second during a counting
  phase, so the number on screen and the sound are the same event and two players
  cannot drift apart the way two client-side timers would. `onRoom` only fires on
  a real difference, so a repeat is impossible by construction.
- `hud/StartMenu` polls `fetchSessions` every 5 s while it is on screen and the
  tab is in front, for `self` **and** the public games list; `Game.tsx`
  calls `createLobby` / `joinLobby` / `rejoin` / `disconnect` and subscribes to
  `onKilled`, `onRoom`, `onMoveFailed` and `onDropped`.

## Not built yet

No automatic retry — a dropped player is shown a panel and clicks Reconnect,
which is honest but means a blink still interrupts you. No way to tell a mistyped
code from a game that has since closed: both come back as a rejected join. A
lobby that refuses you because it is counting down says so, but nothing retries
when the ten seconds are up — you type the code again.
