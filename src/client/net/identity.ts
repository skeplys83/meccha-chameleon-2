/** Who this browser tab is, for as long as it is open. */
const KEY = "mc_pid";

let cached: string | null = null;

/** Sixteen random bytes as hex. */
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
