# hud — the 2D overlays

**Owns:** everything drawn in DOM over the canvas, and the menu you see before
you join.

**Entry points:** `StartMenu`, `LobbyPanel`, `PauseMenu`, `ControlsPanel`,
`PlayerList`, `PhaseBanner`, `RoundOverPanel`, `LoadingScreen`, `LegalPage`,
`Footer`, `randomName`.

## Files

- `StartMenu.tsx` — name entry, the map picker, Create game, Join by code. Two
  questions and nothing else.
- `CreateGamePanel.tsx` — the modal behind Create: map, public flag, size.
- `LobbyPanel.tsx` — the invite code, the queued map and Start, over the
  waiting room.
- `DroppedPanel.tsx` — the connection died: reconnect, or go back to the menu.
- `PauseMenu.tsx` — resume / leave, where "leave" is a different place in each
  room.
- `ControlsPanel.tsx` — the key legend, one per role.
- `PlayerList.tsx` — who else is connected.
- `PhaseBanner.tsx` — the clock, and what it is counting towards. Worded per
  side: the same twenty seconds is a head start for one player and a wait for
  the other.
- `RoundOverPanel.tsx` — the reveal card: who won, and who was found where.
- `LoadingScreen.tsx` — a spinner and the word Loading, over the whole screen,
  while the map you are standing in is still arriving. Opaque, and no props.
- `LegalPage.tsx` — credits, what the game stores, and a placeholder for
  whoever runs the server. It **replaces** `StartMenu` rather than navigating:
  there is one page in this app and no router, so a page of text does not get to
  put the game's state behind a URL, and the arena keeps rendering behind it, so
  the background never changes.
- `Footer.tsx` — the copyright line and the link to `LegalPage`, pinned to the
  bottom of whichever panel renders it.
- `names.ts` — random fallback player names.

## Creating a game is a modal, and the three choices in it are permanent

`CreateGamePanel` holds the map, the public flag and the size, because they are
one decision — *what game is this* — and because none of them behaves like an
in-game setting afterwards. The map is the softest: a host can pick a different
`nextMap` from inside the lobby. The other two are fixed at creation, and
deliberately: a game that went public with people already in it would be a
surprise nobody consented to, and a cap that moved under a room that was already
filling is a race with no right answer.

The stepper's bounds are `MIN_PLAYERS` / `MAX_PLAYERS` from `shared/`, the same
two numbers the server clamps against. It is a display rule on top of a server
rule, never instead of one.

**There is no death screen, and that is a rule rather than an omission.** Being
caught turns you into a hunter and leaves you in the round, so the notice is a
toast that expires after a few seconds — not a screen with a Respawn button, of
which there is none. `MatchClock` went the same way: a bare number was enough
when a match was one block of sixty seconds and says nothing useful now.

**The reveal panel sits at the top, like every other panel here, and never in
the middle.** The world behind it is the answer — survivors lit red through the
walls, graves where everybody else was found — and the reveal is the one moment
in a round that is *about* looking at the world. A card in the centre of the
screen covers exactly the thing it exists to explain, and everyone can still walk
about while it is up. `PhaseBanner` occupies the same slot during a hunt and is
hidden during the reveal, so the two never collide.

**No emoji in the HUD.** `PlayerList` had a gun and a lizard, on the reasoning
that a glyph skims faster than a word and that emoji come from the operating
system's own font — which satisfies the no-CDN rule. They came out anyway: the OS
draws them, so row weight, baseline and width changed per machine, and on several
of them the lizard is not recognisably a lizard. Colour carries the same fact and
costs nothing.

## Invariants

1. **This folder never imports from `world/`, `figure/`, `players/` or
   `combat/`.** It renders outside the Canvas and talks to the game through
   `Game.tsx` props and through `net/`. The one exception is reading `POSES` for
   the legend — a label, not behaviour. `LoadingScreen` is the shape this forces
   and is worth copying: the flag it reacts to is raised inside the Canvas by
   `world/Room.tsx`, so `Game.tsx` subscribes to `src/game/loading.ts` and the
   component itself takes no props at all and knows nothing about maps.
2. **Not every difference between the roles is a key.** Only chameleons whistle, and
   nothing on either card says so — there is no key for it and nothing to press.
   The legend is for controls; role asymmetries that are not controls belong in
   `players/CLAUDE.md` and `sound/CLAUDE.md`, not here.
