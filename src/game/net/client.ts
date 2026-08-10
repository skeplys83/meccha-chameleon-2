"use client";

import { Client, getStateCallbacks } from "colyseus.js";
import type { Role } from "@/game/shared/protocol";
import { clearSkin, decodeStroke, forgetSkin, paint } from "@/game/paint/skin";
import { getRoom, setRoom } from "./connection";
import { clearRemotes, emitRoster, remotes } from "./remotes";
import {
  emitGrave,
  emitKilled,
  emitMark,
  emitShot,
  emitWhistle,
  type NetMark,
} from "./events";
import type { Session } from "./sessions";

/** Mirrors the Player schema declared in server/schema.mjs. */
type PlayerSchema = {
  name: string;
  role: Role;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: number;
  cling: boolean;
  strokes: { forEach(cb: (raw: string) => void): void };
};

type Callbacks = {
  players: {
    onAdd(cb: (player: PlayerSchema, sessionId: string) => void): void;
    onRemove(cb: (player: PlayerSchema, sessionId: string) => void): void;
  };
  graves: {
    onAdd(cb: (raw: string, index: number) => void): void;
  };
  onChange(cb: () => void): void;
};

export async function connect(
  name: string,
  role: Role,
  target: Session,
  map: string,
) {
  await disconnect();

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const client = new Client(`${proto}//${target.host}:${target.gamePort}`);
  // The map only counts if this call is what *creates* the room; the server
  // ignores it for anyone joining one that already exists.
  const joined = await client.joinOrCreate("game", { name, role, map });
  setRoom(joined);

  // The room is untyped on this side, so the callback proxy is described by
  // the shape the server actually sends.
  const $ = getStateCallbacks(joined) as unknown as (
    target: unknown,
  ) => Callbacks;

  $(joined.state).players.onAdd((player, sessionId) => {
    if (sessionId === joined.sessionId) return;

    remotes.set(sessionId, {
      id: sessionId,
      name: player.name,
      role: player.role,
      target: {
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
        pose: player.pose,
        cling: player.cling,
      },
    });
    emitRoster();

    // Whatever this player has already painted on themselves, replayed so a
    // late joiner does not see a blank body.
    player.strokes?.forEach((raw) => {
      const stroke = decodeStroke(raw);
      if (stroke) paint(sessionId, stroke);
    });

    // Mutate the existing target in place so the render loop keeps lerping
    // toward it instead of seeing a brand new object each patch.
    $(player).onChange(() => {
      const remote = remotes.get(sessionId);
      if (!remote) return;
      remote.target.x = player.x;
      remote.target.y = player.y;
      remote.target.z = player.z;
      remote.target.yaw = player.yaw;
      remote.target.pitch = player.pitch;
      remote.target.pose = player.pose;
      remote.target.cling = player.cling;
    });
  });

  $(joined.state).players.onRemove((_player, sessionId) => {
    forgetSkin(sessionId);
    if (remotes.delete(sessionId)) emitRoster();
  });

  // Paint from everyone else. The server does not echo a player their own
  // strokes — those were already drawn locally as the brush moved.
  joined.onMessage("paint", (msg: { id: string; strokes: string[] }) => {
    if (!msg?.id || !Array.isArray(msg.strokes)) return;
    for (const raw of msg.strokes) {
      const stroke = decodeStroke(raw);
      if (stroke) paint(msg.id, stroke);
    }
  });

  // Graves are state, so this fires for the ones already there when you join
  // as well as for each new one.
  $(joined.state).graves.onAdd((raw, index) => {
    const [x, y, z] = raw.split(",").map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    emitGrave({ id: `grave-${index}-${raw}`, position: [x, y, z] });
  });

  joined.onMessage("shot", (msg: { id: string }) => {
    if (msg?.id) emitShot(msg.id);
  });

  joined.onMessage("whistle", (msg: { id: string }) => {
    if (msg?.id) emitWhistle(msg.id);
  });

  joined.onMessage(
    "killed",
    (msg: { id: string; by: string; position?: [number, number, number] }) => {
      if (!msg?.id) return;
      emitKilled(msg.id, msg.by ?? "the seeker", msg.position);
    },
  );

  joined.onMessage("clearSkin", (msg: { id: string }) => {
    if (msg?.id) clearSkin(msg.id);
  });

  joined.onMessage("mark", (mark: NetMark) => {
    emitMark(mark);
  });

  joined.onLeave(() => {
    clearRemotes();
  });

  // Whatever the room actually settled on, which may not be what was asked for.
  // Waiting for the first patch is the only way to know: state is empty until it
  // lands, and rendering the wrong geometry for even a frame puts players inside
  // walls their opponents cannot see.
  const settled = joined.state as unknown as { map?: string };
  if (!settled.map) {
    await new Promise<void>((resolve) => {
      joined.onStateChange.once(() => resolve());
    });
  }
  return joined;
}

export async function disconnect() {
  const leaving = getRoom();
  setRoom(null);
  if (leaving) {
    try {
      await leaving.leave();
    } catch {
      // already gone
    }
  }
  clearRemotes();
}
