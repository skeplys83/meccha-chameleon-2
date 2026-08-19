import { useEffect } from "react";
import {
  onDropped,
  onLeftRoom,
  onMoved,
  onMoveFailed,
  onRoom,
  type RoomInfo,
} from "@/client/net";
import { forgetAllSkins } from "@/client/paint/skin";
import { cancelLock } from "@/client/players/pointerLock";
import { stopAllLoops } from "@/client/sound/engine";
import { clearPlayerDebug } from "@/client/app/dev";

type Handlers = {
  setRoom: (info: RoomInfo) => void;
  setDropped: (dropped: boolean) => void;
  setError: (message: string) => void;
  closeOverlays: () => void;
};

/**
 * Every subscription this component holds on the network, in one place.
 *
 * **A change of room is a clean slate, and `onLeftRoom` is the one place that
 * says so.** Anything that belongs to a room resets there — paint and looping
 * sounds here, marks and graves elsewhere. Do not add a second mechanism; a
 * reset that lives somewhere else is one a future feature will not know to join.
 */
export function useNetEvents({ setRoom, setDropped, setError, closeOverlays }: Handlers) {
  // Every later change to the room — the host starting the match, a new host, a
  // different map queued up, the clock — arrives as a patch rather than a
  // return value.
  useEffect(() => onRoom(setRoom), [setRoom]);

  useEffect(
    () =>
      onLeftRoom(() => {
        forgetAllSkins();
        stopAllLoops();
        clearPlayerDebug();
      }),
    [],
  );

  /** Carried into a different room, which clears whatever was open over the old one. */
  useEffect(() => onMoved(closeOverlays), [closeOverlays]);

  // A hand-off that left you behind. Whichever room you are in is still yours
  // to sit in, so this is a message and not an exit.
  useEffect(
    () => onMoveFailed((reason) => setError(`Could not change room. ${reason}`)),
    [setError],
  );

  /** The socket died. */
  useEffect(
    () =>
      onDropped(() => {
        setDropped(true);
        closeOverlays();
        cancelLock();
        stopAllLoops();
        document.exitPointerLock();
      }),
    [setDropped, closeOverlays],
  );
}
