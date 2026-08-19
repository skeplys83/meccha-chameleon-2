import { useEffect, useState } from "react";
import { onGrave, onLeftRoom, type Grave } from "@/client/net";

/**
 * Where each chameleon was found this round. Graves belong to their room, so
 * they are dropped on `onLeftRoom` with everything else that does — see the
 * reset rule in the root doc.
 */
export function useRoomGraves(): Grave[] {
  const [graves, setGraves] = useState<Grave[]>([]);

  // De-duplicated because the backlog and the live feed arrive through one
  // stream, and a reconnection can replay a grave this client already has.
  useEffect(
    () =>
      onGrave((grave) =>
        setGraves((prev) => (prev.some((g) => g.id === grave.id) ? prev : [...prev, grave])),
      ),
    [],
  );

  useEffect(() => onLeftRoom(() => setGraves([])), []);

  return graves;
}
