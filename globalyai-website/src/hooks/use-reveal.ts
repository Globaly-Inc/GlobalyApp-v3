"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Reveals an element once, the first time it enters the viewport.
 *
 * Starts `visible` at false and flips it on intersection, which is what the
 * `.reveal` class transitions against. Under `prefers-reduced-motion` the CSS
 * pins `.reveal` to its final state, so nothing here needs a special case.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = "-12% 0px") {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Without IntersectionObserver nothing would ever flip `visible`, and the
    // page would stay blank. Write the attribute the CSS keys off directly
    // rather than through state: it reaches the same end state without a
    // render, so there is no synchronous setState in this effect.
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.visible = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, visible };
}

/**
 * Tracks whether an element is currently on screen — used to pause the looping
 * product demos while they are scrolled away, so an idle tab is not animating
 * several conversations at once.
 *
 * If IntersectionObserver is missing the demos simply never start, which is a
 * degraded but harmless state: no content depends on this hook to be readable.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = "0px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin, threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Reads the OS "reduce motion" setting, and keeps up if it changes mid-session.
 *
 * useSyncExternalStore rather than useState + useEffect: the preference is an
 * external store, so this subscribes to it properly instead of mirroring it
 * into React state on mount. The server snapshot is `false` so the markup
 * matches what an unstyled first paint would show.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
