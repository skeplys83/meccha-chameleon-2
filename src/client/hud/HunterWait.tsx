/**
 * What the hunter sees while the others hide.
 *
 * It replaces `LobbyPanel` outright for that one phase. The invite code, the
 * roster and the map picker are all answers to "who else is coming and what
 * are we playing" — questions that were settled the moment the round began, and
 * the panel asking them made a started game look like it was still waiting.
 * The clock is the `PhaseBanner` stacked under this.
 */
export function HunterWait() {
  return (
    <div className="pointer-events-none w-[22rem] select-none rounded-lg border border-rose-500/40 bg-neutral-950/90 px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-rose-400">
        You are the hunter
      </div>
      <div className="mt-1 text-lg font-medium text-neutral-100">
        They are hiding
      </div>
      <p className="mt-1 text-xs leading-snug text-neutral-500">
        Wait here while they find a spot. You go in when the bell rings.
      </p>
    </div>
  );
}
