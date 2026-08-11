/**
 * Who this browser tab is, for as long as it is open.
 *
 * Colyseus's `sessionId` identifies a *connection to one room*, and it is
 * replaced every time you change rooms — so from the server's point of view the
 * person who opened a lobby and the person who comes back from its match are
 * two strangers. This is the one thing that says they are the same tab, and it
 * is what lets a lobby keep its host across a round.
 *
 * **`sessionStorage`, not `localStorage`**, and that is not a detail. Two tabs
 * on one machine is how this game gets tested, and `localStorage` is shared
 * across them — both tabs would claim to be the same player, and both would
 * claim the host's button. `sessionStorage` gives each tab its own and survives
 * a reload, which is the same reasoning that put the player's name there.
 *
 * It is a claim, not a credential: it goes over the wire and anyone could send
 * somebody else's. That is the same trust model as everything else here — no
 * accounts, friends on a couch — and the worst it buys is a Start button.
 */
const KEY = "mc_pid";

let cached: string | null = null;

/**
 * Sixteen random bytes as hex.
 *
 * **Not `crypto.randomUUID()`.** That is restricted to secure contexts, so it
 * exists on `localhost` and over HTTPS and *nowhere else* — including
 * `http://192.168.x.x:3000`, which is how every guest opens this game. It fails
 * as `crypto.randomUUID is not a function`, and only ever for the people who are
 * not the developer.
 *
 * `getRandomValues` carries no such restriction and is the part of the Web
 * Crypto API that works everywhere. The result is not UUID-formatted; nothing
 * reads it as one.
 */
function freshId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function playerId() {
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage is unavailable in some privacy modes. Fall through to a fresh id,
    // which lasts as long as the page does — worse than a reload-proof one, and
    // still better than having none.
  }

  const fresh = freshId();
  try {
    sessionStorage.setItem(KEY, fresh);
  } catch {
    // As above: the id still works for this page's lifetime.
  }
  cached = fresh;
  return fresh;
}
