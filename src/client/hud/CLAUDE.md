# hud — everything drawn outside the Canvas

**Owns:** the menus, the panels, the legends, and the loading screen.

## What's here

The start menu and its create-game modal, the lobby panel, the player list, the
phase banner, the pause and dropped panels, the round-over panel, the controls
legend, the loading screen, the mobile gate, the legal page, and the developer
readout.

## The three rules that will bite you

1. **This folder never imports from `world/`, `figure/`, `players/` or
   `combat/`.** It is DOM outside the Canvas and talks to the game through
   `app/Game.tsx` props and through `net/`. Reading `figure/poses` for a label is
   the one allowed exception. **This is now an ESLint rule**, not an honour
   system — the last time it was breached, React state ended up in a frame loop.
2. **The debug readout samples; it is never driven by the frame loop.**
   `players/Player.tsx` writes a snapshot into `app/dev.ts` and the panel reads
   it ten times a second. Anything else worth watching goes through that
   snapshot — not a new import, not props threaded down from `Game.tsx`.
3. **Nobody picks a side, and no menu may offer one.** Everyone waits as a
   hunter and the draw happens at the countdown's end, so the player list hides
   roles until they exist — labelling them earlier prints "hunter" beside every
   name and spoils something that has not happened yet.

## Contracts

- **Only the host sees Start or the map buttons**, and that is a display rule on
  top of a server check, never instead of one.
- **The lobby panel stays up while paused** — everyone in a lobby holds the
  pointer lock, so pausing is the only moment Start is clickable at all.
- **The map picker lists `MATCH_MAP_LIST`, never `MAP_LIST`**: the arena is
  where you already are.
- **A listed game shows the players in the whole game**, across both its rooms.
- **The clock is displayed, never counted.** `timeLeft` comes off room state.
- **The DEV chip stays visible when the readout is hidden.** It is the toggle,
  and a switch that vanishes when you use it is a trap.

---

Twenty-four invariants, the create-game modal's reasoning, and the listing's
polling contract: [docs/notes/hud.md](../../../docs/notes/hud.md).
