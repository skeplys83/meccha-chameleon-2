import { useEffect, useState } from "react";
import { onChat, onLeftRoom, type ChatMessage } from "@/client/net";

/**
 * The lobby's chat log.
 *
 * **This subscribes here rather than inside `hud/ChatPanel`, and that is the
 * whole point of it.** The panel is mounted only once `room` has arrived, but
 * `net/client.ts` replays the existing log during `attach` — before the join
 * promise resolves and therefore before anything conditional has rendered. A
 * subscription owned by the panel missed every line that was already there, so
 * a player joining a lobby mid-conversation saw an empty box. Called from
 * `Game.tsx` unconditionally, the listener predates the join, exactly as
 * `useRoomGraves` does.
 */
export function useRoomChat(): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // The log arrives whole and replaces what we had, so there is nothing to
  // de-duplicate and no trim to reconcile — `net/client.ts` says why.
  useEffect(() => onChat(setMessages), []);

  // The log belongs to its room. Going into a match drops it and coming back
  // replays the lobby's own — see the reset rule in the root doc.
  useEffect(() => onLeftRoom(() => setMessages([])), []);

  return messages;
}
