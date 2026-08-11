# server — the authoritative half

**Owns:** the Colyseus rooms and their state, the matchmaking between them, LAN
discovery over UDP, and the HTTP bootstrap that serves Next.

**Entry point:** `node src/game/server/index.ts`, which is what both `npm run
dev` and `npm start` run. There is no `next dev` in this project, and no build
step for the server — **Node strips the TypeScript itself** (22.18+ / 23.6+).

It lives under `src/game/` with the client, but it is a *different runtime*: this
code never reaches the browser, and nothing here may import from `world/`,
`figure/`, `paint/`, `players/`, `combat/` or `hud/`. The only shared ground is
`../shared/protocol.ts`.

## Files

- `index.ts` — starts discovery, prepares Next, serves `/api/sessions` itself and
  hands everything else to Next, defines both room types, starts Colyseus,
  prints the banner.
- `room.ts` — `GameRoom`: every message handler, the clamping, the kill rules,
  and the lobby → match hand-off.
- `schema.ts` — `Player` and `GameState`, the synced state.
- `code.ts` — the invite alphabet and a code no live room is using.
- `monitor.ts` — Colyseus's admin panel at `/colyseus`, and the rule for when it
  is allowed to exist.
- `discovery.ts` — the UDP socket, the peer table, the session name.

## Lobbies and matches

One class, two registered names. A **lobby** is the waiting room: it runs the
arena, it is playable, and it owns a short invite code. A **match** is the game
proper on the chosen map, created by a lobby and lasting sixty seconds. They
differ in which map they run, whether Start exists, how roles are assigned, and
whether there is a clock — everything else (movement, paint, kills, whistles) is
identical, which is why it is one class. `this.roomName` is what tells them
apart.

The cycle is: lobby → Start → match → the clock runs out → back to the same
lobby → Start again. `state.lobby` is the one field that makes the return trip
possible, and it is set in both directions: a lobby's own code, and for a match
the lobby that opened it.

**A lobby dies when it has no players *and* no live match**, checked by a sweep
every fifteen seconds — not when its last player leaves. `autoDispose` is off
precisely so it can sit empty for the minute its match is running. A match is the
opposite: ordinary `autoDispose`, gone as soon as its last client leaves.

**A lobby is listed unless its creator said otherwise; a match never is.**
`setPrivate` hides a room from the directory the listing queries but does *not*
lock it, so the invite code works identically either way. Unlisted therefore
means "you need the code from me", not "you cannot get in" — and that
distinction is the entire mechanism behind both the public flag and the
unreachable-by-browsing match.

Many rooms in one process needs **no Redis**. The driver (the room directory
`matchMaker.query` reads) and presence (pub/sub) both default to their Local
versions, which are an in-process array and an in-process emitter. Redis buys
one thing: spanning *processes*. Reach for it the day there is more than one.

The client half is `game/net/` — see its doc for the receiving end of every
message named here.

## Invariants

1. **Schema fields use `declare`, never `!`.** This is the one that will bite
   you. Node strips types by *blanking the characters out*, not by re-emitting,
   so `name!: string` survives as the class field `name;` — which defines an own
   property that shadows the accessor `defineTypes` installs on the prototype.
   Colyseus then cannot find its metadata and every state encode dies with
   `TypeError: Cannot read properties of undefined (reading
   'Symbol(Symbol.metadata)')`, taking the process down on the first join.
   `declare name: string` is erased completely, which is what these need to be.
   The same reasoning forbids field initialisers — `strokes` is assigned in the
   constructor.
2. **Type stripping is stripping, not compiling.** No `enum`, no `namespace`, no
   parameter properties, and **no decorators** — which is why the schema uses
   `defineTypes(...)` rather than `@type`. Imports must name the real file
   (`./room.ts`), which is what `allowImportingTsExtensions` in tsconfig permits.
3. **Two servers, never one.** Next keeps its own HTTP server, Colyseus listens
   on its own port. Handing a WebSocket server the HTTP server's `upgrade` event
   destroys every non-matching upgrade, including Next's dev HMR socket — which
   stops the client bootstrap, so **React never hydrates and no button on the
   page works**. The symptom is "connection refused" plus a completely dead UI.
4. **State is what a late joiner still has to see.** Paint strokes and graves are
   permanent, so they are schema fields and arrive via `onAdd` backlog. Shot
   marks expire after three seconds, so they are a `broadcast` and are never
   stored. Getting this backwards means either a blank body on join or a room
   full of ghost marks.
5. **Movement is trusted, kills are not.** Clients simulate themselves and report
   their position; the server only clamps it into the arena. A kill is checked —
   this must be a match, caller must be a seeker, victim must exist and not be
   the caller — because it is the one message where a wrong client changes
   someone else's game.
