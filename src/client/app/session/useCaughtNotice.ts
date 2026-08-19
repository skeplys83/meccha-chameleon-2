import { useEffect, useState } from "react";
import { onCaught, selfId } from "@/client/net";
import { useLatestRef } from "./useLatestRef";

/** How long the "caught by" notice stays up. */
const NOTICE_MS = 3500;

/**
 * You were caught. The notice is a moment, not a screen, and it needs no reset
 * on a room change: the reveal alone is thirty seconds, so it has always
 * expired long before anybody reaches the next round, and it is hidden during
 * the reveal anyway.
 */
export function useCaughtNotice(joined: boolean, onCatch: () => void) {
  const [caughtBy, setCaughtBy] = useState<string | null>(null);
  // Read at catch time rather than closed over, so the subscription survives a
  // parent re-render without being torn down and missing a catch in the gap.
  const catchRef = useLatestRef(onCatch);

  useEffect(() => {
    if (!joined) return;
    return onCaught((victimId, by) => {
      if (victimId !== selfId()) return;
      setCaughtBy(by);
      catchRef.current();
    });
  }, [joined, catchRef]);

  useEffect(() => {
    if (!caughtBy) return;
    const t = setTimeout(() => setCaughtBy(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [caughtBy]);

  return { caughtBy };
}
