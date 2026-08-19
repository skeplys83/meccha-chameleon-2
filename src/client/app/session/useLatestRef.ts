import { useEffect, useRef, type RefObject } from "react";

/**
 * The current value of a piece of state, readable from a listener that was
 * registered once. Three effects here need it — an event handler closed over
 * the render that installed it would read whatever `painting` was at the time,
 * which is how a palette that had since closed kept swallowing Esc.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