6. **The victim is told before they are dropped.** `killed` is broadcast, then the
   victim is deleted from state, then `leave()` fires 250 ms later. Without the
   delay they disconnect before the message lands and see nothing but a dropped
   connection.
7. **A schema `boolean` must be coerced, not assigned**, and `cling` is checked
   against the role besides. `player.cling = player.role === "hider" &&
   msg.cling === true` — never `= msg.cling`, because the encoder will take a
   string or an object and hand it to every client, and never without the role,
   because clinging is what silences your footsteps for everyone else. A seeker
   who could set it would hunt in silence. Same instinct as `clamp` for numbers,
   and the same role mirror as the kill and whistle handlers.
8. **Non-finite input becomes 0, never `NaN`.** That is what `clamp` is for. A
   `NaN` written into schema propagates to every client.
9. **A whistle is relayed, never stored, hider-only, and rate-limited like a
   shot.** It only gives a position away, so it is trusted the way movement is —
   but *rate* reaches everybody, so `MIN_WHISTLE_GAP_MS` stops a client turning
   theirs into a siren. The role check mirrors the kill handler's: a kill refuses
   anyone who is not a seeker, a whistle refuses anyone who is not a hider. A
   player who has left the room cannot whistle at all.
10. **One trigger, one clock.** `canFire` rate-limits `shoot` and `kill` together,
   per client, because a trigger-pull sends exactly one of the two — never both.
   The gap is `FIRE_INTERVAL_MS` from `shared/`, times a tolerance, so a shot a
   few milliseconds early is treated as jitter rather than eaten. The client
   enforces the same interval for feel; this is here because fire *rate* is the
   property of a shot that reaches everybody.
11. **A shot is broadcast separately from its mark.** `mark` is where the pellets
   landed; `shot` is where the gun was. The kill path relays only `shot`, since
   there is no wall to mark.
12. **The invite code *is* the `roomId`, and it may only be set in `onCreate`.**
   The setter throws at any later point in the room's life — verified in
   `Room.js`, not assumed. That is also what makes the invite free: no token
   store, no second lookup, and `client.joinById(code)` is the whole join path.
   The alphabet omits `I`, `O`, `0` and `1`, because a code exists to be read
   out loud.
13. **A lobby does not auto-dispose.** Starting a match moves every client out at
   once, and an auto-disposing room would take the invite code down in that gap.
   The `sweep` interval ends it instead: no players *and* no live match. The
   same sweep is how a lobby learns its match has died, which is what lets a
   group start a second game.
14. **Start is idempotent-by-flag.** It is async and it is a button; two presses
   without the `starting` guard would open two matches and send half the room to
   each.
15. **A seat reservation is the only supported way to move a client**, and it is
   held for fifteen seconds by default. That is the entire budget for every
   client to consume theirs, so a failure is *sent* (`moveFailed`) rather than
   assumed away — a player who does not make the trip is still sitting in the
   lobby and needs telling.
16. **The seeker is drawn in the lobby, at Start, and never chosen.** Everybody
   waits as a **seeker**; exactly one of the clients making the trip keeps that
   on their seat reservation and the rest are reserved as hiders. It happens
   there rather than in the match because the draw needs the whole roster at
   once and the match has no players yet — its seats are what is being handed
   out. A lobby therefore *ignores* a role option outright; a match honours one,
   because that is where the reservation's answer arrives and where a respawn
   says which side it was already on.
17. **One clock, not two.** The match's countdown is a single
   `clock.setInterval` that decrements `state.timeLeft` and calls `finish()` when
   it hits zero — not a countdown for display *plus* a `setTimeout` to end
   things. Two timers are two things that can disagree, and the number on screen
   has to be the one that decides the game is over. It is `this.clock`, Colyseus's
   own timing, which is ticked from the patch loop and therefore stops with the
   room; a bare `setInterval` would outlive it.
18. **An unset schema number is absent, not zero.** A lobby writes
   `timeLeft = 0` explicitly. Leaving it alone means the field never appears in
   the encoded state and the client reads `undefined` where it expects "no clock
   is running" — which is how this was caught.
19. **A drop is not a departure.** `onLeave`'s `consented` flag separates them:
   true when the client asked to go (quitting, or being handed to another room),
   false when the socket died. Only the second gets `allowReconnection`, and only
   in a match — a lobby is cheap to walk back into by its code, while a match
   holds your side, your position and your paint, none of which a fresh join can
   restore. The player **stays in state** while the seat is held, so their body
   is still standing there and is still shootable: dropping must not be a way to
   become invulnerable. That is why the kill handler rejects any pending return
   for its victim — coming back to a room you have just been deleted from would
   be a body with nobody behind it.
