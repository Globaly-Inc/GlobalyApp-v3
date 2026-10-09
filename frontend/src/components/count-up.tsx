"use client";

import { useEffect, useState } from "react";

const fmt = (n: number) => Math.round(n).toLocaleString();

/** A number that counts up from 0 to `value` (ease-out, ~700ms) when it mounts or changes.
 * Shows the final value straight away under prefers-reduced-motion. */
export function CountUp({ value, duration = 700, format = fmt }: Readonly<{ value: number; duration?: number; format?: (n: number) => string }>) {
  const [shown, setShown] = useState(0);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setShown(value * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);
  return <span className="tabular-nums">{format(reduce ? value : shown)}</span>;
}
