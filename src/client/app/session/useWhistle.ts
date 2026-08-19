import { useEffect } from "react";
import { sendWhistle } from "@/client/net";
import { WHISTLE_INTERVAL_MS } from "@/shared/protocol";
import type { Role } from "@/shared/protocol";

/**
 * The whistle, for as long as a *chameleon* is alive in a session. It is a
 * periodic tell rather than a round bell — hunters never make one, which is why
 * the role is checked here as well as on the server.
 */
export function useWhistle(joined: boolean, role: Role, dropped: boolean) {
  useEffect(() => {
    if (!joined || role !== "chameleon" || dropped) return;
    const whistle = setInterval(sendWhistle, WHISTLE_INTERVAL_MS);
    return () => clearInterval(whistle);
  }, [joined, role, dropped]);
}
