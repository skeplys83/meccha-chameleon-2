/** The whole screen, while the map under your feet is still arriving. */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-neutral-950">
      {/* Border-based, so it is one element and no SVG: a ring of dim border
          with one bright edge, spun. `border-t` alone is what makes the ring
          read as turning — a uniform ring would be indistinguishable from a
          static circle however fast it went. */}
      <div
        className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-800 border-t-neutral-200"
        role="status"
        aria-label="Loading"
      />
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-neutral-500">
        Loading…
      </div>
    </div>
  );
}