3. **`ControlsPanel` holds one legend per role and they are not built from a
   shared base.** If a row is on a card, that role must really have it wired up
   in `players/Player.tsx`. A chameleon has no shoot; a hunter has no pose, no
   `Q`/`E`, no zoom and no climb, so none of those may appear on the wrong card.
   Climbing has **no key of its own** — you attach by walking into a surface — so
   it is written onto the `W A S D` and `Space` rows rather than given one. A row
   here is a promise that a key does that thing; inventing one for a mechanic
   that has no key would be a lie on the card. Those two files
   are the contract.
4. **The player name is per tab, in `sessionStorage`, not a cookie.** Two tabs on
   one machine is how you test two players locally, and a cookie made them share
   and clobber one name. `StartMenu` also expires the old `mc_name` cookie on
   mount. Nothing else is persisted — not the code you typed, not the map.
5. **Nobody should have to invent a name to play.** A tab with no stored name
   gets a random reptile plus two digits; the digits are what stop two people
   picking "Gecko" from being indistinguishable.
6. **The map picker lists `MATCH_MAP_LIST`, never `MAP_LIST`.** The arena is
   missing from it on purpose: it is the waiting room every game starts in, so
   offering it would mean pressing Start and arriving where you already were.
   Both pickers — the menu's and the lobby's — read the same list, so a new map
   needs no change here. It sits with Create and with Start because in both
   places the choice belongs to whoever opened the game.
7. **Nobody picks a side, and no menu may offer one.** Everyone waits as a
   hunter and the draw at Start turns all but one of them into chameleons. `role`
   therefore arrives on `RoomInfo` and is only ever *displayed*; a control that
   set it would be either ignored or a lie. It also means the lobby shows the
   hunter's card and the hunter's legend to everybody, which is correct — that
   is what they are while they wait.
8. **The public checkbox is ticked by default, and only appears next to
   Create.** A game nobody can find is the exception, not the rule. It is
   decided once, at creation — there is no control for it in the lobby, because
   the server has none either — and it changes *visibility only*: a listed game
   and an unlisted one are both entered by the same code, which is what the
   helper text under the box has to keep saying.
9. **The lobby panel stays up while paused, and that is the only reason it
   works.** Everyone in the waiting room is a hunter, so everyone holds the
   pointer lock and nobody has a cursor — pausing is what hands it back. Hiding
   the panel behind the pause menu, which it originally did, left the host
   looking at a Start button they could see and could not click. Do not "tidy"
   it back behind `!paused`.
10. **A listed game shows the players in the whole game, not the waiting room.**
   The server counts both rooms, so a match in full swing does not read as an
   empty lobby. Displaying `room.clients` instead would be the bug this
   prevents.
11. **The pause menu's second button says where it goes, because that differs.**
   From a match it is *Leave match* and lands you back in the waiting room — you
   are still in that game and its code still works. From the waiting room it is
   *Return to menu*. A single label for both would be a lie in one of them.
12. **You are on the player list, in green, marked "(you)".** Both questions it
   answers — how many are we, and who is the hunter — include you. `remotes`
   holds everyone *else* by design (it is a table of bodies to interpolate and
   draw), so your own row comes from `Game.tsx` as props.
13. **Sides are hidden on that list until they exist.** `onJoin` makes everybody
   a hunter in a lobby, so labelling the rows before the draw printed "hunter"
   beside every name and gave away a decision nobody had made. `showRoles` is
   false while a lobby waits or counts down and true from the hiding phase on.
14. **The lobby's Copy button feature-detects the clipboard.**
   `navigator.clipboard` is secure-context only, so over a plain-http address it is
   absent and a bare call left the button silently dead for everyone except
   whoever was testing on localhost. It falls back to `execCommand("copy")` —
   deprecated, and therefore unrestricted. `docs/TRAPS.md`, trap 8.
15. **The clock is displayed, never counted.** `PhaseBanner` renders
   `room.timeLeft` straight from state, and so does `LobbyPanel`. A local
   `setInterval` alongside it would drift out of step with the counter that
   actually decides the round — and the tick everyone hears is driven off the
   same number changing, so a second clock would desync the sound too.