20. **A match takes a role only from a seat its lobby reserved.** Reservation
   options and a client's own join options arrive at `onJoin` in the same
   argument and are otherwise indistinguishable, so the lobby mints a `pass`,
   passes it in `createRoom` and includes it in every reservation. Without it,
   any hider could leave a match and rejoin by its id claiming the gun — and
   every player in a match knows its id. A join with no valid pass is a hider,
   which is the right answer for the only case that reaches it: a dead player
   respawning is necessarily a hider, since a seeker cannot be shot.
21. **A `kill` is refused outright in a lobby.** Everyone waiting is armed, and a
   kill drops its victim from the room and onto a death screen — so honouring
   one there means being shot out of the game you are queuing for. `shoot` is
   untouched: the bang and the wall mark are harmless, and a waiting room where
   the gun does nothing at all would read as broken. This is the one rule that
   does not follow from the role check, precisely because in a lobby the role
   check passes for everybody.
22. **The arena is not a match map.** It is where every lobby waits, so
   `MATCH_MAP_IDS` is what both `onCreate` and `setMap` validate against.
   Accepting it would mean pressing Start and arriving where you already were.
23. **`listed` is decided at creation and never again.** It is a `create`
   option, mirrored into schema so the lobby panel can say which it is, and it
   drives one `setPrivate` call. Nothing changes it later: a game that went
   public while people were already inside would be a surprise nobody consented
   to, and the room id — the code — is what actually admits people either way.
24. **A game's population is both of its rooms.** Once a match starts its players
   have left the lobby, so a listing that counted only the lobby would show a
   game in full swing as empty. The lobby publishes its `matchId` in metadata
   and `index.ts` adds that room's clients back. Nothing pushes the count
   anywhere — it is computed per request, so it cannot go stale.
25. **The host is the present player who has been in this game longest, and the
   creator therefore keeps it.** Three pieces make that true, and removing any
   one of them puts the button back on a coin-toss:

   - **`firstSeen`, by player id, kept for the room's whole life.** Arrival
     *order* is no use — everyone leaves for the match and comes back with new
     session ids in whatever order their reservations landed, so ordering by the
     current join is just "first back". The creator is earliest-seen by
     construction, which is why they need no special case.
   - **Nothing is reassigned while a match is running, or for ten seconds after
     it ends.** A lobby is empty for that whole minute; without the gate the
     button falls to the first stranger to use the invite code. The grace window
     covers the return, when everyone arrives at once and the host is not
     necessarily first through the door.
   - **The player id is forwarded through both hand-offs.** Lobby → match and
     match → lobby both carry `pid` in the seat reservation. Drop it from either
     and the host comes home a stranger.

   `hostId` in state is still a *session* id — that is what the client compares
   itself against — and it is now legitimately empty while a match runs.
26. **A player id is a claim, not a credential**, and it is `sessionStorage` on
   the client, never `localStorage`: two tabs on one machine is how this game
   gets tested, and shared storage would make both of them the same player and
   both of them the host. Anyone could send someone else's id; the worst it buys
   is a Start button, which is the same trust model as everything else here.
27. **The admin panel is not read-only, and is off by default in production.**
   Its API exposes `matchMaker.remoteRoomCall`, which invokes any method on any
   room by name — `disconnect`, and this project's own `matchEnded` among them —
   so anyone who can reach it can end anybody's game. The rule is that a
   password is what turns it on: on in development with none (only you can reach
   localhost, and `MONITOR=0` opts out), and in production it is *not mounted at
   all* unless `MONITOR_PASSWORD` is set, then behind Basic auth. Forgetting the
   password fails closed. `createMonitor` returns `null` rather than an
   always-403 handler on purpose — an unmounted route cannot be probed, and
   `/colyseus` should look like any other unknown path.
28. **The panel is pinned to `@colyseus/monitor@0.16.x`.** Its 0.17 line depends
   on `@colyseus/core@^0.17`, which npm would install *alongside* our 0.16 — a
   second matchMaker, in the same process, that knows about none of our rooms.
   The panel would load and list nothing. This is the same version constraint as
   the rest of the stack (see the root doc); bump it with everything else or not
   at all.
29. **The panel's route is checked before `/api/sessions` and before Next.**
   Next answers anything it does not recognise with a 404 page, so a panel
   mounted after it would never be reached.
30. **`start` refuses while a match is live**, and `matchEnded` is how the lobby
   learns otherwise. The sweep would notice within fifteen seconds, which is fine
   for bookkeeping and far too slow for a person standing there pressing a button
   that does nothing. `matchEnded` is public because `matchMaker.remoteRoomCall`
   reaches it by name.

   The rest of the old note still holds: There are no accounts. It is the first
   to join, reassigned to whoever remains, and it is only ever consulted to
   decide who may press Start or change the map. Both messages are checked
   server-side; hiding the buttons is a display rule on top of that, not instead
   of it.

