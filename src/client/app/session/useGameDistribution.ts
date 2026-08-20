import { useCallback, useEffect, useState } from "react";
import { initGameDistribution, onAdBreak, showAd } from "@/client/app/gamedistribution";

/**
 * The ad break, and the handle the two placements are hung on.
 *
 * **The SDK loads on mount and an ad only ever plays on a click.** Those pull
 * in opposite directions and both are theirs: load early or the first ad takes
 * too long to arrive, but show only on user input or a browser will not play
 * the video at all.
 *
 * **Where the two ads go**, against their rule that ads display outside
 * gameplay only:
 *
 * - **Pre-roll** on the click that enters a game, which is their "Start / Play"
 *   button. The ad runs over the loading screen, which is dead time anyway.
 * - **Mid-roll** on leaving a game from the pause menu, which is their "Menu"
 *   button on a game-over screen.
 *
 * **What is deliberately *not* a placement is the host's Start button.** It
 * begins a five-second countdown that everyone else is also watching, and the
 * round runs on a server clock — an ad there is a player who misses the start
 * of the hiding phase, which is gameplay by any reading of their rule.
 *
 * The round-over screen is the placement their guidance assumes and this game
 * does not have: `RoundOverPanel` has no buttons, because the reveal returns
 * everyone to the lobby on its own. Giving it one would be the way to more
 * inventory, and is a design change rather than a wiring change.
 *
 * Returns whether an ad is on screen. `Game.tsx` feeds that to
 * `usePauseControl`, which mutes the game and hands back the pointer lock —
 * their other two rules, and an ad you cannot click because the cursor is
 * captured is worse than no ad.
 */
export function useGameDistribution() {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    initGameDistribution();
    return onAdBreak(setPlaying);
  }, []);

  /** Stable, so the callbacks in `Game.tsx` that wrap it stay stable too. */
  const requestAd = useCallback(() => {
    showAd();
  }, []);

  return { adBreak: playing, requestAd };
}
