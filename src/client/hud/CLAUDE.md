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
- **A lobby has four phases, and `LobbyPanel` only draws two of them.**
  `waiting` and `countdown` are its own; during `hiding` it is replaced outright
  by `HunterWait`, because the invite code, the roster and the map picker all
  answer questions the round has already settled — it read as a game still
  waiting to start. `reveal` only happens when a match ended before its hunter
  was sent in, and the panel suppresses Start and its player count for it.
- **Nothing in the top-centre column positions itself.** `Game.tsx` stacks the
  lobby card and `PhaseBanner` in one flex column, so the gap is laid out rather
  than guessed at. Both used to be pinned `absolute top-4` and the clock
  rendered *behind* the panel; the first fix was an offset prop, which was worse
  — it had to be recalculated whenever the panel's height changed, and it was
  silently wrong the whole time because nothing passed it.
- **The pause menu has one way out, and it leaves the game.** It used to offer a
  match player "return to the waiting room", which dropped them into a lobby
  whose clock was still running — indistinguishable from still being in the
  round. Either you are playing it or you are out.
- **The map picker lists `MATCH_MAP_LIST`, never `MAP_LIST`**: the arena is
  where you already are.
- **A listed game shows the players in the whole game**, across both its rooms.
- **`ChatPanel` owns bottom-left, and only its bottom box has a background.**
  The other three corners are taken — `PlayerList`, `ControlsPanel`,
  `PaintPanel` — and the error toast has bottom-centre. `DebugPanel` is pushed
  to `left-[22rem]` to clear it, unconditionally, because a dev chip that moves
  between rooms is harder to find than one that does not. The box renders in
  `waiting` and `countdown`, the same window the server accepts a `chat`
  message in (`Game.tsx` owns that condition) and takes its lines as a prop —
  subscribing to `onChat` from inside it missed the backlog replayed during the
  join, see `app/session/useRoomChat` — and for the whole of it: closed
  it is the prompt naming the key, open it is the field. It used to appear only
  once somebody had spoken, which left the first player in a lobby no way to
  discover chat existed. **The lines above it float** — no plate, no blur, no
  scrollbar, `pointer-events-none`, and clipped at the top by `justify-end`
  inside a `max-h` rather than scrolled, so a long conversation cannot grow up
  the screen. **The prompt is the only place `T` is advertised** —
  the controls legend deliberately does not repeat it, and the key is therefore
  *not* gated on `paused` or `painting`, because a prompt that is legible while
  the key does nothing is worse than no prompt. Its input **stops every keydown**: the movement keys are bound on
  `window` by drei's `KeyboardControls`, so without it typing "was" walks you
  across the arena. That is also why Esc is handled inside the input rather
  than by `usePauseControl` — the stopped event never reaches the global one.
- **The clock is displayed, never counted.** `timeLeft` comes off room state.
- **The DEV chip stays visible when the readout is hidden.** It is the toggle,
  and a switch that vanishes when you use it is a trap.

---

Twenty-four invariants, the create-game modal's reasoning, and the listing's
polling contract: [docs/notes/hud.md](../../../docs/notes/hud.md).