16. **The lobby panel stays small and off-centre.** A waiting room is a playable
   arena — you walk about and paint yourself while people arrive — so its
   overlay must not be a screen you sit and stare at.
17. **Only the host sees Start or the map buttons**, and that is a display rule on
   top of a server rule, never instead of one: `server/room.ts` refuses both
   messages from anyone but `hostId`. The host is told they are the host, in red,
   beside the code — the button only appears once they pause, so nothing else on
   screen says the round is waiting on them. Everyone else gets the next map at
   the size the host's Start button gets, because for them it is the only thing
   on the panel worth reading.
18. **The pause menu leaves only by its own button**, and says so on the card.
   Esc raises it and cannot dismiss it — see `players/CLAUDE.md` invariant 1 for
   why that is a pointer-lock rule rather than a menu one. Do not "fix" the
   asymmetry by wiring Esc back up.
19. **The pause menu has no full-screen scrim** — the arena stays visible while
   you are paused — but the panel itself needs a solid ground, because it floats
   over a white room and translucent pills left the session name unreadable.
20. **`fetchSessions` is polled for two things: `self` and `games`, on this
   screen only and only while the tab is in front.** `self` because the menu
   needs the Colyseus port, which is not the page's port and is not always the
   one the server listens on. `games` because the listing has no push channel —
   it is a plain fetch, not a second websocket, so the only way to notice
   somebody else opening a lobby is to ask. The peer list it also returns is not
   shown anywhere.

   Three things keep that from being the waste it looks like in a network panel.
   It lives in *this component*, so joining a game unmounts it and nothing polls
   during play. It is paused on `visibilitychange` and polls immediately on the
   way back, since a menu nobody is looking at cannot be stale. And the interval
   is `SESSION_POLL_MS` — 5 s, up from 2 — because what it is watching for is a
   person opening a lobby, which is not a thing that happens twice a second. The
   response is 0.3 kB and the server answers it from an in-process
   `matchMaker.query` in about 2 ms; if it ever looks slow in devtools, that is
   queueing behind the map's asset requests on the client, not the server.
21. **A game the server would refuse is listed but not clickable.** `onJoin`
   turns strangers away from a lobby whose round is running (`started`) *and*
   from one whose countdown has begun (`starting`), so a pressable row would be
   an invitation to be bounced back here with an error. The row stays — a game
   that exists is worth knowing about, and both states clear on their own — it is
   just disabled, and labelled "in play" or "starting", because the difference
   between waiting a whole round and waiting ten seconds is worth seeing. Display
   rule on top of a server rule, never instead of one.

22. **The footer is pinned outside the scrolling part of its panel.** A panel
    that fills the screen and scrolls its own contents cannot hold the footer
    *inside* that scroll area — an absolutely positioned child of a scroll
    container scrolls away with everything else, so the footer would sit at the
    bottom of the content rather than at the bottom of the page. Both panels
    that use it are therefore a fixed shell wrapping a scrolling middle, with
    room left at its foot. **The year in it is read from the clock**, never
    written down, so it cannot go stale.

## Contracts

- **`Game.tsx` owns every mode transition.** This folder raises intent
  (`onCreate`, `onJoinCode`, `onResume`, `onLeave`, `onReconnect`,
  `onExit`) and
  renders state; it decides nothing. `LobbyPanel` is the one exception and a
  narrow one: Start and the map buttons are `net/` senders called directly,
  because neither changes anything on this client — the answer comes back as a
  patch like any other. In particular `PaintPanel` — which lives in `paint/`, not here
  — can clear `paused` as a side effect of opening, which is why `Game.tsx`
  guards hover reporting while the menu is up.
- **Reads `net/`** for `fetchSessions` (self and games), `onRoster` and
  `remotes` (the player list), plus `sendStart` / `sendMap` in `LobbyPanel`.
- **Reads `shared/protocol.ts`** for `Role` and `figure/poses.ts` for pose labels.

## Not built yet

No ready-up (a lobby is a place to wait, not a checklist), no score kept across
rounds, no chat, and no settings — sensitivity, FOV, and **volume**, which the
music makes the most conspicuous of the three. Nothing announces the draw at the
moment it happens: a chameleon's first sign of it is the gun leaving their hands
and the world changing around them.
