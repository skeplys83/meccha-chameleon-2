/**
 * CrazyGames SDK v3 integration layer for Super Chameleon.
 * Provides safe helpers for Instant Multiplayer, room tracking, and invite links
 * with graceful fallback when running outside the portal or offline.
 *
 * **The portal integration is switched off** — see `SDK_ENABLED` below. Every
 * SDK-touching function short-circuits, and the `<script>` that loaded the SDK
 * is gone from `index.html`.
 *
 * **What is still live is the plain invite link**, which was always the
 * fallback here and is what the game runs on now: `generateInviteLink` builds
 * `?code=ABCD` against our own origin for the lobby's Copy button, and
 * `getInitialInviteRoom` reads `?code=` / `?room=` back off the URL for the
 * start menu and the auto-join. Neither has anything to do with the portal.
 * Do not delete this file to remove CrazyGames; those two go with it.
 */

/**
 * Whether to talk to the portal at all.
 *
 * One flag rather than a deleted integration, because the code costs nothing
 * switched off and this may be worth another go. Turning it back on takes two
 * edits: this, *and* putting the SDK script back in the `<head>` of
 * `index.html` —
 *
 *     <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
 *
 * The flag alone leaves every call here looking for a `window.CrazyGames` that
 * no longer loads. The tag is written down here rather than left commented out
 * in `index.html`, so nothing about it ships in the page.
 */
const SDK_ENABLED = false;

type UpdateRoomOptions = {
  roomId?: string;
  isJoinable?: boolean;
  inviteParams?: Record<string, string>;
};

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        environment?: "local" | "crazygames" | "disabled";
        init: () => Promise<void>;
        game?: {
          isInstantMultiplayer?: boolean;
          inviteParams?: Record<string, string> | null;
          getInviteParam?: (key: string) => string | null;
          inviteLink?: (params: Record<string, string | number>) => string;
          updateRoom?: (options: UpdateRoomOptions) => void;
          leftRoom?: () => void;
          addJoinRoomListener?: (cb: (params: Record<string, string>) => void) => void;
          removeJoinRoomListener?: (cb: (params: Record<string, string>) => void) => void;
        };
      };
    };
  }
}

let sdkPromise: Promise<boolean> | null = null;

const CRAZY_HOSTS = ["crazygames.com", "crazygames.co.uk"];

function isCrazyHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CRAZY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** A cross-origin `window.top` throws on access, which is itself an embed. */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Is the frame above us CrazyGames? `ancestorOrigins` is the reliable answer
 * (Chromium/Safari); Firefox has none, so fall back to the referrer, and trust
 * the SDK's own `environment` when even that is stripped.
 */
function hasCrazyAncestor(): boolean {
  const origins = window.location.ancestorOrigins;
  if (origins && origins.length > 0) {
    for (let i = 0; i < origins.length; i++) {
      if (isCrazyHost(origins[i])) return true;
    }
    return false;
  }
  if (document.referrer) return isCrazyHost(document.referrer);
  return true;
}

let supported: boolean | null = null;

/**
 * CrazyGames deliberately disables the SDK on third-party production domains,
 * and a direct visit to one of ours is not a portal session either — the game
 * is fully playable there, but no SDK method may be called. `local` is exempt
 * from the embed test so `npm run dev` still exercises the portal path.
 */
function isSupportedSdkEnvironment(): boolean {
  // The one gate every SDK call in this file already passes through, which is
  // why switching the integration off needs nothing else.
  if (!SDK_ENABLED) return false;
  if (supported !== null) return supported;
  const environment = window.CrazyGames?.SDK?.environment;
  // Do not memoize before the SDK script has reported one.
  if (!environment) return false;
  supported =
    environment === "local" ||
    (environment === "crazygames" && isEmbedded() && hasCrazyAncestor());
  return supported;
}

/**
 * Initializes the CrazyGames SDK if present on `window`.
 * Safe to call multiple times or when offline.
 */
