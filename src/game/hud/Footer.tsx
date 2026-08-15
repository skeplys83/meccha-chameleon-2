/**
 * The footer, pinned to the bottom of whatever full-screen panel it is in.
 *
 * It is **outside** the scrolling part of that panel, which is the only way it
 * stays at the bottom of the *page* rather than at the bottom of the content: an
 * absolutely positioned child of a scroll container scrolls away with everything
 * else. Panels using it therefore leave room for it at the foot of their scroll
 * area.
 */
export function Footer({ onLegal }: { onLegal?: () => void }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 py-3 text-xs text-neutral-600">
      {/* The year is read rather than written down, so it cannot go stale. */}
      <span>© {new Date().getFullYear()} Super Chameleon</span>
      {onLegal && (
        <>
          <span aria-hidden>·</span>
          <button
            onClick={onLegal}
            className="underline underline-offset-4 transition hover:text-neutral-300"
          >
            Legal
          </button>
        </>
      )}
    </footer>
  );
}
