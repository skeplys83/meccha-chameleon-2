import { useEffect, useState } from "react";
import { onChat, onLeftRoom, type ChatMessage } from "@/client/net";

/**
 * What has been said in this lobby since we walked into it.
 *
 * **Nothing is replayed.** Chat is a broadcast the server keeps no copy of, so
 * a player joining mid-conversation starts on an empty box — a lobby is a room
 * you can only hear while you are standing in it.
 *
 * It still subscribes here rather than inside `hud/ChatPanel`: the panel mounts
 * only once `room` has arrived, which is a few hundred milliseconds after the
 * socket is live, and a line landing in that window would be lost. Called from
 * `Game.tsx` unconditionally, the listener predates the join — exactly as
 * `useRoomGraves` does, which *is* replayed.
 */
export function useRoomChat(): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // The list arrives whole and replaces what we had, so there is nothing to
  // de-duplicate and no trim to reconcile — `net/client.ts` owns it.
  useEffect(() => onChat(setMessages), []);

  // The log belongs to its room, and it is the only copy anywhere: going into a
  // match drops it for good — see the reset rule in the root doc.
  useEffect(() => onLeftRoom(() => setMessages([])), []);

  return messages;
}
