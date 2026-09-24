"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-reveal";

interface TimelineOptions {
  /** Hold time in ms for each step, in order. Length defines the step count. */
  durations: readonly number[];
  /** Pause while the demo is scrolled off screen. */
  active?: boolean;
  /** Restart from step 0 after the final step. */
  loop?: boolean;
  /** Extra pause on the final step before the loop resets, in ms. */
  restDelay?: number;
}

/**
 * Advances a step index along a timeline of hold times — the engine behind
 * every conversation demo on the page.
 *
 * Two behaviors matter as much as the animation itself:
 *  - Paused while off screen, so a long page is not driving several timers.
 *  - Under `prefers-reduced-motion` it settles on the final step immediately
 *    and never ticks, so the full conversation is readable as a static
 *    transcript rather than being hidden behind motion the visitor declined.
 */
export function useTimeline({ durations, active = true, loop = true, restDelay = 0 }: TimelineOptions) {
  const reducedMotion = usePrefersReducedMotion();
  const lastStep = durations.length - 1;

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);

  const restart = useCallback(() => {
    setStep(0);
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => setPlaying((value) => !value), []);

  useEffect(() => {
    if (reducedMotion) {
      // Settle on the final step once, then leave the index alone — otherwise
      // this would snap back on every render and a visitor who has asked for
      // reduced motion could never scrub the chapters by hand.
      if (!settledRef.current) {
        settledRef.current = true;
        setStep(lastStep);
      }
      return;
    }
    settledRef.current = false;
    if (!active || !playing) return;

    const isLast = step >= lastStep;
    if (isLast && !loop) return;

    const hold = (durations[step] ?? 1200) + (isLast ? restDelay : 0);
    timerRef.current = setTimeout(() => {
      setStep((current) => (current >= lastStep ? 0 : current + 1));
    }, hold);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, active, playing, loop, restDelay, durations, lastStep, reducedMotion]);

  return {
    step,
    lastStep,
    playing: playing && !reducedMotion,
    progress: lastStep === 0 ? 1 : step / lastStep,
    reducedMotion,
    setStep,
    setPlaying,
    toggle,
    restart,
  };
}
