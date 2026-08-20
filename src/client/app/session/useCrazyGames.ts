import { useEffect } from "react";
import {
  addCrazyJoinListener,
  getInitialInviteRoom,
  initCrazySDK,
  isInstantMultiplayer,
  leaveCrazyRoom,
  removeCrazyJoinListener,
  updateCrazyRoom,
} from "@/client/app/crazygames";
import { fetchSessions } from "@/client/net/sessions";
import { randomName } from "@/shared/names";
import { DEFAULT_MAP } from "@/shared/mapIds";
import type { RoomInfo } from "@/client/net";

/** The size an instant-multiplayer lobby is opened at when none is joinable. */
const INSTANT_LOBBY_SIZE = 8;

type Options = {
  joined: boolean;
  room: RoomInfo | null;
  name: string;
  create: (who: string, map: string, listed: boolean, maxPlayers: number) => void;
  joinCode: (who: string, code: string) => void;
};

/**
 * The portal's three entry points, and the one report back.
 *
 * Every call here is inert unless the SDK says we are in its `local` or
 * `crazygames` environment *and* a crazygames.com frame is above us — see
 * `crazygames.ts`. On a direct visit this hook does nothing at all, and the
 * `?code=` URL invite is what carries an invite instead.
 */
export function useCrazyGames({ joined, room, name, create, joinCode }: Options) {
  useEffect(() => {
    let active = true;

    void initCrazySDK().then(async () => {
      if (!active) return;

      // 1. Launched with an invite room code — a portal invite or ?code=.
      const inviteCode = getInitialInviteRoom();
      if (inviteCode) {
        joinCode(randomName(), inviteCode);
        return;
      }

      // 2. Instant multiplayer: take an open game if there is one, else open one.
      if (!isInstantMultiplayer()) return;
      const playerName = randomName();
      try {
        const { games: openSessions } = await fetchSessions();
        if (!active) return;

        const joinable = openSessions.find(
          (g) => !g.started && !g.starting && g.players < g.maxPlayers,
        );
        if (joinable) joinCode(playerName, joinable.code);
        else create(playerName, DEFAULT_MAP, true, INSTANT_LOBBY_SIZE);
      } catch {
        if (active) create(playerName, DEFAULT_MAP, true, INSTANT_LOBBY_SIZE);
      }
    });

    // 3. A live invitation, arriving while this tab is already in a game.
    const onLiveInvite = (params: Record<string, string>) => {
      const targetRoom = params?.roomId || params?.roomName;
      if (targetRoom) joinCode(name || randomName(), targetRoom);
    };

    addCrazyJoinListener(onLiveInvite);
    return () => {
      active = false;
      removeCrazyJoinListener(onLiveInvite);
    };
  }, [create, joinCode, name]);

  /** Report where this player is, so friends can be shown a way in. */
  useEffect(() => {
    if (!joined || !room) {
      leaveCrazyRoom();
      return;
    }
    updateCrazyRoom(room.lobbyCode ?? room.code, room.phase === "waiting");
  }, [joined, room]);
}
