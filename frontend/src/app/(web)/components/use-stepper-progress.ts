"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which registered step is closest to the vertical center of the viewport,
 * so a timeline UI can highlight/fill up to it as the user scrolls.
 */
export function useStepperProgress() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepsRef = useRef<(HTMLElement | null)[]>([]);

  const setStepRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      stepsRef.current[index] = el;
    },
    [],
  );

  useEffect(() => {
    let ticking = false;

    const update = () => {
      ticking = false;
      const viewportCenter = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      stepsRef.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveIndex(best);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return { activeIndex, setStepRef };
}
