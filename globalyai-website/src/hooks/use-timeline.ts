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
 * Three behaviors matter as much as the animation itself:
 *  - Paused while off screen, so a long page is not driving several timers.
 *  - A pause keeps what is left of the current hold, so resuming picks the
 *    beat up where it stopped rather than replaying its whole duration.
 *  - Under `prefers-reduced-motion` it settles on the final step immediately
 *    and never ticks, so the full conversation is readable as a static
 *    transcript rather than being hidden behind motion the visitor declined.
 */
export function useTimeline({ durations, active = true, loop = true, restDelay = 0 }: TimelineOptions) {
  const reducedMotion = usePrefersReducedMotion();
  const lastStep = durations.length - 1;

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const settledRef = useRef(false);
  /**
   * What is left of the current hold when it is interrupted, tagged with the
   * step it belongs to. Without this, pausing or scrolling away threw the
   * elapsed time out and a beat interrupted 100ms from its end waited its
   * whole duration over again on resume, which reads as the demo hanging.
   * The tag is what keeps a hand scrub honest: jumping to another chapter
   * finds no carry-over for that step and starts it at full length.
   */
  const remainingRef = useRef<{ step: number; ms: number } | null>(null);

  const restart = useCallback(() => {
    // Starting over is not resuming, so any half-spent hold goes with it.
    remainingRef.current = null;
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

    const full = (durations[step] ?? 1200) + (isLast ? restDelay : 0);
    const carried = remainingRef.current;
    const hold = carried?.step === step ? carried.ms : full;

    const startedAt = Date.now();
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      remainingRef.current = null;
      setStep((current) => (current >= lastStep ? 0 : current + 1));
    }, hold);

    return () => {
      clearTimeout(timer);
      // Only an interruption owes time to the next run. A timer that already
      // fired has handed the step on and settled its own account.
      if (!fired) {
        remainingRef.current = { step, ms: Math.max(0, hold - (Date.now() - startedAt)) };
      }
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