export async function initCrazySDK(): Promise<boolean> {
  if (!SDK_ENABLED || typeof window === "undefined") return false;
  if (sdkPromise) return sdkPromise;

  sdkPromise = (async () => {
    try {
      if (isSupportedSdkEnvironment() && window.CrazyGames?.SDK?.init) {
        await window.CrazyGames.SDK.init();
        return true;
      }
    } catch (e) {
      console.warn("CrazyGames SDK failed to initialize:", e);
    }
    return false;
  })();

  return sdkPromise;
}

/**
 * Checks whether CrazyGames requested the game to enter multiplayer mode instantly.
 */
export function isInstantMultiplayer(): boolean {
  if (typeof window === "undefined" || !isSupportedSdkEnvironment()) return false;
  return Boolean(window.CrazyGames?.SDK?.game?.isInstantMultiplayer);
}

/**
 * Reads any initial room ID or invite code passed into the game on startup.
 * Checks CrazyGames invite parameters first, then URL query parameters (?code=... / ?room=...).
 */
export function getInitialInviteRoom(): string | null {
  if (typeof window === "undefined") return null;

  try {
    // 1. Check CrazyGames SDK invite parameters
    if (isSupportedSdkEnvironment()) {
      const sdkParam = window.CrazyGames?.SDK?.game?.getInviteParam?.("roomId");
      if (sdkParam) return sdkParam.trim().toUpperCase();

      const inviteParams = window.CrazyGames?.SDK?.game?.inviteParams;
      if (inviteParams && typeof inviteParams === "object" && inviteParams.roomId) {
        return String(inviteParams.roomId).trim().toUpperCase();
      }
    }

    // 2. Check standard URL query parameters (?code=XYZ or ?room=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code") || urlParams.get("room");
    if (code) {
      return code.trim().toUpperCase();
    }
  } catch {
    // URL parsing failure or restricted environment
  }

  return null;
}

/**
 * Generates an invite link for the current room.
 * Uses CrazyGames SDK if available, or falls back to the direct web URL.
 */
export function generateInviteLink(roomId: string): string {
  const cleanId = roomId.trim().toUpperCase();

  try {
    if (isSupportedSdkEnvironment() && window.CrazyGames?.SDK?.game?.inviteLink) {
      return window.CrazyGames.SDK.game.inviteLink({ roomId: cleanId });
    }
  } catch (e) {
    console.warn("Failed to generate CrazyGames invite link:", e);
  }

  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(cleanId)}`;
  }

  return cleanId;
}

/**
 * Reports room state changes to CrazyGames so friends can join or see status.
 */
export function updateCrazyRoom(roomId: string, isJoinable: boolean) {
  try {
    if (!isSupportedSdkEnvironment()) return;
    const cleanId = roomId.trim().toUpperCase();
    window.CrazyGames?.SDK?.game?.updateRoom?.({
      roomId: cleanId,
      isJoinable,
      inviteParams: { roomId: cleanId },
    });
  } catch (e) {
    console.warn("Failed to update CrazyGames room state:", e);
  }
}

/**
 * Notifies CrazyGames that the player has left their multiplayer room.
 */
export function leaveCrazyRoom() {
  try {
    if (!isSupportedSdkEnvironment()) return;
    window.CrazyGames?.SDK?.game?.leftRoom?.();
  } catch (e) {
    console.warn("Failed to notify CrazyGames leftRoom:", e);
  }
}

/**
 * Registers a listener for live room join invitations sent through CrazyGames.
 */
export function addCrazyJoinListener(
  cb: (params: Record<string, string>) => void,
) {
  try {
    if (!isSupportedSdkEnvironment()) return;
    window.CrazyGames?.SDK?.game?.addJoinRoomListener?.(cb);
  } catch {
    // SDK not active
  }
}

/**
 * Unregisters a live room join listener.
 */
export function removeCrazyJoinListener(
  cb: (params: Record<string, string>) => void,
) {
  try {
    if (!isSupportedSdkEnvironment()) return;
    window.CrazyGames?.SDK?.game?.removeJoinRoomListener?.(cb);
  } catch {
    // SDK not active
  }
}