## Contracts

- **`cling` is trusted like movement** — it only decides whether other clients
  play footsteps for you, so a liar makes themselves quiet and nothing else.
- **Reads `../shared/protocol.ts`** for `Role`, `ROOM_LIMIT`, `POSE_COUNT`,
  `MAX_STROKES`, `MAX_STROKE_LENGTH`, `MAX_STROKE_BATCH`, and the fire and
  whistle intervals. Do not re-declare any of them here — a pre-commit gate
  fails the commit if you do.
- **Reads `../world/mapIds.ts`** to validate a chosen map. That file is
  import-free precisely so this side can read it: `maps.ts` pulls in React and
  three.js and would not load here at all.
- **A room's own map never changes.** A lobby is always the arena; a match is
  fixed at creation. What the host can move is `nextMap` — the map the *next*
  match will use — because geometry cannot move under players standing on it.
- **Messages in** (`room.ts` ← `net/send.ts`): `state`, `paint`, `clearSkin`,
  `shoot`, `kill`, `whistle`, plus `start` and `setMap` from the host of a lobby.
- **Messages out** (→ `net/client.ts`): `shot`, `whistle` and `mark` to everyone; `paint`
  and `clearSkin` to everyone *except the sender*, who already drew it locally;
  `killed` to everyone, carrying the clamped death position so `sound/` can place
  it; `moveTo` (a seat reservation, per client) and `moveFailed`.
- **There is no "match over" message.** `moveTo` is the news. A second one would
  only be a message the client has to remember to register a handler for, and
  Colyseus warns about every message type that has none.
- **`/api/sessions`** returns `{self, sessions, games}` and is consumed by
  `net/sessions.ts`. The browser rewrites `self.host` to `location.hostname`,
  because a server does not know which of its addresses you reached it by.
- **The listing is served here because Colyseus 0.16 has no room-list route.**
  Its HTTP matchmaking endpoint exposes only the join methods and the browser
  client has no `getAvailableRooms`, so `publicGames()` reads `matchMaker.query`
  in the process that owns the room directory. It queries lobbies and matches
  together, since a game's count spans both.
- **Discovery is best-effort, and optional.** A failed UDP bind logs a warning
  and the game runs on regardless. `LAN_DISCOVERY=0` skips it entirely, which is
  what a hosted server wants: there are no peers to broadcast to. `/api/sessions`
  still answers with `self`, and `self` is the entry the menu actually joins, so
  the game works with discovery off.
- **`PUBLIC_GAME_PORT` is what clients are told, `GAME_PORT` is what we bind.**
  They are the same on a LAN. Behind a reverse proxy they are not: TLS is
  terminated on 443 and forwarded to 2567, so the browser must be handed 443 —
  both because it cannot reach the internal port, and because a `wss://` page is
  forbidden from opening a plain `ws://` socket.

## Testing it

Headlessly, and you should: drive two `colyseus.js` clients from a scratch `.mjs`
script in the project root (so `node_modules` resolves) against a running server,
assert what each sees, then delete it. Join, clamping, paint relay and non-echo,
the late-joiner backlog, a hider's kill being rejected and a seeker's producing a
grave are all checkable that way in about 60 lines.

The matchmaking is *especially* worth testing this way, because almost none of
it is visual: two `create` calls giving two different rooms, `joinById` on a
code, a wrong code being refused rather than creating a room, a guest's `start`
and `setMap` being ignored, the arena refused as a match map, everyone waiting
as a seeker, a kill in the lobby refused while the shot still bangs, a public
game listed and an unlisted one absent *but still joinable by code*, the count
holding steady across the start because it spans both rooms, every client
landing in one match with **exactly one seeker** between them, a client's
claimed `role: "seeker"` refused on a plain match join, the lobby surviving its
own start, the button changing hands, and paint arriving in the match. The draw
is worth looping a couple of dozen times to prove it is not always the host.

The clock and the reconnection both test well too, and neither is visible from
the outside. Close a client's socket with
`room.connection.transport.ws.close()` — that is a *drop*, where `room.leave()`
is not — then `client.reconnect(token)` and assert the same session id, side,
position and paint come back. For the round trip, start a match and wait the
real sixty seconds for the `moveTo` home; it is a slow test but it is the only
one that proves the timer ends anything. Consume the `moveTo` seat in the script
exactly as the client does — that is the step most likely to break.

## Not built yet

No hide phase and no win condition — the clock ends a match, but nothing counts
who survived it, so a round has a length and no result. No ready-up: a lobby is
a place to wait, not a checklist. No health: a hit is instantly fatal. A
respawning player rejoins the match they died in, with whatever is left on its
clock.
