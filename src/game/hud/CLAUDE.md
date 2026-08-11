# hud — the 2D overlays

**Owns:** everything drawn in DOM over the canvas, and the menu you see before
you join.

**Entry points:** `StartMenu`, `LobbyPanel`, `PauseMenu`, `ControlsPanel`,
`PlayerList`, `DeathScreen`, `randomName`.

## Files

- `StartMenu.tsx` — name entry, the map picker, Create game, Join by code. Two
  questions and nothing else.
- `LobbyPanel.tsx` — the invite code, the queued map and Start, over the
  waiting room.
- `MatchClock.tsx` — the seconds left in the match.
- `DroppedPanel.tsx` — the connection died: reconnect, or go back to the menu.
- `PauseMenu.tsx` — resume / leave, where "leave" is a different place in each
  room.
- `ControlsPanel.tsx` — the key legend, one per role.
- `PlayerList.tsx` — who else is connected.
- `DeathScreen.tsx` — respawn or exit.
- `names.ts` — random fallback player names.

## Invariants

1. **This folder never imports from `world/`, `figure/`, `players/` or
   `combat/`.** It renders outside the Canvas and talks to the game through
   `Game.tsx` props and through `net/`. The one exception is reading `POSES` for
   the legend — a label, not behaviour.
2. **Not every difference between the roles is a key.** Only hiders whistle, and
   nothing on either card says so — there is no key for it and nothing to press.
   The legend is for controls; role asymmetries that are not controls belong in
   `players/CLAUDE.md` and `sound/CLAUDE.md`, not here.
3. **`ControlsPanel` holds one legend per role and they are not built from a
   shared base.** If a row is on a card, that role must really have it wired up
   in `players/Player.tsx`. A hider has no shoot; a seeker has no pose, no
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
   seeker and the draw at Start turns all but one of them into hiders. `role`
   therefore arrives on `RoomInfo` and is only ever *displayed*; a control that
   set it would be either ignored or a lie. It also means the lobby shows the
   seeker's card and the seeker's legend to everybody, which is correct — that
   is what they are while they wait.
8. **The public checkbox is ticked by default, and only appears next to
   Create.** A game nobody can find is the exception, not the rule. It is
   decided once, at creation — there is no control for it in the lobby, because
   the server has none either — and it changes *visibility only*: a listed game
   and an unlisted one are both entered by the same code, which is what the
   helper text under the box has to keep saying.
9. **The lobby panel stays up while paused, and that is the only reason it
   works.** Everyone in the waiting room is a seeker, so everyone holds the
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
   answers — how many are we, and who is the seeker — include you. `remotes`
   holds everyone *else* by design (it is a table of bodies to interpolate and
   draw), so your own row comes from `Game.tsx` as props. Every row also carries
   a glyph for its side, because in a column of near-identical monospace lines
   the word alone is easy to skim past.
13. **Those glyphs are emoji, not an icon set.** They come from the operating
   system's own font and need no download, which is the same rule that keeps
   drei's `Environment` and troika text out of the scene: there may be no
   internet at all. Colour repeats the same fact for anyone whose font
   substitutes something unhelpful.
14. **The lobby's Copy button feature-detects the clipboard.**
   `navigator.clipboard` is secure-context only, so over the LAN URL it is
   absent and a bare call left the button silently dead for everyone except
   whoever was testing on localhost. It falls back to `execCommand("copy")` —
   deprecated, and therefore unrestricted. Root doc, trap 8.
15. **The clock is displayed, never counted.** `MatchClock` renders
   `room.timeLeft` straight from state. A local `setInterval` alongside it would
   drift out of step with the counter that actually ends the match.
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
20. **`fetchSessions` is polled every 2 s for two things: `self` and `games`.**
   `self` because the menu needs the Colyseus port, which is not the page's port
   and is not always the one the server listens on. `games` because the listing
   has no push channel — it is a plain fetch, not a second websocket. The LAN
   peer list it also returns is not shown anywhere.

## Contracts

- **`Game.tsx` owns every mode transition.** This folder raises intent
  (`onCreate`, `onJoinCode`, `onResume`, `onLeave`, `onRespawn`, `onReconnect`,
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

No ready-up (a lobby is a place to wait, not a checklist), no scoreboard, no
chat, no settings (sensitivity, volume, FOV), and no round timer — there is no
round: the clock ends a match but nothing says who won, and nothing marks the
moment it ends beyond finding yourself back in the arena. Nothing announces the
draw when a match opens either — now that everyone waits armed, what most
players notice is the gun *leaving* their hands. Nothing returns you to the
lobby when a match ends, because nothing ends a match.
