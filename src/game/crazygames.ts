/**
 * CrazyGames SDK v3 integration layer for Super Chameleon.
 * Provides safe helpers for Instant Multiplayer, room tracking, and invite links
 * with graceful fallback when running outside the portal or offline.
 */

type UpdateRoomOptions = {
  roomId?: string;
  isJoinable?: boolean;
  inviteParams?: Record<string, string>;
};

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
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

/**
 * Initializes the CrazyGames SDK if present on `window`.
 * Safe to call multiple times or when offline.
 */
export async function initCrazySDK(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (sdkPromise) return sdkPromise;

  sdkPromise = (async () => {
    try {
      if (window.CrazyGames?.SDK?.init) {
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
  if (typeof window === "undefined") return false;
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
    const sdkParam = window.CrazyGames?.SDK?.game?.getInviteParam?.("roomId");
    if (sdkParam) return sdkParam.trim().toUpperCase();

    const inviteParams = window.CrazyGames?.SDK?.game?.inviteParams;
    if (inviteParams && typeof inviteParams === "object" && inviteParams.roomId) {
      return String(inviteParams.roomId).trim().toUpperCase();
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
    if (window.CrazyGames?.SDK?.game?.inviteLink) {
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
    window.CrazyGames?.SDK?.game?.removeJoinRoomListener?.(cb);
  } catch {
    // SDK not active
  }
}
