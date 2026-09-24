"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";

/**
 * One word in the headline, typed and retyped, so the sentence names every
 * kind of institution it is for without becoming a list.
 *
 * Added 23 Sep 2026, alongside [[rotating-word]], which swaps its word in one
 * motion. This one types, which is slower and louder, and is the right choice
 * only where the headline is the single thing on the screen.
 *
 * The slot takes the width of what has been typed, and nothing is reserved.
 * <RotatingWord /> reserves the longest word to stop the line moving, and both
 * ways of reserving width were tried here and thrown out: against the longest
 * word, a phone showed "Give your ins&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;website" with the hole sitting in
 * the middle of the headline; against the current word, the hole was smaller
 * and still there. A headline is read at a glance and a gap in one is a
 * mistake, whereas a line that grows as a word is typed is the effect being
 * asked for. The cost is that the line recentres a character at a time, which
 * at 72ms a character is a slide rather than a jump.
 *
 * Honours prefers-reduced-motion by holding on the first word, caret and all.
 * A headline that types itself is exactly the thing that setting is for.
 *
 * The server renders the first word whole, so the headline is a finished
 * sentence before any JavaScript arrives and never paints half a word.
 */
const TYPE_MS = 72;
const DELETE_MS = 38;
const HOLD_MS = 1900;
const GAP_MS = 380;

function Caret({ className }: Readonly<{ className?: string }>) {
  return <span className={cn("ml-0.5 font-light", className)}>|</span>;
}

export function TypewriterWord({ words }: Readonly<{ words: readonly string[] }>) {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState((words[0] ?? "").length);
  const [deleting, setDeleting] = useState(false);
  const running = !usePrefersReducedMotion();

  useEffect(() => {
    if (!running) return;
    const full = (words[index] ?? "").length;
    const atEnd = !deleting && count === full;
    const atStart = deleting && count === 0;

    const id = setTimeout(
      () => {
        if (atEnd) return setDeleting(true);
        if (atStart) {
          setDeleting(false);
          return setIndex((i) => (i + 1) % words.length);
        }
        setCount((c) => c + (deleting ? -1 : 1));
      },
      atEnd ? HOLD_MS : atStart ? GAP_MS : deleting ? DELETE_MS : TYPE_MS,
    );
    return () => clearTimeout(id);
  }, [running, deleting, count, index, words]);

  return (
    <span className="inline-grid whitespace-nowrap align-baseline">
      {/* The shortest word, invisible, sharing one grid cell with the visible
          one. The cell is as wide as the wider of the two, so the slot grows
          with what is typed and never shrinks below a word: on a phone the
          headline is three lines and would otherwise drop to two for the
          moment the slot is empty, twitching the whole hero. */}
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">
        {words.reduce((a, b) => (b.length < a.length ? b : a))}
      </span>
      <span className="col-start-1 row-start-1" aria-hidden="true">
        {(words[index] ?? "").slice(0, count)}
        {running && <Caret className="animate-caret text-[var(--accent)]" />}
      </span>
      <span className="sr-only">{words.join(", ")}</span>
    </span>
  );
}
