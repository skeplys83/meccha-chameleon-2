/**
 * GameDistribution's HTML5 SDK — the ad break, and the two events around it.
 *
 * Their docs: <https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation>.
 * The surface we use is small: a `GD_OPTIONS` global read as the script loads,
 * `SDK_GAME_PAUSE` when an ad takes the screen, `SDK_GAME_START` when it gives
 * it back, and `gdsdk.showAd()` to ask for one. (`showBanner()` is their
 * deprecated name for the same thing.)
 *
 * **Loaded once, early, and never from a button.** Their words: "Make sure that
 * the SDK is loaded before your game starts or while your game is loaded for
 * the best user experience. Not after, and especially not by clicking a button
 * within the game, as then it will take too long for an advertisement to load."
 * `useGameDistribution` mounts with the app, which is that moment.
 *
 * **Showing one is the opposite: only ever from a click.** Four rules of theirs
 * govern placement, and the game has to hold up all four — ads only on user
 * input, only outside gameplay, game paused, game muted. The last two are
 * `usePauseControl`'s job and the first two are the hook's.
 *
 * **Nothing here runs unless the game is being played through them.** The SDK
 * loads only when the page carries `gd_sdk_referrer_url`, which the wrapper
 * always appends and a direct visitor to superchameleon.io never has. Two
 * reasons, and the first is the one that matters: **an ad SDK that loads on
 * the game's own site can take the game down with it** — an ad container over
 * the canvas, an `SDK_GAME_PAUSE` with no `SDK_GAME_START` behind it, anything
 * — and there is no reason to accept that risk for traffic they are not part
 * of. The second is simply that direct traffic is not theirs to monetise.
 *
 * **This game is self-hosted, which they allow.** Their developer guidelines
 * refuse external hosting "except for Real Multiplayer games", which is what
 * this is — a lobby is a live websocket room and there is no static bundle to
 * upload. What gets uploaded instead is a wrapper page whose iframe points here
 * and carries `gd_sdk_referrer_url`; the SDK reads that itself and nothing in
 * this file has to — see `docs/DEPLOYMENT.md` and `gamedistribution/index.html`.
 */

/**
 * The game's hash from the GameDistribution control panel — 32 hex characters,
 * like `49258a0e497c42b5b5d87887f24d27a6`.
 *
 * **Empty means the integration is entirely off**: no script is fetched, no ad
 * is ever asked for, and `adBreak` never fires. It is not a secret and ships in
 * the bundle either way.
 */
// Annotated `string` rather than inferred: without it TypeScript narrows this
// to its own literal, and the `!== ""` switch below becomes a comparison it
// believes can never be false.
const GAME_ID: string = "a12326545a5a48aabf27566e0f4907ec";

/**
 * How long an ad break may last before the game takes itself back.
 *
 * `SDK_GAME_START` is the only thing that ends a break. Their SDK is meant to
 * "gracefully fail", but a blocked script, a dead ad server or a bug there
 * would otherwise leave the game paused and muted with nothing on screen — and
 * the round clock is on the *server* and stops for nobody, so that is a lost
 * round rather than an inconvenience.
 */
const AD_TIMEOUT_MS = 60_000;

type GdEvent = { name?: string };

declare global {
  interface Window {
    GD_OPTIONS?: {
      gameId: string;
      onEvent: (event: GdEvent) => void;
      advertisementSettings?: Record<string, unknown>;
    };
    /** The SDK installs itself here. Their README: the name cannot be changed,
     *  because games on the old integration still reach for it. */
    gdsdk?: { showAd?: () => void; openConsole?: () => void };
  }
}

const SCRIPT_ID = "gamedistribution-jssdk";
const SCRIPT_SRC = "https://html5.api.gamedistribution.com/main.min.js";

let started = false;
/** Set while an ad is on screen, so a second request is not stacked on it. */
let playing = false;
let timeout: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<(playing: boolean) => void>();

/**
 * Called with `true` when an ad takes the screen and `false` when it gives it
 * back. Everything that must stand still during an ad hangs off this.
 */
export function onAdBreak(fn: (playing: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setPlaying(next: boolean) {
  if (playing === next) return;
  playing = next;
  if (timeout) clearTimeout(timeout);
  timeout = null;
  if (next) timeout = setTimeout(() => setPlaying(false), AD_TIMEOUT_MS);
  listeners.forEach((fn) => fn(next));
}

/**
 * Whether this page is being played through GameDistribution.
 *
 * The wrapper in `gamedistribution/` appends `gd_sdk_referrer_url` to the
 * frame it opens, and nothing else does — so its presence is the one honest
 * signal that this is portal traffic rather than somebody who typed the domain
 * in. Being framed is *not* that signal: the game can be embedded anywhere.
 */
function throughPortal() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("gd_sdk_referrer_url");
  } catch {
    return false;
  }
}

/** Whether ads are configured *and* this is a session they belong in. */
export const adsEnabled = () => GAME_ID !== "" && throughPortal();

/**
 * Load the SDK, once. Safe to call repeatedly; does nothing without a
 * `GAME_ID`.
 */
export function initGameDistribution() {
  if (started || !adsEnabled() || typeof window === "undefined") return;
  started = true;

  // Before the script, never after: the SDK reads this global as it loads.
  window.GD_OPTIONS = {
    gameId: GAME_ID,
    onEvent: (event: GdEvent) => {
      switch (event?.name) {
        // Their names are from the *game's* point of view and read backwards
        // here: PAUSE is an ad starting, START is the game getting itself back.
        case "SDK_GAME_PAUSE":
          setPlaying(true);
          break;
        case "SDK_GAME_START":
          setPlaying(false);
          break;
        // A dead SDK must not leave the game frozen behind an ad that will
        // never arrive. The timeout would catch it; this catches it at once.
        case "SDK_ERROR":
        case "AD_ERROR":
          setPlaying(false);
          break;
      }
    },
  };

  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = SCRIPT_SRC;
  script.async = true;
  // A blocked script is the ordinary case, not an exception: this is an ad
  // network and a good share of players run something that stops it. The game
  // is unaffected — `showAd` simply never finds a `gdsdk` to ask.
  script.onerror = () => {
    started = false;
  };
  document.head.appendChild(script);
}

/**
 * Ask for an ad. Returns whether one was actually requested.
 *
 * **Call this from a click handler and nowhere else.** Their rule is that ads
 * display only on user input, and a browser will refuse to autoplay the video
 * anyway. There is no need to ration calls — they regulate the interval
 * themselves, so a request that arrives too soon is simply declined.
 */
export function showAd() {
  if (!adsEnabled() || playing) return false;
  // Guarded exactly as their README asks, because an ad blocker stopping the
  // script is the normal case rather than an error.
  const show = window.gdsdk?.showAd;
  if (typeof show !== "function") return false;
  try {
    show.call(window.gdsdk);
    return true;
  } catch (e) {
    console.warn("GameDistribution: showAd failed:", e);
    return false;
  }
}
